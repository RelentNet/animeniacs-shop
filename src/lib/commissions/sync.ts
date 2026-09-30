import 'server-only'
import {
  type ArtistCatInfo,
  ensureArtistsForCategories,
  getRateHistoryByArtist,
  replaceAllCommissionEarnings
} from '@/lib/db/queries/commissions'
import type { NewCommissionEarning } from '@/lib/db/schema'
import { getArtistSubCategories } from '@/lib/square/categories'
import { type RatePoint, commissionCents, rateForMonth } from './calc'
import { type EarningAggregate, sweepCommissionEarnings } from './sweep'

/** Rate for unattributed sales (no artist row to read a rate from). */
const DEFAULT_RATE = 0.2

export interface CommissionSyncResult {
  earningRows: number
  artistsSeen: number
  unattributedRows: number
  syncedAt: Date
}

/**
 * PURE: price each aggregate at the rate in force for ITS month (per-artist
 * history, falling back to artists.commission_rate; unattributed = DEFAULT_RATE).
 */
export function buildEarningRows(
  aggregates: EarningAggregate[],
  catMap: Map<string, ArtistCatInfo>,
  history: Map<string, RatePoint[]>,
  computedAt: Date
): NewCommissionEarning[] {
  return aggregates.map((a) => {
    const info = a.artistCategoryId ? catMap.get(a.artistCategoryId) : undefined
    const rate = info
      ? rateForMonth(history.get(info.artistId) ?? [], a.yearMonth, info.rate)
      : DEFAULT_RATE
    return {
      artistId: info?.artistId ?? null,
      yearMonth: a.yearMonth,
      itemType: a.itemType,
      location: a.location,
      grossCents: a.grossCents,
      discountCents: a.discountCents,
      refundCents: a.refundCents,
      netCents: a.netCents,
      commissionCents: commissionCents(a.netCents, rate),
      rate: rate.toFixed(4),
      orderCount: a.orderCount,
      computedAt
    }
  })
}

/**
 * Recompute the whole commission cache from Square: sweep both locations (all
 * history) → ensure an artists row per artist category → apply each artist's
 * rate-for-that-month (rate history, DAN-122) → wipe+rebuild `commission_earnings`. Idempotent; safe to
 * re-run any time. Uses the env-driven Square client (production in production).
 */
export async function runCommissionSync(): Promise<CommissionSyncResult> {
  const onlineLocationId = process.env.SQUARE_LOCATION_ID
  if (!onlineLocationId) {
    throw new Error('SQUARE_LOCATION_ID is not set — cannot run the commission sync.')
  }
  const mobileLocationId = process.env.SQUARE_MOBILE_LOCATION_ID

  const [aggregates, artistCats] = await Promise.all([
    sweepCommissionEarnings({ onlineLocationId, mobileLocationId }),
    getArtistSubCategories()
  ])

  const catMap = await ensureArtistsForCategories(
    artistCats.map((c) => ({ id: c.id, name: c.name }))
  )

  const computedAt = new Date()
  const history = await getRateHistoryByArtist()
  const rows = buildEarningRows(aggregates, catMap, history, computedAt)

  await replaceAllCommissionEarnings(rows)

  return {
    earningRows: rows.length,
    artistsSeen: catMap.size,
    unattributedRows: rows.filter((r) => r.artistId === null).length,
    syncedAt: computedAt
  }
}
