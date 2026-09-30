import 'server-only'
import type { RatePoint } from '@/lib/commissions/calc'
import type { BreakdownRow } from '@/lib/commissions/report'
import { db } from '@/lib/db/client'
import {
  type NewCommissionEarning,
  artistCommissionRates,
  artistPayouts,
  artists,
  commissionEarnings
} from '@/lib/db/schema'
import { asc, desc, eq, sql } from 'drizzle-orm'

/** House accounts: computed-but-not-owed. Seeded with payable=false. */
const HOUSE_ARTIST_NAMES = new Set(['Animeniacs Studios'])

/** name → slug matching the artists slug regex (^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$). */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return s.length > 0 ? s : 'artist'
}

export interface ArtistCatInfo {
  artistId: string
  rate: number
  payable: boolean
  name: string
}

/**
 * Ensure every artist category has an `artists` row, then return a map
 * squareCategoryId → { artistId, rate, payable, name }. Missing categories are
 * INSERTED as `status:'inactive'` (so the commission sync never publishes a new
 * public artist page) with the default commission rate; existing rows are left
 * untouched so operator-set rates/payable/status win.
 */
export async function ensureArtistsForCategories(
  cats: Array<{ id: string; name: string }>
): Promise<Map<string, ArtistCatInfo>> {
  const existing = await db.select().from(artists)
  const byCat = new Map(existing.map((a) => [a.squareCategoryId, a]))
  const usedSlugs = new Set(existing.map((a) => a.slug))

  const toInsert = cats
    .filter((c) => !byCat.has(c.id))
    .map((c) => {
      let slug = slugify(c.name)
      let n = 1
      while (usedSlugs.has(slug)) slug = `${slugify(c.name)}-${++n}`
      usedSlugs.add(slug)
      return {
        slug,
        displayName: c.name,
        squareCategoryId: c.id,
        status: 'inactive' as const,
        payable: !HOUSE_ARTIST_NAMES.has(c.name)
      }
    })
  if (toInsert.length > 0) {
    const created = await db.insert(artists).values(toInsert).returning({
      id: artists.id,
      rate: artists.commissionRate
    })
    // History row so a later rate change can't re-rate these artists' past months
    // via the fallback (2000-01 = before any sales, same as the migration backfill).
    await db
      .insert(artistCommissionRates)
      .values(created.map((c) => ({ artistId: c.id, rate: c.rate, effectiveFrom: '2000-01' })))
  }

  const all = toInsert.length > 0 ? await db.select().from(artists) : existing
  const map = new Map<string, ArtistCatInfo>()
  for (const a of all) {
    map.set(a.squareCategoryId, {
      artistId: a.id,
      rate: Number(a.commissionRate),
      payable: a.payable,
      name: a.displayName
    })
  }
  return map
}

/** artistId → rate history rows (any order). */
export async function getRateHistoryByArtist(): Promise<Map<string, RatePoint[]>> {
  const rows = await db.select().from(artistCommissionRates)
  const map = new Map<string, RatePoint[]>()
  for (const r of rows) {
    const list = map.get(r.artistId) ?? []
    list.push({ effectiveFrom: r.effectiveFrom, rate: Number(r.rate) })
    map.set(r.artistId, list)
  }
  return map
}

/** Full rebuild of the materialized cache: wipe + bulk-insert in one transaction. */
export async function replaceAllCommissionEarnings(rows: NewCommissionEarning[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(commissionEarnings)
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(commissionEarnings).values(rows.slice(i, i + 500))
    }
  })
}

export interface CommissionEarningView {
  artistId: string | null
  artistName: string
  payable: boolean
  yearMonth: string
  commissionCents: number
}

/** Flat earning rows joined to their artist (null artist → "Unattributed", non-payable). */
export async function getCommissionEarningRows(): Promise<CommissionEarningView[]> {
  const rows = await db
    .select({
      artistId: commissionEarnings.artistId,
      artistName: artists.displayName,
      payable: artists.payable,
      yearMonth: commissionEarnings.yearMonth,
      commissionCents: commissionEarnings.commissionCents
    })
    .from(commissionEarnings)
    .leftJoin(artists, eq(commissionEarnings.artistId, artists.id))
  return rows.map((r) => ({
    artistId: r.artistId,
    artistName: r.artistName ?? 'Unattributed',
    payable: r.artistName ? (r.payable ?? true) : false,
    yearMonth: r.yearMonth,
    commissionCents: r.commissionCents
  }))
}

