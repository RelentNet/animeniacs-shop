/**
 * Grants the `admin` role to a better-auth user by email (Phase 15 admin
 * provisioning). Run after signing up with the admin email:
 *
 *   pnpm auth:grant-admin you@example.com
 *
 * Uses a standalone postgres connection (not @/lib/db/client, which is
 * `server-only`-guarded). Matches email case-insensitively because better-auth
 * stores normalized lowercase emails.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { user } from '../../src/lib/db/schema'

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) {
    console.error('Usage: pnpm auth:grant-admin <email>')
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set (run with: tsx --env-file=.env.local ...).')
    process.exit(1)
  }

  const client = postgres(url, { max: 1 })
  try {
    const db = drizzle(client, { schema: { user } })
    const updated = await db
      .update(user)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(sql`lower(${user.email})`, email))
      .returning({ id: user.id, email: user.email, role: user.role })

    if (updated.length === 0) {
      console.error(`No user found with email "${email}". Sign up first, then re-run.`)
      process.exitCode = 1
      return
    }
    console.log(`Granted admin to ${updated[0].email} (id ${updated[0].id}).`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('grant-admin failed:', err)
  process.exit(1)
})
