import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env loader', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('parses a valid DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'
    const mod = await import('../src/lib/env')
    expect(mod.env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db')
  })

  it('defaults NEXT_PUBLIC_SITE_URL to localhost', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'
    // biome-ignore lint/performance/noDelete: must actually unset env var so zod default applies
    delete process.env.NEXT_PUBLIC_SITE_URL
    const mod = await import('../src/lib/env')
    expect(mod.env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
  })

  it('throws on missing DATABASE_URL', async () => {
    // biome-ignore lint/performance/noDelete: must actually unset env var to trigger Required error
    delete process.env.DATABASE_URL
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })
})
