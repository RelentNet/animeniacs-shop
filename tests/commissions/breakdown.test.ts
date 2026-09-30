import { type BreakdownRow, buildBreakdown, buildReport } from '@/lib/commissions/report'
import { describe, expect, it } from 'vitest'

const row = (o: Partial<BreakdownRow>): BreakdownRow => ({
  artistId: 'a1',
  yearMonth: '2026-03',
  itemType: 'prints',
  location: 'online',
  grossCents: 10000,
  discountCents: 1000,
  refundCents: 0,
  netCents: 9000,
  commissionCents: 900,
  rate: 0.1,
  orderCount: 2,
  ...o
})

describe('buildBreakdown', () => {
  const rows = [
    row({ itemType: 'other', location: 'mobile', commissionCents: 100, netCents: 1000 }),
    row({ yearMonth: '2026-02', rate: 0.2, commissionCents: 1800 }),
    row({ itemType: 'acrylic', location: 'online' }),
    row({ itemType: 'prints', location: 'mobile', refundCents: 500, netCents: 8500 }),
    row({ artistId: null, commissionCents: 50 })
  ]
  const b = buildBreakdown(rows)

  it('month totals sum the rows and equal the main table cell', () => {
    const cells = buildReport(
      rows.map((r) => ({
        artistId: r.artistId,
        artistName: r.artistId ?? 'Unattributed',
        payable: true,
        yearMonth: r.yearMonth,
        commissionCents: r.commissionCents
      }))
    )
    const a1 = cells.artists.find((a) => a.artistId === 'a1')
    const months = b.get('a1') ?? []
    expect(months.map((m) => m.yearMonth)).toEqual(['2026-02', '2026-03'])
    for (const m of months) expect(m.commissionCents).toBe(a1?.byMonth[m.yearMonth])
    const mar = months[1]
    expect(mar.grossCents).toBe(30000)
    expect(mar.refundCents).toBe(500)
    expect(mar.netCents).toBe(1000 + 9000 + 8500)
    expect(mar.orderCount).toBe(6)
  })

  it('orders sub-rows by type then location; rate is per month', () => {
    const [feb, mar] = b.get('a1') ?? []
    expect(mar.lines.map((l) => `${l.itemType}/${l.location}`)).toEqual([
      'acrylic/online',
      'prints/mobile',
      'other/mobile'
    ])
    expect(feb.rate).toBe(0.2)
    expect(mar.rate).toBe(0.1)
  })

  it('unattributed keyed separately; mixed rates collapse to null', () => {
    expect(b.get('unattributed')?.[0].commissionCents).toBe(50)
    const mixed = buildBreakdown([row({ rate: 0.1 }), row({ rate: null, itemType: 'other' })])
    expect(mixed.get('a1')?.[0].rate).toBeNull()
  })
})
