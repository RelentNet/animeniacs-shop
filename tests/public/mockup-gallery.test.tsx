import { MockupGallery } from '@/components/product/MockupGallery'
import type { MockupScene } from '@/lib/mockup-scenes'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// The gallery now renders the clean artwork + scene overlays + thumbnails via
// `next/image` (downres). Stub it as a pass-through <img> that forwards every
// prop, so `src`, `alt`, `draggable`, and the block-save handlers stay
// inspectable in jsdom.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    sizes: _sizes,
    ...props
  }: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: test stub passes alt via props
    return <img {...props} />
  }
}))

const SCENES: MockupScene[] = [
  {
    id: 's1',
    name: 'Scene One',
    backgroundImage: '/images/mockup-scenes/style1.webp',
    aspectRatio: 1.6,
    productPosition: { top: '0', left: '0', width: '50%', height: '50%', transform: 'none' }
  },
  {
    id: 's2',
    name: 'Scene Two',
    backgroundImage: '/images/mockup-scenes/style2.webp',
    aspectRatio: 1,
    productPosition: { top: '10%', left: '10%', width: '40%', height: '40%', transform: 'none' }
  }
]

describe('<MockupGallery>', () => {
  it('defaults to the clean "Artwork" view (no scene active)', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    // Artwork toggle is pressed; neither scene is.
    expect(screen.getByRole('button', { name: /artwork \(clean view\)/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /scene: scene one/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    // The display announces the artwork view, and shows the product image.
    expect(screen.getByRole('img', { name: /test — artwork/i })).toBeInTheDocument()
    expect(screen.getByAltText('Test')).toHaveAttribute('src', expect.stringContaining('/img1.jpg'))
  })

  it('clicking a scene switches off the artwork view and flips aria-pressed', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const sceneTwo = screen.getByRole('button', { name: /scene: scene two/i })
    fireEvent.click(sceneTwo)
    expect(sceneTwo).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /artwork \(clean view\)/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    // Display label reflects the scene composite.
    expect(screen.getByRole('img', { name: /test on scene two/i })).toBeInTheDocument()
  })

  it('can return to the artwork view from a scene', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    fireEvent.click(screen.getByRole('button', { name: /scene: scene one/i }))
    fireEvent.click(screen.getByRole('button', { name: /artwork \(clean view\)/i }))
    expect(screen.getByRole('img', { name: /test — artwork/i })).toBeInTheDocument()
  })

  it('the displayed product image blocks right-click / drag saves', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const img = screen.getByAltText('Test')
    // The block-save deterrent: not draggable + handlers wired.
    expect(img).toHaveAttribute('draggable', 'false')
    const ctx = fireEvent.contextMenu(img)
    // contextMenu handler calls preventDefault → event reports as cancelled.
    expect(ctx).toBe(false)
  })

  it('renders product image thumbnails only when more than one image', () => {
    const { rerender } = render(
      <MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />
    )
    expect(screen.queryByRole('button', { name: /product image 1 of/i })).toBeNull()
    rerender(
      <MockupGallery scenes={SCENES} productImages={['/img1.jpg', '/img2.jpg']} productName="Test" />
    )
    expect(screen.getByRole('button', { name: /product image 1 of 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /product image 2 of 2/i })).toBeInTheDocument()
  })

  it('clicking a product image thumbnail swaps the displayed src', () => {
    render(
      <MockupGallery scenes={SCENES} productImages={['/img1.jpg', '/img2.jpg']} productName="Test" />
    )
    const displayed = screen.getByAltText('Test')
    expect(displayed).toHaveAttribute('src', expect.stringContaining('/img1.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /product image 2 of 2/i }))
    expect(screen.getByAltText('Test')).toHaveAttribute(
      'src',
      expect.stringContaining('/img2.jpg')
    )
  })

  it('arrow keys cycle artwork → scenes → back to artwork when focused', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const container = screen.getByRole('group', { name: /mockup gallery/i })
    container.focus()
    // Start on artwork. Right → scene one.
    fireEvent.keyDown(container, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: /scene: scene one/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Right → scene two.
    fireEvent.keyDown(container, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: /scene: scene two/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Right wraps back to artwork.
    fireEvent.keyDown(container, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: /artwork \(clean view\)/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Left from artwork wraps to the last scene.
    fireEvent.keyDown(container, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: /scene: scene two/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('empty productImages still renders without crash', () => {
    render(<MockupGallery scenes={SCENES} productImages={[]} productName="Test" />)
    expect(screen.getByLabelText(/no product image available/i)).toBeInTheDocument()
  })

  it('respects prefers-reduced-motion (data flag set)', () => {
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
    const display = screen.getByRole('img', { name: /test — artwork/i })
    expect(display).toHaveAttribute('data-reduced-motion', 'true')
  })
})