/** Every unaggregated earnings row, for the /admin/commissions audit breakdown. */
export async function getCommissionBreakdownRows(): Promise<BreakdownRow[]> {
  const rows = await db.select().from(commissionEarnings)
  return rows.map((r) => ({
    artistId: r.artistId,
    yearMonth: r.yearMonth,
    itemType: r.itemType,
    location: r.location,
    grossCents: r.grossCents,
    discountCents: r.discountCents,
    refundCents: r.refundCents,
    netCents: r.netCents,
    commissionCents: r.commissionCents,
    rate: r.rate === null ? null : Number(r.rate),
    orderCount: r.orderCount
  }))
}

/** artistId → total paid cents (sum of artist_payouts). */
export async function getPaidCentsByArtist(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      artistId: artistPayouts.artistId,
      paidCents: sql<number>`coalesce(sum(${artistPayouts.amountCents}), 0)`
    })
    .from(artistPayouts)
    .groupBy(artistPayouts.artistId)
  return new Map(rows.map((r) => [r.artistId, Number(r.paidCents)]))
}

export interface PayableArtistOption {
  id: string
  name: string
}

/** Artists eligible to receive a payout (payable), for the entry dropdown. */
export async function getPayableArtists(): Promise<PayableArtistOption[]> {
  const rows = await db
    .select({ id: artists.id, name: artists.displayName, payable: artists.payable })
    .from(artists)
    .where(eq(artists.payable, true))
    .orderBy(asc(artists.displayName))
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

export interface RecordPayoutInput {
  artistId: string
  amountCents: number
  paidAt: Date
  method?: string | null
  note?: string | null
  createdBy?: string | null
}

/** Insert a payout (advances are just payouts that exceed current earnings). */
export async function recordPayout(input: RecordPayoutInput): Promise<void> {
  await db.insert(artistPayouts).values({
    artistId: input.artistId,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    method: input.method ?? null,
    note: input.note ?? null,
    createdBy: input.createdBy ?? null
  })
}

export interface PayoutRow {
  id: string
  artistName: string
  amountCents: number
  paidAt: Date
  method: string | null
  note: string | null
}

/** Recent payouts across all artists, newest first. */
export async function getRecentPayouts(limit = 50): Promise<PayoutRow[]> {
  const rows = await db
    .select({
      id: artistPayouts.id,
      artistName: artists.displayName,
      amountCents: artistPayouts.amountCents,
      paidAt: artistPayouts.paidAt,
      method: artistPayouts.method,
      note: artistPayouts.note
    })
    .from(artistPayouts)
    .leftJoin(artists, eq(artistPayouts.artistId, artists.id))
    .orderBy(desc(artistPayouts.paidAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, artistName: r.artistName ?? '(deleted artist)' }))
}

// --- Artist self-serve earnings portal ---

export interface LinkedArtist {
  id: string
  displayName: string
  payable: boolean
}

/** Find the artist linked to a login email (case-insensitive), or null. */
export async function getArtistByAccountEmail(email: string): Promise<LinkedArtist | null> {
  const [row] = await db
    .select({ id: artists.id, displayName: artists.displayName, payable: artists.payable })
    .from(artists)
    .where(sql`lower(${artists.accountEmail}) = ${email.toLowerCase()}`)
    .limit(1)
  return row ?? null
}

export interface ArtistMonthlyEarning {
  yearMonth: string
  commissionCents: number
}

/** Monthly commission rows for a single artist (for their own statement). */
export async function getArtistEarnings(artistId: string): Promise<ArtistMonthlyEarning[]> {
  return db
    .select({
      yearMonth: commissionEarnings.yearMonth,
      commissionCents: commissionEarnings.commissionCents
    })
    .from(commissionEarnings)
    .where(eq(commissionEarnings.artistId, artistId))
}

export interface ArtistPayoutHistoryRow {
  id: string
  amountCents: number
  paidAt: Date
  method: string | null
  note: string | null
}

/** One artist's payout history, newest first. */
export async function getPayoutsForArtist(artistId: string): Promise<ArtistPayoutHistoryRow[]> {
  return db
    .select({
      id: artistPayouts.id,
      amountCents: artistPayouts.amountCents,
      paidAt: artistPayouts.paidAt,
      method: artistPayouts.method,
      note: artistPayouts.note
    })
    .from(artistPayouts)
    .where(eq(artistPayouts.artistId, artistId))
    .orderBy(desc(artistPayouts.paidAt))
}

/** Most recent sync timestamp, or null if never synced. */
export async function getLastCommissionSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ computedAt: commissionEarnings.computedAt })
    .from(commissionEarnings)
    .orderBy(desc(commissionEarnings.computedAt))
    .limit(1)
  return row?.computedAt ?? null
}
