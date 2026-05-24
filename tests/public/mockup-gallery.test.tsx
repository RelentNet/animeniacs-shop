import { MockupGallery } from '@/components/product/MockupGallery'
import type { MockupScene } from '@/lib/mockup-scenes'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const SCENES: MockupScene[] = [
  {
    id: 's1',
    name: 'Scene One',
    backgroundImage: '/images/mockup-scenes/style1.webp',
    productPosition: { top: '0', left: '0', width: '50%', height: '50%', transform: 'none' }
  },
  {
    id: 's2',
    name: 'Scene Two',
    backgroundImage: '/images/mockup-scenes/style2.webp',
    productPosition: { top: '10%', left: '10%', width: '40%', height: '40%', transform: 'none' }
  }
]

describe('<MockupGallery>', () => {
  it('renders scene thumbnails with aria-pressed reflecting active scene', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const sceneOne = screen.getByRole('button', { name: /scene: scene one/i })
    const sceneTwo = screen.getByRole('button', { name: /scene: scene two/i })
    expect(sceneOne).toHaveAttribute('aria-pressed', 'true')
    expect(sceneTwo).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching scenes flips aria-pressed', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const sceneTwo = screen.getByRole('button', { name: /scene: scene two/i })
    fireEvent.click(sceneTwo)
    expect(sceneTwo).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders product image thumbnails only when more than one image', () => {
    const { rerender } = render(
      <MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />
    )
    expect(screen.queryByRole('button', { name: /product image 1 of/i })).toBeNull()
    rerender(
      <MockupGallery
        scenes={SCENES}
        productImages={['/img1.jpg', '/img2.jpg']}
        productName="Test"
      />
    )
    expect(screen.getByRole('button', { name: /product image 1 of 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /product image 2 of 2/i })).toBeInTheDocument()
  })

  it('clicking a product image thumbnail swaps the overlay src', () => {
    render(
      <MockupGallery
        scenes={SCENES}
        productImages={['/img1.jpg', '/img2.jpg']}
        productName="Test"
      />
    )
    const overlay = screen.getByAltText(/test/i)
    expect(overlay).toHaveAttribute('src', expect.stringContaining('/img1.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /product image 2 of 2/i }))
    expect(overlay).toHaveAttribute('src', expect.stringContaining('/img2.jpg'))
  })

  it('arrow keys cycle scenes when the container has focus', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const container = screen.getByRole('group', { name: /mockup gallery/i })
    container.focus()
    fireEvent.keyDown(container, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: /scene: scene two/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.keyDown(container, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: /scene: scene one/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('empty productImages still renders the active scene without crash', () => {
    render(<MockupGallery scenes={SCENES} productImages={[]} productName="Test" />)
    expect(screen.getByLabelText(/no product image available/i)).toBeInTheDocument()
  })

  it('respects prefers-reduced-motion (no transition class applied)', () => {
    // jsdom does not implement matchMedia by default; supply a stub.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const display = screen.getByRole('img', { name: /test on scene one/i })
    // The component sets a data-reduced-motion="true" attribute when the
    // media query matches; we assert that signal rather than CSS specifics.
    expect(display).toHaveAttribute('data-reduced-motion', 'true')
  })
})
