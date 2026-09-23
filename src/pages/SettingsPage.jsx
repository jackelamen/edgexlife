import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ModuleHeader, ModuleBody } from '../components/shell/Shell'
import { Panel, Loading, Field, Tabs } from '../components/ui/Kit'
import Icon from '../components/ui/Icon'
import { formatBytes, getLedger, resetLedger, subscribeLedger } from '../lib/egress'
import { clearVisionCache, getVisionImage } from '../lib/imageCache'
import {
  refreshAll, fetchLegacyVision, dropLegacyVision, uploadVisionImage,
  fetchReminderPrefs, saveReminderPrefs, savePushSubscription, removePushSubscription,
  fetchHealthSettings, fetchWellnessIndex, fetchWellnessNotes,
} from '../lib/data'
import { useAuth } from '../store/authStore'
import { useAsync } from '../hooks/useAsync'
import { pushSupported, notificationPermission, subscribeToPush, unsubscribeFromPush, subscriptionToRow } from '../lib/push'
import { getTheme, setTheme } from '../lib/theme'
// Health and Wellness's own Settings tabs moved here (see the VIEWS
// comment in each of those files) — 7 and 8 tabs respectively left most
// of the tab strip off a phone's screen. Reusing the components rather
// than rewriting them: same file they always lived in, same props, this
// page just builds the instances they need and renders them.
import { SettingsView as HealthSettingsView } from './HealthPage'
import { SettingsView as WellnessSettingsView } from './WellnessPage'

/* Ordered for what you'd actually open Settings to change day to day —
   Appearance, Reminders, then each module's own settings — with your
   account last. Egress/query breakdown/legacy migration/cache buttons
   are all diagnostics you'd check once in a while, not on the way to
   changing a reminder time, so they're collapsed under one disclosure at
   the very bottom instead of being the first thing you scroll past. */
export default function SettingsPage() {
  const { user, signOut } = useAuth()

  return (
    <>
      <ModuleHeader title="Settings" views={[{ key: 's', label: 'Data & caching' }]}
        view="s" onView={() => {}} />
      <ModuleBody>
        <div className="grid gap-3.5 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5">
            <AppearancePanel />
            <ReminderPanel />
          </div>
          <div className="flex flex-col gap-3.5">
            <HealthSettings />
            <WellnessSettings />
          </div>
        </div>

        <div className="flex flex-col gap-3.5" style={{ marginTop: 14 }}>
          <Panel title="Account">
            <p className="text-[13px] mb-3" style={{ color: 'var(--text-2)' }}>{user?.email}</p>
            <p className="text-[12px] mb-3" style={{ color: 'var(--text-3)' }}>
              Shared with Pulse and xFocus, same Supabase project, same user id.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out</button>
          </Panel>

          <DataDiagnostics />
        </div>
      </ModuleBody>
    </>
  )
}

/**
 * Dark mode was follow-the-OS only at first — no in-app toggle, since
 * there was no settings surface for one yet. This is that toggle: System
 * defers to the OS/browser preference (the original behavior); Light and
 * Dark pin it regardless. See lib/theme.js for how the choice survives a
 * reload without a flash of the other theme.
 */
function AppearancePanel() {
  const [theme, setThemeState] = useState(getTheme())
  const OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]
  return (
    <Panel title="Appearance">
      <Tabs value={theme} onChange={(v) => { setTheme(v); setThemeState(v) }} options={OPTIONS} />
      <p className="text-[12px] mt-2" style={{ color: 'var(--text-3)' }}>
        System matches your device's own light/dark setting.
      </p>
    </Panel>
  )
}

/**
 * Egress this month, the by-query breakdown, the legacy vision-photo
 * migration, and the cache-clearing buttons — four panels nobody opens
 * Settings FOR, moved behind one disclosure so they're still one tap
 * away without being the first thing between you and Reminders. Plain
 * <details>/<summary> rather than more component state: it's free
 * keyboard/screen-reader support and doesn't need a hook.
 */
