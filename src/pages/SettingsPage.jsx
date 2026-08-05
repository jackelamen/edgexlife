import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ModuleHeader, ModuleBody } from '../components/shell/Shell'
import { Panel, Loading } from '../components/ui/Kit'
import { formatBytes, getLedger, resetLedger, subscribeLedger } from '../lib/egress'
import { clearVisionCache, getVisionImage } from '../lib/imageCache'
import { refreshAll, fetchLegacyVision, dropLegacyVision, uploadVisionImage } from '../lib/data'
import { useAuth } from '../store/authStore'

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
