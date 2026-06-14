import { afterEach, describe, expect, it, vi } from 'vitest'

const mockUpsert = vi.fn()
const mockRevalidate = vi.fn()

vi.mock('@/lib/db/queries/site-settings', async (importOriginal) => {
  const mod: typeof import('@/lib/db/queries/site-settings') = await importOriginal()
  return { ...mod, upsertSetting: mockUpsert }
})
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))

function makeForm(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const validFields = {
  enabled: 'on',
  text: 'Free shipping over $50',
  link: '',
  bgColor: '#1a1a2e',
  textColor: '#ffffff'
}

afterEach(() => {
  mockUpsert.mockReset()
  mockRevalidate.mockReset()
})

describe('savePromoBarAction', () => {
  it('busts the WHOLE tree with revalidatePath("/", "layout") so ISR pages drop their promo bar', async () => {
    mockUpsert.mockResolvedValueOnce(undefined)
    const { savePromoBarAction } = await import('@/app/(admin)/admin/settings/actions')

    const result = await savePromoBarAction({}, makeForm(validFields))

    expect(result).toEqual({ saved: true })
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    // The promo bar lives in the root layout; '/' alone only revalidates the
    // home route. Once /artist + /category are ISR'd, the cached HTML embeds
    // the promo bar, so we must revalidate the whole layout subtree (spec §5).
    expect(mockRevalidate).toHaveBeenCalledWith('/', 'layout')
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/settings')
  })

  it('on invalid input returns the error and does not write or revalidate', async () => {
    const { savePromoBarAction } = await import('@/app/(admin)/admin/settings/actions')

    const result = await savePromoBarAction({}, makeForm({ ...validFields, text: '' }))

    expect(result?.error).toBeTruthy()
    expect(result?.saved).toBeUndefined()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
