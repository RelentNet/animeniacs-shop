import { describe, expect, it } from 'vitest'

// Smoke test for the better-auth instance (spec §11): the config must wire the
// adapter + expose the server API, and carry the two additionalFields the rest
// of the app depends on (squareCustomerId for Square mapping, role for admin
// gating). Importing `auth` also proves the config evaluates without throwing
// (env + adapter construction).
describe('auth config', () => {
  it('exposes the better-auth server API (getSession)', async () => {
    const { auth } = await import('@/lib/auth')
    expect(typeof auth.api.getSession).toBe('function')
  })

  it('declares squareCustomerId + role as user additionalFields (server-set only)', async () => {
    const { auth } = await import('@/lib/auth')
    const fields = auth.options.user?.additionalFields
    expect(fields?.squareCustomerId).toMatchObject({ type: 'string', input: false })
    expect(fields?.role).toMatchObject({ type: 'string', input: false, defaultValue: 'user' })
  })

  it('enables email+password with verification off this phase', async () => {
    const { auth } = await import('@/lib/auth')
    expect(auth.options.emailAndPassword?.enabled).toBe(true)
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false)
  })
})
