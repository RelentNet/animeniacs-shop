'use server'

import { banBlockReason } from '@/lib/admin/ban-guard'
import { auth } from '@/lib/auth'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { USERS_PAGE_SIZE, getUserById, getUsersByIds } from '@/lib/db/queries/users'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

async function requireAdmin() {
  const me = await getCurrentUser()
  if (!me.isAuthenticated || !me.roles.includes('admin')) throw new Error('Admin role required')
  return me
}

function done(notice: string): never {
  revalidatePath('/admin/users')
  redirect(`/admin/users?notice=${encodeURIComponent(notice)}`)
}

const cleanReason = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .trim()
    .slice(0, 500) || null

/** Shared ban: flags the user (sign-in blocked by the admin plugin) and revokes all sessions. */
async function banOne(id: string, reason: string | null) {
  const { internalAdapter } = await auth.$context
  await internalAdapter.updateUser(id, { banned: true, banReason: reason, banExpires: null })
  await internalAdapter.deleteUserSessions(id)
}

async function unbanOne(id: string) {
  const { internalAdapter } = await auth.$context
  await internalAdapter.updateUser(id, { banned: false, banReason: null, banExpires: null })
}

export async function banUserAction(formData: FormData): Promise<void> {
  const me = await requireAdmin()
  const target = await getUserById(String(formData.get('userId') ?? ''))
  if (!target) return done('User not found.')
  const blocked = banBlockReason(me.userId, target)
  if (blocked) return done(blocked)
  await banOne(target.id, cleanReason(formData.get('reason')))
  return done(`Banned ${target.email}.`)
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const target = await getUserById(String(formData.get('userId') ?? ''))
  if (!target) return done('User not found.')
  await unbanOne(target.id)
  return done(`Unbanned ${target.email}.`)
}

const IdsSchema = z.array(z.string().min(1).max(100)).min(1).max(USERS_PAGE_SIZE)

/** Bulk ban/unban. Protected ids (self, admins) are skipped, not fatal. */
async function bulk(formData: FormData, ban: boolean): Promise<void> {
  const me = await requireAdmin()
  const parsed = IdsSchema.safeParse([...new Set(formData.getAll('ids').map(String))])
  if (!parsed.success) return done(`Select 1-${USERS_PAGE_SIZE} users.`)
  const reason = cleanReason(formData.get('reason'))
  const targets = await getUsersByIds(parsed.data)
  const skipped: string[] = []
  let n = 0
  for (const t of targets) {
    if (ban && banBlockReason(me.userId, t)) {
      skipped.push(t.id === me.userId ? 'self' : 'admin')
      continue
    }
    await (ban ? banOne(t.id, reason) : unbanOne(t.id))
    n++
  }
  for (let i = parsed.data.length - targets.length; i > 0; i--) skipped.push('not found')
  const tail = skipped.length
    ? ` · skipped ${skipped.length} (${[...new Set(skipped)].join(', ')})`
    : ''
  return done(`${ban ? 'Banned' : 'Unbanned'} ${n}${tail}`)
}

export async function banSelectedAction(formData: FormData): Promise<void> {
  return bulk(formData, true)
}

export async function unbanSelectedAction(formData: FormData): Promise<void> {
  return bulk(formData, false)
}

export async function sendPasswordResetAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const target = await getUserById(String(formData.get('userId') ?? ''))
  if (!target) return done('User not found.')
  await auth.api.requestPasswordReset({
    body: { email: target.email, redirectTo: '/reset-password' }
  })
  return done(`Password reset email sent to ${target.email}.`)
}
