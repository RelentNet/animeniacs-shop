import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// useFormState (react-dom) is undefined under the jsdom/SSR transform used by
// these unit tests; stub it to a stable [state, action] tuple so the client
// form renders its inputs. The component contract is unchanged in production.
vi.mock('react-dom', async (orig) => {
  const actual = await orig<typeof import('react-dom')>()
  return { ...actual, useFormState: (_action: unknown, initial: unknown) => [initial, vi.fn()] }
})

const { mockGetSetting } = vi.hoisted(() => ({ mockGetSetting: vi.fn() }))
vi.mock('@/lib/db/queries/site-settings', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/queries/site-settings')>()
  return { ...actual, getSetting: mockGetSetting }
})
vi.mock('@/app/(admin)/admin/settings/actions', () => ({
  savePromoBarAction: vi.fn()
}))

import SettingsPage from '@/app/(admin)/admin/settings/page'

describe('SettingsPage', () => {
  it('pre-populates the form from the stored promo_bar value', async () => {
    mockGetSetting.mockResolvedValueOnce({
      enabled: true,
      text: 'Stored text',
      link: '',
      bgColor: '#111111',
      textColor: '#eeeeee'
    })
    const { getByDisplayValue } = render(await SettingsPage())
    expect(getByDisplayValue('Stored text')).toBeTruthy()
    expect(getByDisplayValue('#111111')).toBeTruthy()
  })

  it('renders defaults when no setting exists', async () => {
    mockGetSetting.mockResolvedValueOnce(null)
    const { getByDisplayValue } = render(await SettingsPage())
    expect(getByDisplayValue('#1a1a2e')).toBeTruthy() // default bgColor
  })
})