function DataDiagnostics() {
  const [ledger, setLedger] = useState(getLedger())
  useEffect(() => subscribeLedger(setLedger), [])
  const rows = Object.entries(ledger.byName).sort((a, b) => b[1] - a[1])

  return (
    <details className="card card-pad settings-diagnostics">
      <summary>
        <span>Data &amp; diagnostics</span>
        <Icon name="expand_more" size={20} />
      </summary>
      <div className="flex flex-col gap-3.5" style={{ marginTop: 14 }}>
        <Panel title={`Egress this month (${ledger.month})`}
          actions={<span className="chip">{ledger.calls} reads</span>}>
          <div className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--accent)' }}>
            {formatBytes(ledger.bytes)}
          </div>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-3)' }}>
            Counted client-side. Cached reads cost nothing and aren't double counted.
            This project once blew its free-tier allowance, so the number is kept
            visible rather than assumed.
          </p>
        </Panel>

        {rows.length > 0 && (
          <Panel title="By query" bodyClass="">
            {rows.map(([name, bytes]) => (
              <div key={name} className="settings-row">
                <span className="text-[13px] flex-1 min-w-0 truncate"
                  style={{ color: 'var(--text-2)' }}>{name}</span>
                <span className="text-[13px] tnum">{formatBytes(bytes)}</span>
              </div>
            ))}
          </Panel>
        )}

        <LegacyMigration />

        <Panel title="Caches">
          <div className="flex flex-col gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => {
              refreshAll(); toast.success('Cleared. Next load refetches')
            }}>Clear data cache</button>
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              await clearVisionCache(); toast.success('Vision images cleared')
            }}>Clear vision image cache</button>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              resetLedger(); toast.success('Counter reset')
            }}>Reset egress counter</button>
          </div>
        </Panel>
      </div>
    </details>
  )
}

/**
 * "No reminders. A daily nudge at a time you pick would matter more than
 * any dashboard polish, given the staleness problem." — this is that nudge.
 * Real Web Push, server-triggered (life-send-reminders on pg_cron, every
 * 15 min) so it fires whether or not the PWA is open. Enabling is one
 * button (requests Notification permission, subscribes this browser,
 * saves the subscription); the two toggles below control WHEN and WHETHER
 * each module nudges, stored in life_reminder_prefs and read by the same
 * edge function server-side.
 */
function ReminderPanel() {
  const prefs = useAsync((f) => fetchReminderPrefs({ force: f }))
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [subBusy, setSubBusy] = useState(false)
  const [permission, setPermission] = useState(notificationPermission())

  const p = form ?? prefs.data
  const supported = pushSupported()

  if (prefs.loading || !p) return <Panel title="Reminders"><Loading /></Panel>

  async function enable() {
    setSubBusy(true)
    try {
      const sub = await subscribeToPush()
      await savePushSubscription(subscriptionToRow(sub))
      setPermission(notificationPermission())
      toast.success('Reminders enabled on this device')
    } catch (e) { toast.error(e.message) } finally { setSubBusy(false) }
  }

  async function disable() {
    setSubBusy(true)
    try {
      const sub = await unsubscribeFromPush()
      if (sub) await removePushSubscription(sub.endpoint)
      setPermission(notificationPermission())
      toast.success('Reminders turned off on this device')
    } catch (e) { toast.error(e.message) } finally { setSubBusy(false) }
  }

  async function save() {
    setSaving(true)
    try {
      await saveReminderPrefs(p)
      toast.success('Reminder settings saved')
      prefs.reload(); setForm(null)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Panel title="Reminders" sub="A daily nudge to log, server-sent even if the app is closed.">
      {!supported ? (
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
          This browser doesn't support push notifications.
        </p>
      ) : permission === 'granted' ? (
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 16 }}>
          <span className="chip chip-good">
            Enabled on this device
          </span>
          <button className="btn btn-secondary btn-sm" onClick={disable} disabled={subBusy}>
            {subBusy ? 'Working…' : 'Turn off'}
          </button>
        </div>
      ) : permission === 'denied' ? (
        <p className="text-[13px] mb-3" style={{ color: 'var(--text-3)' }}>
          Notifications are blocked for this site. Enable them in your browser's site settings, then reload.
        </p>
      ) : (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={enable} disabled={subBusy}>
          {subBusy ? 'Enabling…' : 'Enable reminders on this device'}
        </button>
      )}

      <div className="flex flex-col gap-3">
        <div className="settings-row">
          <label className="flex items-center gap-2 text-[13px]" style={{ flex: 1 }}>
            <input type="checkbox" checked={p.health_enabled}
              onChange={(e) => setForm({ ...p, health_enabled: e.target.checked })} />
            Health · log your day
          </label>
          <input type="time" value={p.health_time} style={{ width: 150, flexShrink: 0 }}
            onChange={(e) => setForm({ ...p, health_time: e.target.value })} />
        </div>
        <div className="settings-row">
          <label className="flex items-center gap-2 text-[13px]" style={{ flex: 1 }}>
            <input type="checkbox" checked={p.wellness_enabled}
              onChange={(e) => setForm({ ...p, wellness_enabled: e.target.checked })} />
            Wellness · check in
          </label>
          <input type="time" value={p.wellness_time} style={{ width: 150, flexShrink: 0 }}
            onChange={(e) => setForm({ ...p, wellness_time: e.target.value })} />
        </div>
        <div className="settings-row">
          <label className="flex items-center gap-2 text-[13px]" style={{ flex: 1 }}>
            <input type="checkbox" checked={p.intention_enabled}
              onChange={(e) => setForm({ ...p, intention_enabled: e.target.checked })} />
            Intention · name your day
          </label>
          <input type="time" value={p.intention_time} style={{ width: 150, flexShrink: 0 }}
            onChange={(e) => setForm({ ...p, intention_time: e.target.value })} />
        </div>
      </div>
      <p className="text-[11.5px] mt-2" style={{ color: 'var(--text-3)' }}>
        Each one only fires if that day's entry isn't already done. Once you log or set it, it stays quiet.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!form || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save reminder times'}
      </button>
    </Panel>
  )
}

