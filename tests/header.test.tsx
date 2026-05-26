import { Header } from '@/components/layout/Header'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithCart } from './cart/helpers'

describe('Header', () => {
  it('renders the brand name', () => {
    renderWithCart(<Header />)
    expect(screen.getByText('Animeniacs')).toBeInTheDocument()
  })

  it('includes primary navigation links', () => {
    renderWithCart(<Header />)
    expect(screen.getByRole('link', { name: 'Shop' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Artists' })).toBeInTheDocument()
  })

  it('renders the cart button', () => {
    renderWithCart(<Header />)
    expect(screen.getByRole('button', { name: /open cart/i })).toBeInTheDocument()
  })
})
