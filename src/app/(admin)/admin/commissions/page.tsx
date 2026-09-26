import { buildReport, pickYear } from '@/lib/commissions/report'
import {
  getCommissionEarningRows,
  getLastCommissionSyncAt,
  getPaidCentsByArtist,
  getPayableArtists,
  getRecentPayouts
} from '@/lib/db/queries/commissions'
import type { Route } from 'next'
import Link from 'next/link'
import { PayoutForm } from './_components/PayoutForm'
import { SyncButton } from './_components/SyncButton'

// Reads the DB per-request and runs admin-only Square/payout actions.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Commissions — Animeniacs' }

function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function monthLabel(yearMonth: string): string {
  return new Date(`${yearMonth}-01T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC'
  })
}

const th = 'px-3 py-2 font-medium whitespace-nowrap'
const td = 'px-3 py-2 whitespace-nowrap'

export default async function CommissionsPage({
  searchParams
}: {
  searchParams: { year?: string | string[] }
}): Promise<JSX.Element> {
  const [rows, lastSync, paidByArtist, payableArtists, recentPayouts] = await Promise.all([
    getCommissionEarningRows(),
    getLastCommissionSyncAt(),
    getPaidCentsByArtist(),
    getPayableArtists(),
    getRecentPayouts()
  ])
  const report = buildReport(rows)
  const requested = Array.isArray(searchParams.year) ? searchParams.year[0] : searchParams.year
  const { years, year, months } = pickYear(report.months, requested)
  const yearTotal = (byMonth: Record<string, number>) =>
    months.reduce((s, m) => s + (byMonth[m] ?? 0), 0)

  // Grand totals across payable, real artists (exclude house + unattributed).
  let totMade = 0
  let totPaid = 0
  let totYear = 0
  for (const a of report.artists) {
    if (!a.payable || a.artistName === 'Unattributed') continue
    totMade += a.totalCents
    totYear += yearTotal(a.byMonth)
    totPaid += a.artistId ? (paidByArtist.get(a.artistId) ?? 0) : 0
  }

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        Artist commissions &amp; payouts
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Commission = each artist’s rate × net item sales (after discounts), both locations, all
        history. <strong className="text-bone">Balance owed</strong> = made − paid (negative means
        you’ve advanced them). House accounts are shown but not owed; “Unattributed” needs catalog
        cleanup.
        {lastSync
          ? ` Last synced ${lastSync.toLocaleString('en-US', { timeZone: 'America/Chicago' })}.`
          : ' Never synced — run a sync to populate.'}
      </p>

      <div className="mt-4">
        <SyncButton />
      </div>

      {report.artists.length === 0 ? (
        <p className="mt-6 text-muted">No commission data yet. Click “Sync from Square”.</p>
      ) : (
        <>
          <nav className="mt-6 flex gap-2">
            {years.map((y) => (
              <Link
                key={y}
                href={`/admin/commissions?year=${y}` as Route}
                className={
                  y === year
                    ? 'rounded-full border border-neon bg-neon/15 px-3 py-1 text-sm text-neon-soft hover:no-underline'
                    : 'rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-line-strong hover:text-bone hover:no-underline'
                }
              >
                {y}
              </Link>
            ))}
          </nav>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line-strong text-muted">
                  <th className={`${th} text-left`}>Artist</th>
                  {months.map((m) => (
                    <th key={m} className={`${th} text-right`}>
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className={`${th} border-l-2 border-line-strong text-right`}>{year} total</th>
                  <th className={`${th} border-l-2 border-line-strong text-right`}>
                    Total made (all-time)
                  </th>
                  <th className={`${th} text-right`}>Total paid</th>
                  <th className={`${th} text-right`}>Balance owed</th>
                </tr>
              </thead>
              <tbody>
                {report.artists.map((a) => {
                  const muted = !a.payable || a.artistName === 'Unattributed'
                  const paid = a.artistId ? (paidByArtist.get(a.artistId) ?? 0) : 0
                  const balance = a.totalCents - paid
                  return (
                    <tr
                      key={a.artistId ?? a.artistName}
                      className={`border-b border-line hover:bg-wall-2 ${muted ? 'text-faint' : 'text-bone'}`}
                    >
                      <td className={`${td} text-left font-semibold`}>
                        {a.artistName}
                        {!a.payable && a.artistName !== 'Unattributed' && (
                          <span className="font-normal text-faint"> (house)</span>
                        )}
                      </td>
                      {months.map((m) => (
                        <td key={m} className={`${td} text-right font-mono`}>
                          {a.byMonth[m] ? money(a.byMonth[m]) : '—'}
                        </td>
                      ))}
                      <td
                        className={`${td} border-l-2 border-line-strong text-right font-mono font-semibold`}
                      >
                        {money(yearTotal(a.byMonth))}
                      </td>
                      <td
                        className={`${td} border-l-2 border-line-strong text-right font-mono font-semibold`}
                      >
                        {money(a.totalCents)}
                      </td>
                      <td className={`${td} text-right font-mono font-semibold`}>
                        {paid ? money(paid) : '—'}
                      </td>
                      <td
                        className={`${td} text-right font-mono font-bold ${
                          balance < 0 ? 'text-amber-400' : muted ? 'text-faint' : 'text-bone'
                        }`}
                        title={balance < 0 ? 'Advanced (artist owes shop)' : 'Owed to artist'}
                      >
                        {money(balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-strong font-bold text-bone">
                  <td className={`${td} text-left`}>Payable totals</td>
                  {months.map((m) => (
                    <td key={m} className={td} />
                  ))}
                  <td className={`${td} border-l-2 border-line-strong text-right font-mono`}>
                    {money(totYear)}
                  </td>
                  <td className={`${td} border-l-2 border-line-strong text-right font-mono`}>
                    {money(totMade)}
                  </td>
                  <td className={`${td} text-right font-mono`}>{money(totPaid)}</td>
                  <td className={`${td} text-right font-mono`}>{money(totMade - totPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <h2 className="eyebrow mt-8 text-purple-soft">Record a payout</h2>
      <div className="mt-3">
        <PayoutForm artists={payableArtists} />
      </div>

      {recentPayouts.length > 0 && (
        <>
          <h2 className="eyebrow mt-8 text-purple-soft">Recent payouts</h2>
          <table className="mt-3 border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-muted">
                <th className={th}>Date</th>
                <th className={th}>Artist</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Method</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {recentPayouts.map((p) => (
                <tr key={p.id} className="border-b border-line hover:bg-wall-2">
                  <td className={`${td} text-muted`}>
                    {p.paidAt.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  </td>
                  <td className={`${td} text-bone`}>{p.artistName}</td>
                  <td className={`${td} text-right font-mono text-bone`}>{money(p.amountCents)}</td>
                  <td className={`${td} text-muted`}>{p.method ?? '—'}</td>
                  <td className={`${td} text-muted`}>{p.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-4 text-xs text-faint">
        Figures are pre-refund (refund clawback is a tracked follow-up).
      </p>
    </div>
  )
}
