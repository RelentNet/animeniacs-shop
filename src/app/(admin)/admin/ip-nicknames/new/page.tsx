import { IpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { loadIpCategoryOptions } from '@/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker'
import { getAllIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { createIpNicknameAction } from './actions'

export const metadata = { title: 'New IP nickname — admin' }

export default async function NewIpNicknamePage(): Promise<JSX.Element> {
  const existing = await getAllIpNicknames()
  const mapped = new Set(existing.map((n) => n.squareCategoryId))
  const categoryOptions = await loadIpCategoryOptions(mapped)

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        New IP nickname
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Slug is permanent (used in{' '}
        <code className="font-mono text-purple-soft">/category/&lt;slug&gt;</code>
        ). Pick carefully. Square category names are staff-only — never displayed on the public
        page.
      </p>
      <div className="mt-6">
        <IpNicknameForm
          action={createIpNicknameAction}
          categoryOptions={categoryOptions}
          mode="create"
        />
      </div>
    </div>
  )
}
