import type {
  ArtistMonthlyEarning,
  ArtistPayoutHistoryRow,
  CommissionEarningView
} from '@/lib/db/queries/commissions'

/**
 * Pure shaping of flat earning rows into the per-artist × per-month matrix the
 * admin report renders. No I/O — unit-tested. Artists sort by all-time total
 * (desc); "Unattributed" is forced last. `payableTotalCents` excludes both
 * house (payable=false) and unattributed.
 */

export interface ArtistReportRow {
  artistId: string | null
  artistName: string
  payable: boolean
  byMonth: Record<string, number> // yearMonth → commission cents
  totalCents: number
}

export interface CommissionReport {
  months: string[] // sorted asc, all months present
  artists: ArtistReportRow[]
  columnTotals: Record<string, number> // yearMonth → total across all artists
  grandTotalCents: number
  payableTotalCents: number
}

export function buildReport(rows: CommissionEarningView[]): CommissionReport {
  const months = new Set<string>()
  const byArtist = new Map<string, ArtistReportRow>()

  for (const r of rows) {
    months.add(r.yearMonth)
    // Key by artistId so payouts can join; null artist → single "Unattributed" bucket.
    const key = r.artistId ?? '__unattributed__'
    let a = byArtist.get(key)
    if (!a) {
      a = {
        artistId: r.artistId,
        artistName: r.artistName,
        payable: r.payable,
        byMonth: {},
        totalCents: 0
      }
      byArtist.set(key, a)
    }
    a.byMonth[r.yearMonth] = (a.byMonth[r.yearMonth] ?? 0) + r.commissionCents
    a.totalCents += r.commissionCents
  }

  const artists = [...byArtist.values()].sort((x, y) => {
    // Unattributed always last, then by total desc.
    const xu = x.artistName === 'Unattributed'
    const yu = y.artistName === 'Unattributed'
    if (xu !== yu) return xu ? 1 : -1
    return y.totalCents - x.totalCents
  })

  const sortedMonths = [...months].sort()
  const columnTotals: Record<string, number> = {}
  let grandTotalCents = 0
  let payableTotalCents = 0
  for (const a of artists) {
    grandTotalCents += a.totalCents
    if (a.payable && a.artistName !== 'Unattributed') payableTotalCents += a.totalCents
    for (const m of sortedMonths) columnTotals[m] = (columnTotals[m] ?? 0) + (a.byMonth[m] ?? 0)
  }

  return { months: sortedMonths, artists, columnTotals, grandTotalCents, payableTotalCents }
}

/** Years present (newest first) + the chosen year's months. Missing/unknown year → newest. */
export function pickYear(
  months: string[],
  requested?: string
): { years: string[]; year: string | undefined; months: string[] } {
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse()
  const year = requested && years.includes(requested) ? requested : years[0]
  return { years, year, months: months.filter((m) => m.startsWith(`${year}-`)) }
}

// --- Single-artist statement (self-serve earnings page) ---

export interface ArtistStatement {
  months: string[] // sorted asc
  byMonth: Record<string, number> // yearMonth → commission cents
  madeCents: number
  paidCents: number
  balanceCents: number // made − paid; negative = advanced (artist owes shop)
}

/** Pure: one artist's monthly earnings + payouts → their statement totals. */
export function buildArtistStatement(
  earnings: ArtistMonthlyEarning[],
  payouts: ArtistPayoutHistoryRow[]
): ArtistStatement {
  const byMonth: Record<string, number> = {}
  let madeCents = 0
  for (const e of earnings) {
    byMonth[e.yearMonth] = (byMonth[e.yearMonth] ?? 0) + e.commissionCents
    madeCents += e.commissionCents
  }
  const paidCents = payouts.reduce((sum, p) => sum + p.amountCents, 0)
  return {
    months: Object.keys(byMonth).sort(),
    byMonth,
    madeCents,
    paidCents,
    balanceCents: madeCents - paidCents
  }
}

// --- Per-artist audit breakdown (DAN-123) ---

/** One `commission_earnings` row, unaggregated. */
export interface BreakdownRow {
  artistId: string | null
  yearMonth: string
  itemType: string
  location: string
  grossCents: number
  discountCents: number
  refundCents: number
  netCents: number
  commissionCents: number
  /** Rate applied (fraction); null for rows written before rate history. */
  rate: number | null
  orderCount: number
}

export interface BreakdownMonth {
  yearMonth: string
  grossCents: number
  discountCents: number
  refundCents: number
  netCents: number
  commissionCents: number
  /** Distinct rate when every row agrees, else null (legacy/mixed). */
  rate: number | null
  /** Sum of per-bucket order counts — an order spanning buckets counts once per bucket. */
  orderCount: number
  /** Sub-rows by item type then location. */
  lines: BreakdownRow[]
}

const ITEM_ORDER = ['acrylic', 'prints', 'other']
const LOCATION_ORDER = ['online', 'mobile']

/** artistId (or 'unattributed') → months (asc) with sub-rows. Month commission = the main table's cell. */
export function buildBreakdown(rows: BreakdownRow[]): Map<string, BreakdownMonth[]> {
  const byArtist = new Map<string, Map<string, BreakdownMonth>>()
  for (const r of rows) {
    const key = r.artistId ?? 'unattributed'
    const months = byArtist.get(key) ?? new Map<string, BreakdownMonth>()
    byArtist.set(key, months)
    let m = months.get(r.yearMonth)
    if (!m) {
      m = {
        yearMonth: r.yearMonth,
        grossCents: 0,
        discountCents: 0,
        refundCents: 0,
        netCents: 0,
        commissionCents: 0,
        rate: r.rate,
        orderCount: 0,
        lines: []
      }
      months.set(r.yearMonth, m)
    } else if (m.rate !== r.rate) {
      m.rate = null
    }
    m.grossCents += r.grossCents
    m.discountCents += r.discountCents
    m.refundCents += r.refundCents
    m.netCents += r.netCents
    m.commissionCents += r.commissionCents
    m.orderCount += r.orderCount
    m.lines.push(r)
  }
  const out = new Map<string, BreakdownMonth[]>()
  for (const [key, months] of byArtist) {
    const list = [...months.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    for (const m of list) {
      m.lines.sort(
        (a, b) =>
          ITEM_ORDER.indexOf(a.itemType) - ITEM_ORDER.indexOf(b.itemType) ||
          LOCATION_ORDER.indexOf(a.location) - LOCATION_ORDER.indexOf(b.location)
      )
    }
    out.set(key, list)
  }
  return out
}
