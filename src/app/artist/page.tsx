import { getActiveArtists } from '@/lib/db/queries/artists'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

// ISR (Phase 16, spec §3): public artists list, regenerated at most every
// 5 minutes. Admin artist mutations already revalidate `/artist`, so changes
// propagate on save too. Build tolerance (spec §4): during `next build` the
// data read below is skipped (the builder can't reach Postgres) and we render
// the empty shell; the first runtime regeneration fills the list in.
export const revalidate = 300

export const metadata = {
  title: 'Artists | Animeniacs',
  description: 'Browse the artists who make every Animeniacs drop.'
}

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

export default async function ArtistGalleryPage(): Promise<JSX.Element> {
  const artists = isBuildPhase ? [] : await getActiveArtists()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <header className="mb-10">
        <p className="eyebrow">The crew</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Artists</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Every Animeniacs drop is made with one of our partner artists. Browse them all.
        </p>
      </header>

      {artists.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {artists.map((a) => (
            <li key={a.id}>
              <Link
                href={`/artist/${a.slug}` as Route}
                className="group block rounded-lg p-3 transition-colors hover:bg-wall hover:no-underline"
              >
                <Avatar src={a.avatarUrl} alt={a.displayName} />
                <div className="mt-3 text-center text-sm font-medium text-bone transition-colors group-hover:text-neon">
                  {a.displayName}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Avatar({ src, alt }: { src: string | null; alt: string }): JSX.Element {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={300}
        height={300}
        draggable={false}
        className="aspect-square w-full select-none rounded-full border border-line object-cover transition group-hover:border-neon"
      />
    )
  }
  // Initials-only placeholder for artists without an avatar yet.
  const initials = alt
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
  return (
    <div
      aria-hidden="true"
      className="font-display flex aspect-square w-full items-center justify-center rounded-full border border-line bg-wall-2 text-3xl text-purple-soft transition group-hover:border-neon"
    >
      {initials || '?'}
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="panel p-10 text-center">
      <p className="text-muted">No artists yet — check back soon.</p>
    </div>
  )
}
