import { describe, expect, it } from 'vitest'
import { postLoginDestination } from '@/lib/auth/post-login-destination'

describe('postLoginDestination', () => {
  it('routes admins to /admin', () => {
    expect(postLoginDestination(['admin'])).toBe('/admin')
    expect(postLoginDestination(['customer', 'admin'])).toBe('/admin')
  })

  it('routes non-admin users to /account', () => {
    expect(postLoginDestination([])).toBe('/account')
    expect(postLoginDestination(['customer'])).toBe('/account')
  })
})
