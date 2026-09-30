import 'server-only'
import { db } from '@/lib/db/client'
import { artistProfileChanges, artists } from '@/lib/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

/**
 * Fields an artist may edit themselves (plus the avatar file). Everything else
 * on `artists` is admin-only. The strict Zod schema built from this list lives
 * in artists.ts (`ArtistSelfInputSchema`) next to the admin schema it reuses.
 */
export const ARTIST_EDITABLE_FIELDS = [
  'bio',
  'instagram',
  'twitter',
  'facebook',
  'youtube',
  'tiktok',
  'website',
  'paymentMethod',
  'paymentEmail'
] as const

/** Payout fields: an ARTIST changing these alerts admins and sets the review flag. */
export const PAYMENT_FIELDS: readonly string[] = ['paymentMethod', 'paymentEmail']

export interface ChangeActor {
  userId: string | null
  email: string | null
}

export interface FieldChange {
  field: string
  oldValue: string | null
  newValue: string | null
}

type Tx = Pick<typeof db, 'insert'>

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v))

/**
 * One FieldChange per key in `patch` whose value differs from `before`.
 * `avatarUrl` is always logged when present: the file is re-saved at the same
 * `<slug>.webp` URL, so the URL alone can't show a replacement.
 */
export function diffFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): FieldChange[] {
  const out: FieldChange[] = []
  for (const [field, next] of Object.entries(patch)) {
    if (next === undefined) continue
    const oldValue = str(before[field])
    const newValue = str(next)
    if (oldValue !== newValue || field === 'avatarUrl') out.push({ field, oldValue, newValue })
  }
  return out
}

/** Append log rows inside the caller's transaction. */
export async function insertChangeRows(
  tx: Tx,
  artistId: string,
  changes: FieldChange[],
  actor: ChangeActor,
  source: 'artist' | 'admin'
): Promise<void> {
  if (changes.length === 0) return
  await tx.insert(artistProfileChanges).values(
    changes.map((c) => ({
      artistId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedByUserId: actor.userId,
      changedByEmail: actor.email,
      source
    }))
  )
}

/**
 * Artist self-serve save. The caller resolves `artistId` from the SESSION and
 * has already validated `patch` with ArtistSelfInputSchema. Updates, logs
 * (source 'artist') and, on a payout-field change, sets the review flag, all in
 * one transaction.
 */
export async function updateOwnProfile(
  artistId: string,
  patch: Record<string, string | null | undefined>,
  actor: ChangeActor
): Promise<{ changes: FieldChange[]; paymentChanges: FieldChange[]; artistName: string }> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(artists).where(eq(artists.id, artistId)).limit(1)
    if (!before) throw new Error(`artist ${artistId} not found`)
    const changes = diffFields(before, patch)
    const paymentChanges = changes.filter((c) => PAYMENT_FIELDS.includes(c.field))
    if (changes.length > 0) {
      const now = new Date()
      await tx
        .update(artists)
        .set({
          ...patch,
          updatedAt: now,
          ...(paymentChanges.length > 0 ? { paymentReviewPendingAt: now } : {})
        })
        .where(eq(artists.id, artistId))
      await insertChangeRows(tx, artistId, changes, actor, 'artist')
    }
    return { changes, paymentChanges, artistName: before.displayName }
  })
}

/** Admin clears the "payment details changed" flag; logged as source=admin. */
export async function markPaymentReviewed(artistId: string, actor: ChangeActor): Promise<void> {
  await db.transaction(async (tx) => {
    const cleared = await tx
      .update(artists)
      .set({ paymentReviewPendingAt: null })
      .where(and(eq(artists.id, artistId), isNotNull(artists.paymentReviewPendingAt)))
      .returning({ id: artists.id })
    if (cleared.length === 0) return
    await insertChangeRows(
      tx,
      artistId,
      [{ field: 'payment_review', oldValue: 'pending', newValue: 'reviewed' }],
      actor,
      'admin'
    )
  })
}

/** Newest first. Read-only: the log has no edit/delete path. */
export async function getArtistChanges(artistId: string) {
  return db
    .select()
    .from(artistProfileChanges)
    .where(eq(artistProfileChanges.artistId, artistId))
    .orderBy(desc(artistProfileChanges.createdAt))
}

/** Artist ids whose payout details changed and are awaiting admin review. */
export async function getPaymentReviewArtistIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: artists.id })
    .from(artists)
    .where(isNotNull(artists.paymentReviewPendingAt))
  return new Set(rows.map((r) => r.id))
}
