'use client'

import { Reveal } from '@/components/home/Reveal'
import { DropCard } from '@/components/home/DropCard'
import type { ArtistProduct } from '@/lib/square/items'
import { useCallback, useEffect, useRef, useState } from 'react'

function Arrow({ dir }: { dir: 'left' | 'right' }): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

/**
 * Horizontal product carousel. Makes its scrollability obvious (prev/next
 * controls + a right-edge fade) and fixes the overflow: `overflow-x: auto`
 * forces `overflow-y` to `auto`, which both allowed stray vertical scroll and
 * clipped the cards' hover glow. We pin `overflow-y: hidden` and pad vertically
 * so the lift + glow live inside the track.
 */
export function DropCarousel({ products }: { products: ArtistProduct[] }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    // tolerate the container's horizontal padding / snap offset at the extremes
    setAtStart(el.scrollLeft <= 24)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 24)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  // -mx-4 lives on this wrapper (not the track) so the fade + arrows, which are
  // positioned against this box, align with the track's real edges.
  return (
    <div className="relative -mx-4 mt-8">
      {/* Track. overflow-y hidden kills the stray vertical scroll; pt/pb give the
          hover lift + glow room so they aren't clipped. */}
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto overflow-y-hidden px-4 pt-6 pb-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product, i) => (
          <Reveal
            key={product.id}
            delay={Math.min(i, 6) * 70}
            className="w-[230px] shrink-0 snap-start sm:w-[260px]"
          >
            <DropCard product={product} isNew={i < 3} />
          </Reveal>
        ))}
      </div>

      {/* Right-edge fade — signals there's more to scroll. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ink to-transparent transition-opacity duration-300 ${atEnd ? 'opacity-0' : 'opacity-100'}`}
      />

      {/* Prev / next controls — desktop affordance (touch users swipe). */}
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={atStart}
        aria-label="Previous items"
        className="absolute left-1 top-[42%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-ink/80 text-bone backdrop-blur-md transition-all hover:border-neon hover:text-neon disabled:pointer-events-none disabled:opacity-30 sm:flex"
      >
        <Arrow dir="left" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={atEnd}
        aria-label="Next items"
        className="absolute right-1 top-[42%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-ink/80 text-bone backdrop-blur-md transition-all hover:border-neon hover:text-neon disabled:pointer-events-none disabled:opacity-30 sm:flex"
      >
        <Arrow dir="right" />
      </button>
    </div>
  )
}
