'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * Reveals its children once, the first time they scroll into view. Pure
 * presentation — no layout impact. Falls back to visible immediately when
 * IntersectionObserver is unavailable, and the `.reveal` CSS short-circuits to
 * visible under `prefers-reduced-motion`.
 */
export function Reveal({
  children,
  className,
  delay = 0
}: {
  children: ReactNode
  className?: string
  delay?: number
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? 'is-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
