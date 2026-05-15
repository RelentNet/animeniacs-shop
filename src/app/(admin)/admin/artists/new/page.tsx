import { ArtistForm } from '@/app/(admin)/admin/artists/_components/ArtistForm'
import { loadArtistCategoryOptions } from '@/app/(admin)/admin/artists/_components/SquareCategoryPicker'
import { createArtistAction } from './actions'

export const metadata = {
  title: 'New artist — admin'
}

export default async function NewArtistPage(): Promise<JSX.Element> {
  const categoryOptions = await loadArtistCategoryOptions()
  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>New artist</h1>
      <p>
        Fill in the fields below. Slug is permanent (used in <code>/artist/&lt;slug&gt;</code>), so
        pick carefully. Avatar is optional and gets resized to 500x500 webp on save.
      </p>
      <ArtistForm action={createArtistAction} categoryOptions={categoryOptions} mode="create" />
    </div>
  )
}
