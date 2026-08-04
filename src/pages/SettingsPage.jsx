import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { formatBytes, getLedger, resetLedger, subscribeLedger } from '../lib/egress'
import { clearVisionCache } from '../lib/imageCache'
import { refreshAll } from '../lib/data'
import { PageHead, Section } from '../components/common/Bits'
import { useAuth } from '../store/authStore'

export default function SettingsPage() {
  const [ledger, setLedger] = useState(getLedger())
  const { user, signOut } = useAuth()

  useEffect(() => subscribeLedger(setLedger), [])

  const rows = Object.entries(ledger.byName).sort((a, b) => b[1] - a[1])

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Data and caching"
        sub="This app keeps a running count of everything it pulls from Supabase, so a costly query shows up here instead of on a bill."
      />

      <Section title={`Egress this month (${ledger.month})`} note={`${ledger.calls} reads`}>
        <div className="lf-card px-5 py-5 mb-3">
          <div className="lf-display text-[34px]" style={{ color: 'var(--ever)' }}>
            {formatBytes(ledger.bytes)}
          </div>
          <p className="text-[13px] mt-1" style={{ color: 'var(--ink-3)' }}>
            counted client-side, since the 1st. Cached reads cost nothing and are
            not counted twice.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="lf-card divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows.map(([name, bytes]) => (
              <div key={name} className="px-4 py-2.5 flex items-center justify-between text-[13.5px]">
                <span style={{ color: 'var(--ink-2)' }}>{name}</span>
                <span>{formatBytes(bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Caches">
        <div className="flex flex-wrap gap-2">
          <button
            className="lf-btn"
            onClick={() => { refreshAll(); toast.success('Data cache cleared — next load refetches') }}
          >
            Clear data cache
          </button>
          <button
            className="lf-btn"
            onClick={async () => { await clearVisionCache(); toast.success('Vision images cleared') }}
          >
            Clear vision images
          </button>
          <button className="lf-btn" onClick={() => { resetLedger(); toast.success('Counter reset') }}>
            Reset counter
          </button>
        </div>
        <p className="text-[12.5px] mt-3 max-w-[60ch]" style={{ color: 'var(--ink-3)' }}>
          Vision-board photos are stored as base64 inside one database row, so they
          are fetched individually and kept in the browser cache permanently.
          Clearing them means re-downloading roughly 1.5 MB the next time you open
          the Goals page.
        </p>
      </Section>

      <Section title="Account">
        <p className="text-[13.5px] mb-3" style={{ color: 'var(--ink-2)' }}>
          Signed in as {user?.email}
        </p>
        <button className="lf-btn" onClick={signOut}>Sign out</button>
      </Section>
    </>
  )
}
