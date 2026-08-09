import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ModuleHeader, ModuleBody } from '../components/shell/Shell'
import { Panel, Loading, Field } from '../components/ui/Kit'
import { formatBytes, getLedger, resetLedger, subscribeLedger } from '../lib/egress'
import { clearVisionCache, getVisionImage } from '../lib/imageCache'
import {
  refreshAll, fetchLegacyVision, dropLegacyVision, uploadVisionImage,
  fetchReminderPrefs, saveReminderPrefs, savePushSubscription, removePushSubscription,
} from '../lib/data'
import { useAuth } from '../store/authStore'
import { useAsync } from '../hooks/useAsync'
import { pushSupported, notificationPermission, subscribeToPush, unsubscribeFromPush, subscriptionToRow } from '../lib/push'

export default function SettingsPage() {
  const [ledger, setLedger] = useState(getLedger())
  const { user, signOut } = useAuth()
  useEffect(() => subscribeLedger(setLedger), [])

  const rows = Object.entries(ledger.byName).sort((a, b) => b[1] - a[1])

  return (
    <>
      <ModuleHeader title="Settings" views={[{ key: 's', label: 'Data & caching' }]}
        view="s" onView={() => {}} />
      <ModuleBody>
        <div className="grid gap-3.5 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3.5">
            <Panel title={`Egress this month (${ledger.month})`}
              actions={<span className="chip">{ledger.calls} reads</span>}>
              <div className="lf-display tnum text-[30px]" style={{ color: 'var(--accent)' }}>
                {formatBytes(ledger.bytes)}
              </div>
              <p className="text-[12.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
                Counted client-side. Cached reads cost nothing and aren't double counted.
                This project once blew its free-tier allowance, so the number is kept
                visible rather than assumed.
              </p>
            </Panel>

            {rows.length > 0 && (
              <Panel title="By query" bodyClass="">
                {rows.map(([name, bytes]) => (
                  <div key={name} className="row">
                    <span className="text-[13px] flex-1 min-w-0 truncate"
                      style={{ color: 'var(--ink-2)' }}>{name}</span>
                    <span className="text-[13px] tnum">{formatBytes(bytes)}</span>
                  </div>
                ))}
              </Panel>
            )}

            <LegacyMigration />
          </div>

          <div className="flex flex-col gap-3.5">
            <ReminderPanel />

            <Panel title="Caches">
              <div className="flex flex-col gap-2">
                <button className="btn" onClick={() => {
                  refreshAll(); toast.success('Cleared — next load refetches')
                }}>Clear data cache</button>
                <button className="btn" onClick={async () => {
                  await clearVisionCache(); toast.success('Vision images cleared')
                }}>Clear vision image cache</button>
                <button className="btn" onClick={() => {
                  resetLedger(); toast.success('Counter reset')
                }}>Reset egress counter</button>
              </div>
            </Panel>

            <Panel title="Account">
              <p className="text-[13px] mb-3" style={{ color: 'var(--ink-2)' }}>{user?.email}</p>
              <p className="text-[12px] mb-3" style={{ color: 'var(--ink-4)' }}>
                Shared with Pulse and xFocus — same Supabase project, same user id.
              </p>
              <button className="btn" onClick={signOut}>Sign out</button>
            </Panel>
          </div>
        </div>
      </ModuleBody>
    </>
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
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          This browser doesn't support push notifications.
        </p>
      ) : permission === 'granted' ? (
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 16 }}>
          <span className="chip" style={{ background: 'var(--green-light, #dcfce7)', color: '#16a34a' }}>
            Enabled on this device
          </span>
          <button className="btn btn-sm" onClick={disable} disabled={subBusy}>
            {subBusy ? 'Working…' : 'Turn off'}
          </button>
        </div>
      ) : permission === 'denied' ? (
        <p className="text-[13px] mb-3" style={{ color: 'var(--ink-3)' }}>
          Notifications are blocked for this site — enable them in your browser's site settings, then reload.
        </p>
      ) : (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={enable} disabled={subBusy}>
          {subBusy ? 'Enabling…' : 'Enable reminders on this device'}
        </button>
      )}

      <div className="flex flex-col gap-3">
        <div className="row" style={{ alignItems: 'center' }}>
          <label className="flex items-center gap-2 text-[13px]" style={{ flex: 1 }}>
            <input type="checkbox" checked={p.health_enabled}
              onChange={(e) => setForm({ ...p, health_enabled: e.target.checked })} />
            Health — log your day
          </label>
          <input type="time" value={p.health_time} style={{ width: 110 }}
            onChange={(e) => setForm({ ...p, health_time: e.target.value })} />
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <label className="flex items-center gap-2 text-[13px]" style={{ flex: 1 }}>
            <input type="checkbox" checked={p.wellness_enabled}
              onChange={(e) => setForm({ ...p, wellness_enabled: e.target.checked })} />
            Wellness — check in
          </label>
          <input type="time" value={p.wellness_time} style={{ width: 110 }}
            onChange={(e) => setForm({ ...p, wellness_time: e.target.value })} />
        </div>
      </div>
      <p className="text-[11.5px] mt-2" style={{ color: 'var(--ink-4)' }}>
        Only fires if that module hasn't been logged yet that day — once you log, it stays quiet.
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
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
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
      <p className="text-[13px] mb-1" style={{ color: 'var(--ink-2)' }}>
        {items.length} photos ({formatBytes(bytes)}) are still stored as base64 inside a
        single database row.
      </p>
      <p className="text-[12.5px] mb-3.5" style={{ color: 'var(--ink-3)' }}>
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
