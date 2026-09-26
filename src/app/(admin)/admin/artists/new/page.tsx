import { ArtistForm } from '@/app/(admin)/admin/artists/_components/ArtistForm'
import { loadArtistCategoryOptions } from '@/app/(admin)/admin/artists/_components/SquareCategoryPicker'
import { createArtistAction } from './actions'

export const metadata = {
  title: 'New artist — admin'
}

export default async function NewArtistPage(): Promise<JSX.Element> {
  const categoryOptions = await loadArtistCategoryOptions()
  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">New artist</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Fill in the fields below. Slug is permanent (used in{' '}
        <code className="font-mono text-purple-soft">/artist/&lt;slug&gt;</code>), so pick
        carefully. Avatar is optional and gets resized to 500x500 webp on save.
      </p>
      <div className="mt-6">
        <ArtistForm action={createArtistAction} categoryOptions={categoryOptions} mode="create" />
      </div>
    </div>
  )
}
