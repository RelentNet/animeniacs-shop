import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env loader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses a valid DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db')
    const mod = await import('../src/lib/env')
    expect(mod.env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db')
  })

  it('defaults NEXT_PUBLIC_SITE_URL to localhost', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db')
    // undefined unsets the var so zod's .default() applies. An empty string
    // would fail .url() before .default() ever kicks in.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const mod = await import('../src/lib/env')
    expect(mod.env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
  })

  it('throws on missing DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', undefined)
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })

  it('defaults SQUARE_ENV to sandbox', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ENV', undefined)
    const mod = await import('../src/lib/env')
    expect(mod.env.SQUARE_ENV).toBe('sandbox')
  })

  it('rejects an invalid SQUARE_ENV value', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ENV', 'staging')
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })
})
