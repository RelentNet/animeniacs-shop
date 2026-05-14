import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Square SDK. The real package takes ~4s to evaluate on first load,
// which can blow the default 5s test timeout when the cache is cold.
// We're only verifying the singleton wiring here, not Square's internals.
vi.mock('square', () => {
  class SquareClient {
    constructor(public readonly config: { token: string; environment: string }) {}
  }
  return {
    SquareClient,
    SquareEnvironment: {
      Sandbox: 'sandbox',
      Production: 'production'
    }
  }
})

describe('Square client singleton', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    const mod = await import('@/lib/square/client')
    mod.__resetSquareClientForTests()
  })

  it('throws a clear error if SQUARE_ACCESS_TOKEN is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', undefined)
    const mod = await import('@/lib/square/client')
    mod.__resetSquareClientForTests()
    expect(() => mod.getSquareClient()).toThrow(/SQUARE_ACCESS_TOKEN is not set/)
  })

  it('constructs a client when SQUARE_ACCESS_TOKEN is set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_sandbox_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'sandbox')
    const mod = await import('@/lib/square/client')
    mod.__resetSquareClientForTests()
    const client = mod.getSquareClient()
    expect(client).toBeDefined()
    expect((client as unknown as { config: { environment: string } }).config.environment).toBe(
      'sandbox'
    )
    // Singleton: second call returns the same instance.
    expect(mod.getSquareClient()).toBe(client)
  })

  it('selects Production environment when SQUARE_ENV=production', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_prod_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'production')
    const mod = await import('@/lib/square/client')
    mod.__resetSquareClientForTests()
    const client = mod.getSquareClient()
    expect(client).toBeDefined()
    expect((client as unknown as { config: { environment: string } }).config.environment).toBe(
      'production'
    )
  })
})