/**
 * One-time move of the legacy base64 vision photos out of the gs2_vb JSONB
 * blob and into the life-vision Storage bucket. Costs ~1.5 MB once and
 * permanently removes the row that caused the original egress blowout.
 */
function LegacyMigration() {
  const [items, setItems] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => { fetchLegacyVision().then(setItems).catch(() => setItems([])) }, [])

  if (items == null) return <Panel title="Legacy vision photos"><Loading /></Panel>

  const bytes = items.reduce((n, i) => n + (i.bytes || 0), 0)

  if (!items.length) {
    return (
      <Panel title="Legacy vision photos">
        <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
          All vision photos are in Storage. Nothing left in the JSONB blob.
        </p>
      </Panel>
    )
  }

  async function migrate() {
    setRunning(true)
    let moved = 0
    try {
      for (const item of items) {
        const dataUrl = await getVisionImage(item.id)
        if (!dataUrl?.startsWith('data:')) continue
        const blob = await (await fetch(dataUrl)).blob()
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const file = new File([blob], `vision-${item.id}.${ext}`, { type: blob.type })
        await uploadVisionImage(file, { area: item.area, caption: item.caption })
        await dropLegacyVision(item.id)
        moved += 1
        setProgress(moved)
      }
      toast.success(`Moved ${moved} photos to Storage`)
      setItems(await fetchLegacyVision({ force: true }))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Panel title="Legacy vision photos">
      <p className="text-[13px] mb-1" style={{ color: 'var(--text-2)' }}>
        {items.length} photos ({formatBytes(bytes)}) are still stored as base64 inside a
        single database row.
      </p>
      <p className="text-[12.5px] mb-3.5" style={{ color: 'var(--text-3)' }}>
        Moving them into Storage lets Supabase's CDN serve them and removes the row that
        caused the original egress problem. This downloads each photo once, so expect
        roughly {formatBytes(bytes)} of traffic during the move.
      </p>
      <button className="btn btn-primary" onClick={migrate} disabled={running}>
        {running ? `Moving ${progress}/${items.length}…` : 'Move to Storage'}
      </button>
    </Panel>
  )
}

/**
 * Health's targets + bodyweight editor, moved here from Health's own
 * "Settings" tab. SettingsView (defined in HealthPage.jsx, exported)
 * takes the same `settings` useAsync object it always did — built fresh
 * here rather than shared with HealthPage's own instance, since the two
 * pages are never mounted at the same time.
 */
function HealthSettings() {
  const settings = useAsync((f) => fetchHealthSettings({ force: f }))
  return <HealthSettingsView settings={settings} />
}

/**
 * Wellness's manual "Sync Now" button, moved here from Wellness's own
 * "Settings" tab. `onSync` force-refetches the module-level caches
 * (invalidated already by any save; this just re-primes them) so the
 * next page that reads Wellness data gets it fresh — those caches are
 * shared across every page, not scoped to whichever page triggered
 * the refetch.
 */
function WellnessSettings() {
  const onSync = () => { fetchWellnessIndex({ force: true }); fetchWellnessNotes({ force: true }) }
  return <WellnessSettingsView onSync={onSync} />
}
