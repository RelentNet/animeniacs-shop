import Image from 'next/image'

/**
 * Decorative infinite film-strip of art — a kinetic "wall of work" band. The
 * track holds the images twice so a -50% translate loops seamlessly. Purely
 * visual (aria-hidden); the strip scrolls continuously and does not pause.
 */
export function ArtMarquee({ images }: { images: string[] }): JSX.Element {
  const sequence = [...images, ...images]
  return (
    <div className="marquee py-4" aria-hidden="true">
      <div className="marquee-track gap-4">
        {sequence.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="hud relative h-48 w-32 shrink-0 overflow-hidden rounded-lg border border-line bg-wall-2 md:h-60 md:w-40"
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="160px"
              draggable={false}
              className="select-none object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
