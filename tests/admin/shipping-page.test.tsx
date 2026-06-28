import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// useFormState (react-dom) is undefined under the jsdom/SSR transform used by
// these unit tests; stub it to a stable [state, action] tuple so the client
// form renders its inputs.
vi.mock('react-dom', async (orig) => {
  const actual = await orig<typeof import('react-dom')>()
  return { ...actual, useFormState: (_action: unknown, initial: unknown) => [initial, vi.fn()] }
})

const { mockGetShippingSettings } = vi.hoisted(() => ({ mockGetShippingSettings: vi.fn() }))
vi.mock('@/lib/db/queries/shipping-settings', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/queries/shipping-settings')>()
  return { ...actual, getShippingSettings: mockGetShippingSettings }
})
vi.mock('@/app/(admin)/admin/shipping/actions', () => ({ saveShippingAction: vi.fn() }))

import { DEFAULT_SHIPPING_SETTINGS } from '@/lib/db/queries/shipping-settings'
import ShippingPage from '@/app/(admin)/admin/shipping/page'

describe('ShippingPage', () => {
  it('pre-populates origin + fees + per-box packaging fees from settings', async () => {
    mockGetShippingSettings.mockResolvedValueOnce({
      ...DEFAULT_SHIPPING_SETTINGS,
      shipFrom: { ...DEFAULT_SHIPPING_SETTINGS.shipFrom, city: 'Marrero' },
      decalFlatCents: 500,
      packagingFeesCents: { single_acrylic: 250, frame: 125, '3_frames': 400 }
    })
    const { getByDisplayValue } = render(await ShippingPage())
    expect(getByDisplayValue('Marrero')).toBeTruthy() // ship-from origin
    expect(getByDisplayValue('5.00')).toBeTruthy() // decal flat fee ($)
    expect(getByDisplayValue('2.50')).toBeTruthy() // single-acrylic packaging fee
    expect(getByDisplayValue('4.00')).toBeTruthy() // 3-frame packaging fee
  })
})
