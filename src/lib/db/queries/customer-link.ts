import 'server-only'
import { db } from '@/lib/db/client'
import { type CustomerLink, customerLink } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function getCustomerLinkByUserId(userId: string): Promise<CustomerLink | undefined> {
  const rows = await db
    .select()
    .from(customerLink)
    .where(eq(customerLink.userId, userId))
    .limit(1)
  return rows[0]
}

export interface UpsertCustomerLinkInput {
  userId: string
  email: string | null
  squareCustomerId: string
  name: string | null
}

/**
 * Caches the Logto sub → Square customer mapping, keyed on `userId`.
 * Idempotent: a repeat checkout refreshes email/name/squareCustomerId/cachedAt.
 */
export async function upsertCustomerLink(input: UpsertCustomerLinkInput): Promise<void> {
  await db
    .insert(customerLink)
    .values({
      userId: input.userId,
      email: input.email,
      squareCustomerId: input.squareCustomerId,
      name: input.name
    })
    .onConflictDoUpdate({
      target: customerLink.userId,
      set: {
        email: input.email,
        squareCustomerId: input.squareCustomerId,
        name: input.name,
        cachedAt: new Date()
      }
    })
}
