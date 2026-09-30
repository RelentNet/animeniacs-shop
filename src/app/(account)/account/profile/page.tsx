import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getArtistById } from '@/lib/db/queries/artists'
import { getArtistByAccountEmail } from '@/lib/db/queries/commissions'
import { notFound } from 'next/navigation'
import { ProfileForm } from './_components/ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your artist profile | Animeniacs' }

export default async function ProfilePage(): Promise<JSX.Element> {
  const { email } = await getCurrentUser()
  const linked = email ? await getArtistByAccountEmail(email) : null
  const artist = linked ? await getArtistById(linked.id) : undefined
  // Only linked artists see this page.
  if (!artist) notFound()

  return (
    <section>
      <p className="eyebrow">Artist profile</p>
      <h1 className="mt-2 font-display text-4xl text-bone">{artist.displayName}</h1>
      <p className="mt-2 max-w-prose text-muted">
        This is your public artist page. Name, slug, commission and status are managed by the shop;
        contact us to change those. Every change here is logged.
      </p>
      <div className="mt-6">
        <ProfileForm artist={artist} />
      </div>
    </section>
  )
}
