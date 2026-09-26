import { getAllIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { getCategoryNameMap } from '@/lib/square/categories'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'IP nicknames — admin'
}

export default async function AdminIpNicknamesListPage(): Promise<JSX.Element> {
  const [nicknames, categoryNames] = await Promise.all([getAllIpNicknames(), getCategoryNameMap()])

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
            IP nicknames ({nicknames.length})
          </h1>
        </div>
        <Link href={'/admin/ip-nicknames/new' as Route} className="btn-neon">
          + New nickname
        </Link>
      </header>

      {nicknames.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className={th}>Public?</th>
              <th className={th}>Nickname</th>
              <th className={th}>Slug</th>
              <th className={th}>Square category (staff-only)</th>
              <th className={th}>Description</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {nicknames.map((n) => {
              const catName = categoryNames.get(n.squareCategoryId) ?? '(unknown)'
              const trimmedDesc = n.description
                ? n.description.length > 80
                  ? `${n.description.slice(0, 80)}…`
                  : n.description
                : ''
              return (
                <tr key={n.id} className="border-b border-line hover:bg-wall-2">
                  <td className={td}>
                    <PublicBadge isPublic={n.isPublic} />
                  </td>
                  <td className={`${td} text-bone`}>{n.nickname}</td>
                  <td className={td}>
                    <code className="font-mono text-purple-soft">{n.slug}</code>
                  </td>
                  <td className={`${td} text-muted`}>{catName}</td>
                  <td className={`${td} text-muted`}>{trimmedDesc}</td>
                  <td className={td}>
                    <Link href={`/admin/ip-nicknames/${n.id}` as Route} className="link-neon">
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const th = 'py-2 px-3 font-medium'
const td = 'py-2 px-3 align-top'

function EmptyState(): JSX.Element {
  return (
    <div className="panel mt-6 p-8 text-center">
      <p className="text-muted">No nicknames yet.</p>
      <Link href={'/admin/ip-nicknames/new' as Route} className="link-neon mt-2 inline-block">
        Create the first one
      </Link>
    </div>
  )
}

function PublicBadge({ isPublic }: { isPublic: boolean }): JSX.Element {
  return (
    <span
      className={
        isPublic
          ? 'rounded-full bg-neon/15 px-2 py-0.5 text-xs font-medium text-neon-soft'
          : 'rounded-full bg-wall-2 px-2 py-0.5 text-xs font-medium text-muted'
      }
    >
      {isPublic ? 'Public' : 'Hidden'}
    </span>
  )
}
