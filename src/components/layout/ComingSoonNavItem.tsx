'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A nav entry for a section that isn't built yet (its route doesn't exist). It
 * looks like the surrounding nav text, but clicking it reveals a transient
 * "Coming soon" tooltip instead of navigating to a 404. Shared by the desktop
 * header and the mobile menu — pass the matching text classes via `className`
 * (and `wrapperClassName="relative block"` for the full-width mobile rows).
 */
export function ComingSoonNavItem({
  label,
  className = '',
  wrapperClassName = 'relative inline-block'
}: {
  label: string
  className?: string
  wrapperClassName?: string
}): JSX.Element {
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function reveal(): void {
    setShow(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setShow(false), 2200)
  }

  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        onClick={reveal}
        aria-label={`${label} — coming soon`}
        className={`cursor-pointer border-0 bg-transparent font-[inherit] text-[inherit] ${className}`}
      >
        {label}
      </button>
      {show && (
        <output className="absolute left-0 top-full z-50 mt-2 whitespace-nowrap rounded-md border border-neon/40 bg-ink-2 px-3 py-1.5 text-sm font-medium text-neon shadow-[0_0_22px_-6px_rgba(57,255,20,0.5)]">
          Coming soon
        </output>
      )}
    </span>
  )
}
