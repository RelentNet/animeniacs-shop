import { commissionCents, rateForMonth } from '@/lib/commissions/calc'
import type { EarningAggregate } from '@/lib/commissions/sweep'
import { buildEarningRows, runCommissionSync } from '@/lib/commissions/sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  sweep: vi.fn(),
  cats: vi.fn(),
  ensure: vi.fn(),
  history: vi.fn(),
  replace: vi.fn()
}))
vi.mock('@/lib/commissions/sweep', () => ({ sweepCommissionEarnings: m.sweep }))
vi.mock('@/lib/square/categories', () => ({ getArtistSubCategories: m.cats }))
vi.mock('@/lib/db/queries/commissions', () => ({
  ensureArtistsForCategories: m.ensure,
  getRateHistoryByArtist: m.history,
  replaceAllCommissionEarnings: m.replace
}))

describe('rateForMonth', () => {
  const h = [
    { effectiveFrom: '2026-06', rate: 0.3 },
    { effectiveFrom: '2000-01', rate: 0.2 },
    { effectiveFrom: '2026-03', rate: 0.1 }
  ]
  it('falls back before the first row / with no rows', () => {
    expect(rateForMonth(h, '1999-12', 0.5)).toBe(0.5)
    expect(rateForMonth([], '2026-01', 0.25)).toBe(0.25)
  })
  it('exact month, between changes, after the last change', () => {
    expect(rateForMonth(h, '2000-01', 0.5)).toBe(0.2)
    expect(rateForMonth(h, '2026-02', 0.5)).toBe(0.2)
    expect(rateForMonth(h, '2026-03', 0.5)).toBe(0.1)
    expect(rateForMonth(h, '2026-05', 0.5)).toBe(0.1)
    expect(rateForMonth(h, '2026-06', 0.5)).toBe(0.3)
    expect(rateForMonth(h, '2030-01', 0.5)).toBe(0.3)
  })
})

const agg = (yearMonth: string, netCents: number, cat: string | null = 'c1'): EarningAggregate => ({
  artistCategoryId: cat,
  yearMonth,
  itemType: 'prints',
  location: 'online',
  grossCents: netCents,
  discountCents: 0,
  refundCents: 0,
  netCents,
  orderCount: 1
})
const catMap = new Map([['c1', { artistId: 'a1', rate: 0.1, payable: true, name: 'A' }]])
const twenty10 = new Map([
  [
    'a1',
    [
      { effectiveFrom: '2000-01', rate: 0.2 },
      { effectiveFrom: '2026-03', rate: 0.1 }
    ]
  ]
])

describe('buildEarningRows', () => {
  it('applies different rates to different months (20% -> 10% from month 3)', () => {
    const rows = buildEarningRows(
      [agg('2026-01', 10000), agg('2026-02', 10000), agg('2026-03', 10000)],
      catMap,
      twenty10,
      new Date()
    )
    expect(rows.map((r) => r.commissionCents)).toEqual([2000, 2000, 1000])
    expect(rows.map((r) => r.rate)).toEqual(['0.2000', '0.2000', '0.1000'])
  })

  it('unattributed stays 20%', () => {
    const [r] = buildEarningRows([agg('2026-01', 10000, null)], catMap, new Map(), new Date())
    expect(r.commissionCents).toBe(2000)
    expect(r.artistId).toBeNull()
  })

  it('backfill equivalence: a 2000-01 row == legacy current-rate math', () => {
    const aggs = ['2024-01', '2025-07', '2026-09'].map((mo) => agg(mo, 12345))
    const rows = buildEarningRows(
      aggs,
      catMap,
      new Map([['a1', [{ effectiveFrom: '2000-01', rate: 0.1 }]]]),
      new Date()
    )
    expect(rows.map((r) => r.commissionCents)).toEqual(
      aggs.map((a) => commissionCents(a.netCents, 0.1))
    )
  })
})

describe('runCommissionSync', () => {
  beforeEach(() => {
    process.env.SQUARE_LOCATION_ID = 'L1'
    m.sweep.mockResolvedValue([agg('2026-01', 10000), agg('2026-03', 10000)])
    m.cats.mockResolvedValue([{ id: 'c1', name: 'A' }])
    m.ensure.mockResolvedValue(catMap)
    m.history.mockResolvedValue(twenty10)
  })
  it('persists per-month rates', async () => {
    await runCommissionSync()
    const rows = m.replace.mock.calls[0][0]
    expect(rows.map((r: { commissionCents: number }) => r.commissionCents)).toEqual([2000, 1000])
  })
})
