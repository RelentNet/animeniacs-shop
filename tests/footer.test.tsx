import { Footer } from '@/components/layout/Footer'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Footer', () => {
  it('has all four column headers', () => {
    render(<Footer />)
    expect(screen.getByRole('heading', { level: 2, name: 'Need help' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Follow us' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Partner with us' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Info' })).toBeInTheDocument()
  })

  it('links to all required Info pages', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'About us' })).toHaveAttribute('href', '/about-us')
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
      'href',
      '/terms-of-service'
    )
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy-policy'
    )
    expect(screen.getByRole('link', { name: 'Shipping policy' })).toHaveAttribute(
      'href',
      '/shipping-policy'
    )
    expect(screen.getByRole('link', { name: 'Refund & return policy' })).toHaveAttribute(
      'href',
      '/refund-return-policy'
    )
  })

  it('renders current year', () => {
    render(<Footer />)
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument()
  })
})
