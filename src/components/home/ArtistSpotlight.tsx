import { Reveal } from '@/components/home/Reveal'
import type { ArtistSpotlight as Spotlight } from '@/lib/products/spotlight'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

const SOCIAL_FIELDS: { key: 'instagram' | 'twitter' | 'tiktok' | 'youtube'; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' }
]

/** Homepage artist spotlight — humanizes the brand: one artist + a few of their pieces. */
export function ArtistSpotlight({ spotlight }: { spotlight: Spotlight }): JSX.Element {
  const { artist, works } = spotlight
  const socials = SOCIAL_FIELDS.map((f) => ({ ...f, href: artist[f.key] })).filter(
    (s): s is { key: typeof s.key; label: string; href: string } => Boolean(s.href)
  )
  const profile = `/artist/${artist.slug}` as Route

  return (
    <section aria-labelledby="spotlight" className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <Reveal>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Meet the crew</p>
            <h2 id="spotlight" className="font-display mt-2 text-4xl text-bone md:text-5xl">
              Featured artist
            </h2>
          </div>
          <Link href={'/artist' as Route} className="link-neon hidden text-sm font-medium sm:block">
            All artists →
          </Link>
        </div>
      </Reveal>

      <Reveal className="mt-8">
        <div className="card-street scanlines grid gap-8 overflow-hidden p-6 md:grid-cols-[0.85fr_1.15fr] md:p-8">
          {/* Artist */}
          <div className="flex flex-col">
            <div className="flex items-center gap-4">
              <div className="hud glow-neon relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line-strong">
                {artist.avatarUrl ? (
                  <Image
                    src={artist.avatarUrl}
                    alt={artist.displayName}
                    fill
                    sizes="80px"
                    draggable={false}
                    className="select-none object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-wall-2 font-display text-3xl text-purple-soft">
                    {artist.displayName.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <p className="eyebrow">Artist</p>
                <p className="font-display text-3xl text-bone">{artist.displayName}</p>
              </div>
            </div>

            {artist.bio && (
              <p className="mt-5 text-sm leading-relaxed text-muted">{artist.bio}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={profile} className="btn-neon">
                View the collection
                <span aria-hidden="true">→</span>
              </Link>
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-muted transition-colors hover:border-neon hover:text-neon hover:no-underline"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Their work */}
          {works.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
              {works.map((work) => (
                <Link
                  key={work.id}
                  href={`/product/${work.id}` as Route}
                  className="group block hover:no-underline"
                >
                  <div className="hud relative aspect-[2/3] overflow-hidden rounded-md border border-line bg-wall-2">
                    {work.imageUrl && (
                      <Image
                        src={work.imageUrl}
                        alt={work.name}
                        fill
                        sizes="(max-width: 768px) 45vw, 180px"
                        draggable={false}
                        className="select-none object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs text-muted group-hover:text-bone">
                    {work.name}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </section>
  )
}
