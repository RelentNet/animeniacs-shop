/**
 * Infinite horizontal ticker. The track holds the items twice so a -50%
 * translate loops seamlessly (see `.marquee` in globals.css). Scrolls
 * continuously (no hover pause) and freezes under `prefers-reduced-motion`.
 */
export function Marquee({ items }: { items: string[] }): JSX.Element {
  const sequence = [...items, ...items]
  return (
    <div className="marquee select-none" aria-hidden="true">
      <div className="marquee-track">
        {sequence.map((item, i) => (
          <span key={`${item}-${i}`} className="inline-flex items-center">
            <span className="font-display text-2xl uppercase tracking-wide text-bone/80 md:text-3xl">
              {item}
            </span>
            <span className="mx-6 text-neon md:mx-8" aria-hidden="true">
              ✦
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
