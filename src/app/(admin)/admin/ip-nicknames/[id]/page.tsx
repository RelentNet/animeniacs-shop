import { IpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { loadIpCategoryOptions } from '@/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker'
import { getAllIpNicknames, getIpNicknameById } from '@/lib/db/queries/ip-nicknames'
import { notFound } from 'next/navigation'
import { updateIpNicknameAction } from './actions'

export const metadata = { title: 'Edit IP nickname — admin' }

interface PageProps {
  params: { id: string }
}

export default async function EditIpNicknamePage({ params }: PageProps): Promise<JSX.Element> {
  const nickname = await getIpNicknameById(params.id)
  if (!nickname) notFound()

  const all = await getAllIpNicknames()
  // Re-include the current row's category id so it stays selectable.
  const mapped = new Set(
    all.map((n) => n.squareCategoryId).filter((id) => id !== nickname.squareCategoryId)
  )
  const categoryOptions = await loadIpCategoryOptions(mapped)

  const boundAction = updateIpNicknameAction.bind(null, nickname.id)

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        Edit IP nickname: {nickname.nickname}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Slug is read-only here (changing it would break{' '}
        <code className="font-mono text-purple-soft">/category/{nickname.slug}</code>). Toggle
        visibility to hide the public page without deleting the row.
      </p>
      <div className="mt-6">
        <IpNicknameForm
          action={boundAction}
          categoryOptions={categoryOptions}
          initial={nickname}
          mode="edit"
        />
      </div>
    </div>
  )
}
