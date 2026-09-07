/**
 * Edge Function: life-send-reminders
 *
 * EdgeX Life's daily nudge — "log your day" / "check in" / "set your
 * intention" — for the Health, Wellness and Today modules. Runs on a
 * schedule (pg_cron, every 15 minutes) so it fires whether or not the PWA
 * is open on any device, same pattern as the existing `send-reminders`
 * function (Pulse's task reminders).
 *
 * This is deliberately a SEPARATE, self-contained pipeline rather than
 * routed through the shared `notifications` / `notification_prefs` /
 * `dispatch-notification` system used by Pulse/xPM: that system's
 * PREF_COLUMNS only recognises TASK_ASSIGNED/TASK_COMPLETED/TASK_DUE/
 * COMMENT_MENTION, and extending it would mean editing a function shared by
 * other apps. Life reminders reuse the SAME `push_subscriptions` table
 * (shared across Pulse/xFocus/EdgeX Life by user_id) and the SAME
 * VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT/CRON_SECRET project
 * secrets already configured for `send-reminders`/`dispatch-notification` —
 * no new secrets needed for those. A dedicated VAPID keypair was generated
 * for Life's own push identity so its client bundle doesn't need to know
 * Pulse's key; that keypair is what LIFE_VAPID_PUBLIC_KEY/
 * LIFE_VAPID_PRIVATE_KEY hold (falls back to the shared VAPID_* names if the
 * LIFE_ ones aren't set, so this still works even before that secret exists).
 *
 * Flow, per row in life_reminder_prefs:
 *   1. Compute "now" in that user's stored IANA timezone.
 *   2. For each module (health, wellness) that's enabled: if local time has
 *      passed the configured reminder time, today hasn't already been
 *      logged (read straight off traction_data, since these RPCs are
 *      auth.uid()-scoped and this function runs with no user JWT), and no
 *      reminder was already sent today for that module — send a push to
 *      every subscription on file and stamp *_last_sent so it can't repeat.
 *   3. Intention works the same way but reads the real `daily_intentions`
 *      table (one row per user per day) and defaults to a MORNING time,
 *      since it's meant to be set at the start of the day, not caught up on.
 *   4. Clean up subscriptions that come back 404/410 (gone).
 *
 * Auth: invoked by pg_cron via net.http_post with the SERVICE ROLE key
 * implicit (this function itself authenticates to Postgres with the service
 * role), guarded by the same x-cron-secret header pattern as the other
 * scheduled functions. Not meant to be called from a browser.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("LIFE_VAPID_PUBLIC_KEY") ?? Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("LIFE_VAPID_PRIVATE_KEY") ?? Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:jack@theedgex.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type ReminderModule = "health" | "wellness" | "intention";

type ReminderPrefRow = {
  user_id: string;
  timezone: string;
  health_enabled: boolean;
  health_time: string; // "HH:MM:SS"
  health_last_sent: string | null; // "YYYY-MM-DD"
  wellness_enabled: boolean;
  wellness_time: string;
  wellness_last_sent: string | null;
  intention_enabled: boolean;
  intention_time: string;
  intention_last_sent: string | null;
};

type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };

/** "YYYY-MM-DD" and "HH:MM" for `tz`, computed without pulling in a date lib. */
function localParts(tz: string): { date: string; hm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  // Some engines render midnight as "24:00" under hour12:false — normalize.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${hour}:${parts.minute}`,
  };
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 503, headers: { "content-type": "application/json" },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rawPrefs, error: prefErr } = await supabase
    .from("life_reminder_prefs")
    .select("user_id, timezone, health_enabled, health_time, health_last_sent, wellness_enabled, wellness_time, wellness_last_sent, intention_enabled, intention_time, intention_last_sent");
  if (prefErr) {
    console.error("[life-send-reminders] prefs query:", prefErr);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const prefs = (rawPrefs ?? []) as ReminderPrefRow[];
  let sent = 0;
  const staleEndpoints: string[] = [];
  const results: Record<string, unknown>[] = [];

  for (const p of prefs) {
    const tz = p.timezone || "America/Los_Angeles";
    const { date: localDate, hm } = localParts(tz);

    const due: { module: ReminderModule; title: string; body: string; url: string }[] = [];

    if (p.health_enabled && hm >= (p.health_time || "20:00").slice(0, 5) && p.health_last_sent !== localDate) {
      const { data: row } = await supabase
        .from("traction_data").select("value")
        .eq("user_id", p.user_id).eq("key", "edgex_health_v1").maybeSingle();
      const loggedToday = Boolean((row?.value as any)?.logs?.[localDate]);
      if (!loggedToday) {
        due.push({
          module: "health", title: "Log your day",
          body: "Sleep, steps, water, energy. A minute now keeps the Health Score current.",
          url: "/health",
        });
      } else {
        // Already logged — stamp it as handled so this doesn't re-check
        // every 15 minutes for the rest of the day, without sending anything.
        await supabase.from("life_reminder_prefs")
          .update({ health_last_sent: localDate }).eq("user_id", p.user_id);
      }
    }

    if (p.wellness_enabled && hm >= (p.wellness_time || "20:00").slice(0, 5) && p.wellness_last_sent !== localDate) {
      const { data: row } = await supabase
        .from("traction_data").select("value")
        .eq("user_id", p.user_id).eq("key", "edgex_wellness_v1").maybeSingle();
      const entries = (row?.value as any)?.checkins?.[localDate];
      const loggedToday = Array.isArray(entries) && entries.length > 0;
      if (!loggedToday) {
        due.push({
          module: "wellness", title: "Check in",
          body: "Mood, stress, clarity, groundedness. Thirty seconds is enough.",
          url: "/wellness",
        });
      } else {
        await supabase.from("life_reminder_prefs")
          .update({ wellness_last_sent: localDate }).eq("user_id", p.user_id);
      }
    }

    if (p.intention_enabled && hm >= (p.intention_time || "08:00").slice(0, 5) && p.intention_last_sent !== localDate) {
      const { data: row } = await supabase
        .from("daily_intentions").select("id")
        .eq("user_id", p.user_id).eq("date", localDate).maybeSingle();
      if (!row) {
        due.push({
          module: "intention", title: "Set today's intention",
          body: "Name what today is for, before the day names it for you.",
          url: "/",
        });
      } else {
        await supabase.from("life_reminder_prefs")
          .update({ intention_last_sent: localDate }).eq("user_id", p.user_id);
      }
    }

    if (!due.length) continue;

    const { data: rawSubs } = await supabase
      .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.user_id);
    const subs = (rawSubs ?? []) as PushSub[];

    for (const item of due) {
      const patch: Record<string, string> = {};
      if (subs.length === 0) {
        // Nothing to deliver to, but still mark handled so it doesn't spin.
        patch[`${item.module}_last_sent`] = localDate;
        await supabase.from("life_reminder_prefs").update(patch).eq("user_id", p.user_id);
        continue;
      }

      const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url, type: `LIFE_${item.module.toUpperCase()}` });
      let delivered = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) staleEndpoints.push(s.endpoint);
          else console.error("[life-send-reminders] push:", item.module, e?.message || e);
        }
      }
      sent += delivered;
      patch[`${item.module}_last_sent`] = localDate;
      await supabase.from("life_reminder_prefs").update(patch).eq("user_id", p.user_id);
      results.push({ user_id: p.user_id, module: item.module, delivered, of: subs.length });
    }
  }

  if (staleEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return new Response(JSON.stringify({ sent, checked: prefs.length, results, stale: staleEndpoints.length }), {
    headers: { "content-type": "application/json" },
  });
});
