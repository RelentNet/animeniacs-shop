import { Reveal } from '@/components/home/Reveal'
import Image from 'next/image'

const POINTS = [
  {
    n: '01',
    label: 'Backlit-ready acrylic',
    body: 'Cast acrylic that catches light and makes color pop — lit from behind or just on your wall.'
  },
  {
    n: '02',
    label: 'Museum-grade print',
    body: 'High-res, color-true printing baked into the panel. Not a sticker on top — part of the piece.'
  },
  {
    n: '03',
    label: 'Built to last',
    body: 'UV-stable inks, polished edges, flush mounts. Ships protected, hangs clean.'
  }
]

/** "The craft" — sells the physical product with a glowing close-up + three points. */
export function CraftSection({ imageUrl }: { imageUrl?: string }): JSX.Element {
  return (
    <section aria-labelledby="craft" className="border-y border-line bg-wall">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <Reveal>
          <div className="card-street hud glow-purple relative mx-auto aspect-square w-full max-w-md overflow-hidden">
            <div className="scanlines absolute inset-0 z-10" />
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="A backlit acrylic art print"
                fill
                sizes="(max-width: 768px) 90vw, 440px"
                draggable={false}
                className="select-none object-cover"
              />
            ) : (
              <div className="aurora absolute inset-0" />
            )}
            <span className="sticker absolute bottom-4 left-4 z-20" aria-hidden="true">
              Backlit acrylic
            </span>
          </div>
        </Reveal>

        <div>
          <Reveal>
            <p className="eyebrow">The craft</p>
            <h2 id="craft" className="font-display mt-2 text-4xl text-bone md:text-5xl">
              Built to <span className="neon-text">glow</span>
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Every piece is printed on premium backlit acrylic — the kind of panel that turns a
              poster into a centerpiece. Here&apos;s what goes into it.
            </p>
          </Reveal>

          <dl className="mt-8 space-y-6">
            {POINTS.map((p, i) => (
              <Reveal key={p.n} delay={i * 90}>
                <div className="flex gap-4 border-t border-line pt-5">
                  <span className="font-mono text-sm text-neon">{p.n}</span>
                  <div>
                    <dt className="font-display text-2xl tracking-wide text-bone">{p.label}</dt>
                    <dd className="mt-1 max-w-sm text-sm text-muted">{p.body}</dd>
                  </div>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
