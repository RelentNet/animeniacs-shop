import 'server-only'
import { db } from '@/lib/db/client'
import { type IpNickname, type NewIpNickname, ipNicknames } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Zod schema for runtime validation. Slug regex disallows dot
 * (artist slugs allow dot for handles like `Bxnny.Arts`; IP nicknames
 * don't need that and the URL reads cleaner without).
 */
export const IpNicknameInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase letters, digits, and hyphen only'),
  nickname: z.string().min(1).max(120),
  squareCategoryId: z.string().min(1),
  description: z.string().max(2000).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().default(true)
})

export type IpNicknameInput = z.input<typeof IpNicknameInputSchema>
export type IpNicknameInputParsed = z.output<typeof IpNicknameInputSchema>

export async function getAllIpNicknames(): Promise<IpNickname[]> {
  return db.select().from(ipNicknames).orderBy(asc(ipNicknames.nickname))
}

export async function getPublicIpNicknames(): Promise<IpNickname[]> {
  return db
    .select()
    .from(ipNicknames)
    .where(eq(ipNicknames.isPublic, true))
    .orderBy(asc(ipNicknames.nickname))
}

export async function getIpNicknameBySlug(slug: string): Promise<IpNickname | undefined> {
  const rows = await db.select().from(ipNicknames).where(eq(ipNicknames.slug, slug)).limit(1)
  return rows[0]
}

export async function getIpNicknameByCategoryId(
  squareCategoryId: string
): Promise<IpNickname | undefined> {
  const rows = await db
    .select()
    .from(ipNicknames)
    .where(eq(ipNicknames.squareCategoryId, squareCategoryId))
    .limit(1)
  return rows[0]
}

export async function getIpNicknameById(id: string): Promise<IpNickname | undefined> {
  const rows = await db.select().from(ipNicknames).where(eq(ipNicknames.id, id)).limit(1)
  return rows[0]
}

export async function createIpNickname(input: IpNicknameInput): Promise<IpNickname> {
  const parsed = IpNicknameInputSchema.parse(input)
  const [row] = await db
    .insert(ipNicknames)
    .values(parsed satisfies NewIpNickname)
    .returning()
  return row
}

export async function updateIpNickname(
  id: string,
  input: Partial<IpNicknameInput>
): Promise<IpNickname> {
  const parsed = IpNicknameInputSchema.partial().parse(input)
  const [row] = await db
    .update(ipNicknames)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(ipNicknames.id, id))
    .returning()
  if (!row) throw new Error(`ip_nickname ${id} not found`)
  return row
}
