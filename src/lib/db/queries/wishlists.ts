import 'server-only'
import { db } from '@/lib/db/client'
import { type WishlistEntry, wishlists } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

/** Add a product to the user's wishlist. Idempotent (no-op if already present). */
export async function addToWishlist(userId: string, productId: string): Promise<void> {
  await db.insert(wishlists).values({ userId, productId }).onConflictDoNothing()
}

/** Remove a product from the user's wishlist (composite key). */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db
    .delete(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)))
}

/** The user's wishlist entries, most recently added first. */
export async function getWishlist(userId: string): Promise<WishlistEntry[]> {
  return db
    .select()
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .orderBy(desc(wishlists.addedAt))
}

/** Whether the product is currently on the user's wishlist. */
export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const rows = await db
    .select({ productId: wishlists.productId })
    .from(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)))
    .limit(1)
  return rows.length > 0
}
