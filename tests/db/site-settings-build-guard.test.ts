import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the db client so we can assert whether a query was ever constructed.
// .select().from().where().limit() is the readSetting() chain.
const limit = vi.fn()
const where = vi.fn(() => ({ limit }))
const from = vi.fn(() => ({ where }))
const select = vi.fn(() => ({ from }))
const mockDb = { select }

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

// Stub unstable_cache so the inner readSetting runs directly — vitest has no
// incremental-cache context, and we only care here about whether the db is hit.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn
}))

beforeEach(() => {
  select.mockClear()
  from.mockClear()
  where.mockClear()
  limit.mockReset().mockResolvedValue([{ value: { enabled: true, text: 'hi' } }])
  vi.resetModules()
})

afterEach(() => {
  // vi.stubEnv saves+restores process.env for us; this guarantees no leak of
  // build-phase state to other test files.
  vi.unstubAllEnvs()
})

describe('getSetting build-phase guard', () => {
  it('returns null WITHOUT touching the db during the build phase', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    const { getSetting } = await import('@/lib/db/queries/site-settings')

    await expect(getSetting('promo_bar')).resolves.toBeNull()
    expect(select).not.toHaveBeenCalled()
  })

  it('reads through the (cached) db query when NOT in the build phase', async () => {
    vi.stubEnv('NEXT_PHASE', undefined)
    const { getSetting } = await import('@/lib/db/queries/site-settings')

    const result = await getSetting('promo_bar')
    expect(result).toEqual({ enabled: true, text: 'hi' })
    expect(select).toHaveBeenCalledTimes(1)
  })
})
