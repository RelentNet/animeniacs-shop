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
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>New IP nickname</h1>
      <p>
        Slug is permanent (used in <code>/category/&lt;slug&gt;</code>). Pick carefully. Square
        category names are staff-only — never displayed on the public page.
      </p>
      <IpNicknameForm
        action={createIpNicknameAction}
        categoryOptions={categoryOptions}
        mode="create"
      />
    </div>
  )
}
