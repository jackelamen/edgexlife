# EdgeX Life

Goals, Health and Wellness for The EDGEx — the three modules that were worth
keeping from the flat-HTML traction hub, rebuilt as one installable PWA and
wired into Pulse.

Sibling apps: **Pulse** (tasks, habits), **xFocus** (deep work), **xPM**
(projects, CRM). All four share the cloud Supabase project
`mdkyijbgvxedelcqcouu`.

---

## Why one app instead of three

Goals, Health and Wellness are reflective, low-frequency, and heavily
cross-referencing — a habit is the daily edge of a goal, a check-in is the
daily edge of wellness. Splitting them the way Work split (into xPM / xFocus /
Pulse) would have produced three apps you open once a week each. The `/` Today
page is the payoff: it's the only screen that reads across all three at once.

## Egress: read this before adding a query

This Supabase project once blew its free-tier egress allowance. The cause is
now known and documented, and the fix is structural rather than a matter of
being careful:

| Read | Before | Now |
|---|---|---|
| Vision board (goals page load) | **1,554 kB** every load | **1,035 bytes** + images on demand, cached forever |
| Wellness journal | 363 kB blob | date-windowed slice |
| Health logs | 7 kB blob | date-windowed slice |

The legacy modules stored everything as one giant JSONB blob per feature in
`traction_data`, including 15 base64 JPEGs totalling 1.5 MB, and re-read the
whole blob on every page load.

**Rules this codebase holds to:**

1. Nothing reads `traction_data` directly. Reads go through the `life_*`
   Postgres functions, which slice server-side.
2. No `select('*')` anywhere. Columns are always named.
3. Every history read is date-bounded. `useDataWindow` sizes the window from a
   dates-only index so a page never fetches payloads just to discover it has
   nothing to show.
4. Realtime is disabled at the client level.
5. Every byte is counted. `Settings → Egress this month` shows a live
   client-side ledger broken down by query name, so a regression is visible
   instead of silent.

Vision-board images are fetched one at a time via `life_vision_image(id)` when
a tile scrolls into view, then stored in the Cache Storage API permanently —
each photo crosses the network at most once, ever.

### Database functions

Applied as migrations on `mdkyijbgvxedelcqcouu`, all `security definer` and
scoped to `auth.uid()`, granted to `authenticated` only:

| Function | Returns |
|---|---|
| `life_vision_board()` | image metadata, no `src` |
| `life_vision_image(p_item_id)` | one image's base64 |
| `life_health_index()` | log dates only |
| `life_health_logs(from, to)` | day payloads in range |
| `life_health_settings()` | targets |
| `life_wellness_index()` | check-in dates + counts |
| `life_wellness_checkins(from, to)` | entries in range |
| `life_wellness_notes()` | thoughts + practices |
| `life_goal_rollup()` | per-goal open task / habit counts |

Writes merge server-side, so saving one check-in uploads a few hundred bytes
instead of rewriting the whole 363 kB blob the way the old modules did:
`life_save_health_log`, `life_delete_health_log`, `life_save_health_settings`,
`life_save_routines`, `life_set_routine_check`, `life_save_workout_plan`,
`life_add_workout_session`, `life_delete_workout_session`,
`life_save_checkin`, `life_delete_checkin`, `life_save_thought`,
`life_delete_thought`, `life_add_practice`, `life_delete_practice`.

New vision photos go to the private `life-vision` Storage bucket (RLS scoped
to your own uid folder) via `vision_items`. The 15 legacy base64 photos stay
readable until you run **Settings → Move to Storage**, which copies each one
out and calls `life_drop_legacy_vision` to remove it from the blob.

Schema additions (additive and nullable, so Pulse and xFocus are unaffected):
`tasks.goal_id`, `habits.goal_id`, plus a partial unique index
`habit_logs (habit_id, logged_on) where deleted_at is null`.

## Setup

```bash
cp .env.example .env.local     # then paste the anon key
npm install
npm run dev
```

Sign in with your **Pulse** account — Life reads Pulse's `tasks` and `habits`
tables, so it must be the same user id. (xPM uses a different account and is
bridged to Pulse separately.)

### Vercel

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment
variables. `.env.local` is gitignored, and a missing key is the classic cause
of a blank deployed screen — this app shows an explicit config error instead.
`vercel.json` already carries the SPA rewrite.

## Design

Built as an app, not a page: a dark nav rail, sticky module headers with view
tabs, toolbars, modals and inline editing, dense rows over whitespace.

**Per-module accents, inherited from the originals.** A neutral graphite
chassis never changes; one accent swaps when you move between modules, so each
section still reads as the app it replaces:

| Module | Accent | From |
|---|---|---|
| Goals | emerald `#059669` | goals.html |
| Health | sky `#0ea5e9` | health.html |
| Wellness | violet `#7c3aed` | wellness.html |

The switch is a single attribute: `<html data-module>`, set by `useModuleTheme`
in `Shell.jsx`. Every accent-coloured control reads `--accent` /
`--accent-dark` / `--accent-light` / `--accent-ring`, so no component ever
hardcodes a module colour. Semantic colours (good / warn / bad) are never
module-tinted.

Type is Fraunces for headings and Archivo for UI — deliberately not Inter.

## Structure

```
src/
  lib/
    supabase.js    client (realtime off)
    egress.js      cached queries + byte ledger    ← read this first
    imageCache.js  vision photos, Cache Storage
    data.js        EVERY read in the app
    dates.js       windows and formatting
  hooks/           useAsync, useDataWindow
  pages/           Today, Goals, Health, Wellness, Settings, Login
  components/      shell, goals, health, common
```

## Views

Full parity with the three original modules, 19 views in total.

**Goals** — Today (live cycles, tactics, vision board, vision statements),
Goal Room (CRUD, metrics, task/habit linking), Focus Cycles (phases +
tactics), Roadmap, Retrospectives.

**Health** — Dashboard (Health Score, coach, routine checklist), Log (list +
full entry editor with live score preview), Routines library, Workouts
(weekly plan, session history), Trends (metric charts + driver hit rates),
Settings (targets).

**Wellness** — Dashboard (Clarity Score, coach), Check in, Reset tools,
Meditate (breath pacer with 5 patterns), Open loops inbox, Journal, Trends.

### Score engines

Both are ported verbatim from the originals in `src/lib/scores.js`, so
historical numbers stay continuous. Changing a weight silently re-reads every
past score, so don't.

| Health Score | | Clarity Score | |
|---|---|---|---|
| sleep | .28 | mood | .22 |
| energy | .22 | stress ease | .24 |
| steps | .18 | clarity | .28 |
| sleep quality | .18 | grounded | .26 |
| water | .14 | | |
| *minus* pain × 7 | | | |

## Not done yet

- Samsung Health / wearable import (the old health module read
  `edgex_daily_signals_v2`)
- Meditation music player
- Savings targets on goals
- Retiring `goals.html` / `health.html` / `wellness.html` from traction-hub
