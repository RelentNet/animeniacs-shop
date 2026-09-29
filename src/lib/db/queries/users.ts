import 'server-only'
import { db } from '@/lib/db/client'
import { orders, session, user } from '@/lib/db/schema'
import { count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'

export const UsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})
export type UsersQuery = z.input<typeof UsersQuerySchema>

/** One page of accounts, newest sign-up first, searchable by email/name. */
export async function listUsers(input: UsersQuery = {}) {
  const { q, page, pageSize } = UsersQuerySchema.parse(input)
  // Escape LIKE wildcards so a search for "%" or "_" is literal.
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null
  const where = like ? or(ilike(user.email, like), ilike(user.name, like)) : undefined

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
      lastSignIn: sql<Date | null>`(select max(${session.createdAt}) from ${session} where ${session.userId} = "user"."id")`,
      orderCount: sql<number>`(select count(*)::int from ${orders} where ${orders.userId} = "user"."id")`
    })
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totalRow] = await db.select({ n: count() }).from(user).where(where)
  return { rows, total: totalRow?.n ?? 0, page, pageSize }
}

/** Sign-up spam summary: totals, recent sign-ups, accounts that never ordered. */
export async function getUserSummary(now: Date = new Date()) {
  const d1 = new Date(now.getTime() - 86_400_000)
  const d7 = new Date(now.getTime() - 7 * 86_400_000)
  const [row] = await db
    .select({
      total: count(),
      last24h: sql<number>`(count(*) filter (where ${user.createdAt} >= ${d1.toISOString()}))::int`,
      last7d: sql<number>`(count(*) filter (where ${user.createdAt} >= ${d7.toISOString()}))::int`,
      noOrders: sql<number>`(count(*) filter (where not exists (select 1 from ${orders} where ${orders.userId} = "user"."id")))::int`
    })
    .from(user)
  return row ?? { total: 0, last24h: 0, last7d: 0, noOrders: 0 }
}

export async function getUserById(id: string) {
  const rows = await db
    .select({ id: user.id, email: user.email, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  return rows[0] ?? null
}
