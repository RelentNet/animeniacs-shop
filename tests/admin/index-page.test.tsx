import AdminIndexPage from '@/app/(admin)/admin/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('/admin index page', () => {
  it('renders a heading and links to every admin section', () => {
    render(<AdminIndexPage />)

    expect(screen.getByRole('heading', { level: 1, name: /admin/i })).toBeInTheDocument()

    const artists = screen.getByRole('link', { name: /artists/i })
    expect(artists).toHaveAttribute('href', '/admin/artists')

    const ipNicknames = screen.getByRole('link', { name: /ip nicknames/i })
    expect(ipNicknames).toHaveAttribute('href', '/admin/ip-nicknames')

    const smsRecipients = screen.getByRole('link', { name: /sms recipients/i })
    expect(smsRecipients).toHaveAttribute('href', '/admin/sms-recipients')
  })

  it('sets an explicit foreground/background so it survives dark mode', () => {
    const { container } = render(<AdminIndexPage />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.color).not.toBe('')
    expect(root.style.background).not.toBe('')
  })
})
