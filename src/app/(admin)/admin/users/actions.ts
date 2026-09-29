'use server'

import { banBlockReason } from '@/lib/admin/ban-guard'
import { auth } from '@/lib/auth'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getUserById } from '@/lib/db/queries/users'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  const me = await getCurrentUser()
  if (!me.isAuthenticated || !me.roles.includes('admin')) throw new Error('Admin role required')
  return me
}

function done(notice: string): never {
  revalidatePath('/admin/users')
  redirect(`/admin/users?notice=${encodeURIComponent(notice)}`)
}

/** Ban: flags the user (sign-in blocked by the admin plugin) and revokes all sessions. */
export async function banUserAction(formData: FormData): Promise<void> {
  const me = await requireAdmin()
  const target = await getUserById(String(formData.get('userId') ?? ''))
  if (!target) return done('User not found.')
  const blocked = banBlockReason(me.userId, target)
  if (blocked) return done(blocked)
  const reason =
    String(formData.get('reason') ?? '')
      .trim()
      .slice(0, 500) || null
  const { internalAdapter } = await auth.$context
  await internalAdapter.updateUser(target.id, { banned: true, banReason: reason, banExpires: null })
  await internalAdapter.deleteUserSessions(target.id)
  return done(`Banned ${target.email}.`)
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const target = await getUserById(String(formData.get('userId') ?? ''))
  if (!target) return done('User not found.')
  const { internalAdapter } = await auth.$context
  await internalAdapter.updateUser(target.id, { banned: false, banReason: null, banExpires: null })
  return done(`Unbanned ${target.email}.`)
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
