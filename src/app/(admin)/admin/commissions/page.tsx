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

  const cell: React.CSSProperties = {
    padding: '0.4rem 0.7rem',
    borderBottom: '1px solid #eee',
    textAlign: 'right',
    whiteSpace: 'nowrap'
  }
  const nameCell: React.CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 }
  const th: React.CSSProperties = { ...cell, borderBottom: '2px solid #ccc', color: '#555' }
  const totalCol: React.CSSProperties = { ...cell, borderLeft: '2px solid #ccc', fontWeight: 700 }

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
    <div
      style={{
        padding: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#111',
        background: '#fff',
        minHeight: '100vh'
      }}
    >
      <p style={{ margin: 0 }}>
        <a href="/admin" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Admin
        </a>
      </p>
      <h1 style={{ margin: '0.5rem 0 0.25rem' }}>Artist commissions & payouts</h1>
      <p style={{ margin: '0 0 1rem', color: '#666', fontSize: '0.9rem' }}>
        Commission = each artist’s rate × net item sales (after discounts), both locations, all
        history. <strong>Balance owed</strong> = made − paid (negative means you’ve advanced them).
        House accounts are shown but not owed; “Unattributed” needs catalog cleanup.
        {lastSync
          ? ` Last synced ${lastSync.toLocaleString('en-US', { timeZone: 'America/Chicago' })}.`
          : ' Never synced — run a sync to populate.'}
      </p>

      <div style={{ margin: '0 0 1.25rem' }}>
        <SyncButton />
      </div>

      {report.artists.length === 0 ? (
        <p style={{ color: '#666' }}>No commission data yet. Click “Sync from Square”.</p>
      ) : (
        <>
          <nav style={{ display: 'flex', gap: '0.5rem', margin: '0 0 0.75rem' }}>
            {years.map((y) => (
              <Link
                key={y}
                href={`/admin/commissions?year=${y}` as Route}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: '999px',
                  border: '1px solid #ccc',
                  textDecoration: 'none',
                  ...(y === year
                    ? { background: '#111', color: '#fff', borderColor: '#111' }
                    : { color: '#111' })
                }}
              >
                {y}
              </Link>
            ))}
          </nav>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '760px' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Artist</th>
                  {months.map((m) => (
                    <th key={m} style={th}>
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th style={{ ...th, borderLeft: '2px solid #ccc' }}>{year} total</th>
                  <th style={{ ...th, borderLeft: '2px solid #ccc' }}>Total made (all-time)</th>
                  <th style={th}>Total paid</th>
                  <th style={th}>Balance owed</th>
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
                      style={muted ? { color: '#999' } : undefined}
                    >
                      <td style={nameCell}>
                        {a.artistName}
                        {!a.payable && a.artistName !== 'Unattributed' && (
                          <span style={{ fontWeight: 400, fontSize: '0.75rem' }}> (house)</span>
                        )}
                      </td>
                      {months.map((m) => (
                        <td key={m} style={cell}>
                          {a.byMonth[m] ? money(a.byMonth[m]) : '—'}
                        </td>
                      ))}
                      <td style={{ ...totalCol, fontWeight: 600 }}>
                        {money(yearTotal(a.byMonth))}
                      </td>
                      <td style={totalCol}>{money(a.totalCents)}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{paid ? money(paid) : '—'}</td>
                      <td
                        style={{
                          ...cell,
                          fontWeight: 700,
                          color: balance < 0 ? '#b45309' : muted ? '#999' : '#111'
                        }}
                        title={balance < 0 ? 'Advanced (artist owes shop)' : 'Owed to artist'}
                      >
                        {money(balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...nameCell, borderTop: '2px solid #ccc' }}>Payable totals</td>
                  {months.map((m) => (
                    <td key={m} style={{ ...cell, borderTop: '2px solid #ccc' }} />
                  ))}
                  <td style={{ ...totalCol, borderTop: '2px solid #ccc', fontWeight: 800 }}>
                    {money(totYear)}
                  </td>
                  <td style={{ ...totalCol, borderTop: '2px solid #ccc', fontWeight: 800 }}>
                    {money(totMade)}
                  </td>
                  <td style={{ ...cell, borderTop: '2px solid #ccc', fontWeight: 800 }}>
                    {money(totPaid)}
                  </td>
                  <td style={{ ...cell, borderTop: '2px solid #ccc', fontWeight: 800 }}>
                    {money(totMade - totPaid)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <h2 style={{ margin: '1.75rem 0 0.5rem', fontSize: '1.1rem' }}>Record a payout</h2>
      <PayoutForm artists={payableArtists} />

      {recentPayouts.length > 0 && (
        <>
          <h2 style={{ margin: '1.75rem 0 0.5rem', fontSize: '1.1rem' }}>Recent payouts</h2>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th>
                <th style={{ ...th, textAlign: 'left' }}>Artist</th>
                <th style={th}>Amount</th>
                <th style={{ ...th, textAlign: 'left' }}>Method</th>
                <th style={{ ...th, textAlign: 'left' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {recentPayouts.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...cell, textAlign: 'left' }}>
                    {p.paidAt.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  </td>
                  <td style={{ ...cell, textAlign: 'left' }}>{p.artistName}</td>
                  <td style={cell}>{money(p.amountCents)}</td>
                  <td style={{ ...cell, textAlign: 'left' }}>{p.method ?? '—'}</td>
                  <td style={{ ...cell, textAlign: 'left' }}>{p.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p style={{ marginTop: '1rem', color: '#999', fontSize: '0.8rem' }}>
        Figures are pre-refund (refund clawback is a tracked follow-up).
      </p>
    </div>
  )
}
