import { ArtistForm } from '@/app/(admin)/admin/artists/_components/ArtistForm'
import { loadArtistCategoryOptions } from '@/app/(admin)/admin/artists/_components/SquareCategoryPicker'
import { yearMonthInZone } from '@/lib/commissions/calc'
import { getArtistById, getArtistRateHistory } from '@/lib/db/queries/artists'
import { notFound } from 'next/navigation'
import { updateArtistAction } from './actions'

export const metadata = {
  title: 'Edit artist — admin'
}

interface PageProps {
  params: { id: string }
}

export default async function EditArtistPage({ params }: PageProps): Promise<JSX.Element> {
  const artist = await getArtistById(params.id)
  if (!artist) {
    notFound()
  }

  const [categoryOptions, rateHistory] = await Promise.all([
    loadArtistCategoryOptions(),
    getArtistRateHistory(artist.id)
  ])
  // Bind the artist id into the action so the form doesn't need to
  // send it back (and so a tampered DOM can't change which row gets
  // patched).
  const boundAction = updateArtistAction.bind(null, artist.id)

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        Edit artist: {artist.displayName}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Slug is read-only here (changing it would break existing public URLs). Upload a new avatar
        file to replace the current one; leave the avatar field empty to keep what’s already there.
      </p>
      <div className="mt-6">
        <ArtistForm
          action={boundAction}
          categoryOptions={categoryOptions}
          initial={artist}
          mode="edit"
          defaultEffectiveFrom={yearMonthInZone(new Date().toISOString())}
        />
      </div>

      <h2 className="eyebrow mt-10 text-purple-soft">Commission rate history</h2>
      <table className="mt-3 border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-muted">
            <th className="px-3 py-2 font-medium">Effective from</th>
            <th className="px-3 py-2 text-right font-medium">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rateHistory.map((r) => (
            <tr key={r.id} className="border-b border-line">
              <td className="px-3 py-2 font-mono text-bone">{r.effectiveFrom}</td>
              <td className="px-3 py-2 text-right font-mono text-bone">
                {(Number(r.rate) * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
