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
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Edit IP nickname: {nickname.nickname}</h1>
      <p>
        Slug is read-only here (changing it would break <code>/category/{nickname.slug}</code>).
        Toggle visibility to hide the public page without deleting the row.
      </p>
      <IpNicknameForm
        action={boundAction}
        categoryOptions={categoryOptions}
        initial={nickname}
        mode="edit"
      />
    </div>
  )
}
