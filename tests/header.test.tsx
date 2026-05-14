import { Header } from '@/components/layout/Header'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Header', () => {
  it('renders the brand name', () => {
    render(<Header />)
    expect(screen.getByText('Animeniacs')).toBeInTheDocument()
  })

  it('includes primary navigation links', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Shop' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Artists' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cart' })).toBeInTheDocument()
  })
})
