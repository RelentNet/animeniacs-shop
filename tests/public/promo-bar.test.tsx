import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetSetting } = vi.hoisted(() => ({ mockGetSetting: vi.fn() }))
vi.mock('@/lib/db/queries/site-settings', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/queries/site-settings')>()
  return { ...actual, getSetting: mockGetSetting }
})

import { PromoBar } from '@/components/layout/PromoBar'

const base = {
  enabled: true,
  text: 'Free shipping over $50',
  link: '',
  bgColor: '#1a1a2e',
  textColor: '#ffffff'
}

describe('PromoBar', () => {
  it('renders nothing when the setting is missing', async () => {
    mockGetSetting.mockResolvedValueOnce(null)
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when disabled', async () => {
    mockGetSetting.mockResolvedValueOnce({ ...base, enabled: false })
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })

  it('renders the bar text when enabled', async () => {
    mockGetSetting.mockResolvedValueOnce(base)
    const { getByText } = render(await PromoBar())
    expect(getByText('Free shipping over $50')).toBeTruthy()
  })

  it('wraps text in a link when link is present', async () => {
    mockGetSetting.mockResolvedValueOnce({ ...base, link: 'https://example.com/sale' })
    const { getByRole } = render(await PromoBar())
    const a = getByRole('link') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://example.com/sale')
  })

  it('applies bgColor and textColor as inline styles', async () => {
    mockGetSetting.mockResolvedValueOnce(base)
    const { getByRole } = render(await PromoBar())
    const region = getByRole('region')
    expect(region.style.background).toContain('rgb(26, 26, 46)') // #1a1a2e
    expect(region.style.color).toContain('rgb(255, 255, 255)') // #ffffff
  })

  it('renders nothing when the stored value fails schema validation', async () => {
    mockGetSetting.mockResolvedValueOnce({ enabled: true, text: '' }) // invalid
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })
})
