import 'server-only'
import { db } from '@/lib/db/client'
import { type SavedAddress, type SavedAddressDetails, savedAddresses } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

/** All saved addresses for a user, default first then newest. */
export async function getAddresses(userId: string): Promise<SavedAddress[]> {
  return db
    .select()
    .from(savedAddresses)
    .where(eq(savedAddresses.userId, userId))
    .orderBy(desc(savedAddresses.isDefault), desc(savedAddresses.createdAt))
}

/** The user's default address, or null if none is marked default. */
export async function getDefaultAddress(userId: string): Promise<SavedAddress | null> {
  const rows = await db
    .select()
    .from(savedAddresses)
    .where(and(eq(savedAddresses.userId, userId), eq(savedAddresses.isDefault, true)))
    .limit(1)
  return rows[0] ?? null
}

export interface SaveAddressInput {
  label: string
  address: SavedAddressDetails
  isDefault?: boolean
}

/**
 * Inserts a new saved address. When `isDefault` is set, the existing defaults
 * are cleared first inside the same transaction so at most one address is ever
 * the default (the one-default invariant).
 */
export async function saveAddress(userId: string, input: SaveAddressInput): Promise<SavedAddress> {
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(savedAddresses)
        .set({ isDefault: false })
        .where(eq(savedAddresses.userId, userId))
    }
    const [row] = await tx
      .insert(savedAddresses)
      .values({
        userId,
        label: input.label,
        address: input.address,
        isDefault: input.isDefault ?? false
      })
      .returning()
    return row
  })
}

/**
 * Marks one existing address as the user's default, clearing any other default
 * in the same transaction (one-default invariant). Owner-scoped.
 */
export async function setDefaultAddress(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(savedAddresses)
      .set({ isDefault: false })
      .where(eq(savedAddresses.userId, userId))
    await tx
      .update(savedAddresses)
      .set({ isDefault: true })
      .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
  })
}

/** Deletes one of the user's addresses. Owner-scoped: the id must belong to the user. */
export async function deleteAddress(userId: string, id: string): Promise<void> {
  await db
    .delete(savedAddresses)
    .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
}
