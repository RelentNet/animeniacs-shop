import { getAllArtists } from '@/lib/db/queries/artists'
import { getCategoryNameMap } from '@/lib/square/categories'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Artists — admin'
}

export default async function AdminArtistsListPage(): Promise<JSX.Element> {
  const [artists, categoryNames] = await Promise.all([getAllArtists(), getCategoryNameMap()])

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
            Artists ({artists.length})
          </h1>
        </div>
        <Link href={'/admin/artists/new' as Route} className="btn-neon">
          + New artist
        </Link>
      </header>

      {artists.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className={th}>Status</th>
              <th className={th}>Display name</th>
              <th className={th}>Slug</th>
              <th className={th}>Square category</th>
              <th className={th}>Commission</th>
              <th className={th}>Avatar</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {artists.map((a) => {
              const catName = categoryNames.get(a.squareCategoryId) ?? '(unknown)'
              return (
                <tr key={a.id} className="border-b border-line hover:bg-wall-2">
                  <td className={td}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td className={`${td} text-bone`}>{a.displayName}</td>
                  <td className={td}>
                    <code className="font-mono text-purple-soft">{a.slug}</code>
                  </td>
                  <td className={`${td} text-muted`}>{catName}</td>
                  <td className={`${td} font-mono text-bone`}>
                    {(Number(a.commissionRate) * 100).toFixed(2)}%
                  </td>
                  <td className={`${td} text-muted`}>{a.avatarUrl ? 'yes' : '—'}</td>
                  <td className={td}>
                    <Link href={`/admin/artists/${a.id}` as Route} className="link-neon">
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
      <p className="text-muted">No artists yet.</p>
      <Link href={'/admin/artists/new' as Route} className="link-neon mt-2 inline-block">
        Create the first one
      </Link>
    </div>
  )
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const isActive = status === 'active'
  return (
    <span
      className={
        isActive
          ? 'rounded-full bg-neon/15 px-2 py-0.5 text-xs font-medium text-neon-soft'
          : 'rounded-full bg-wall-2 px-2 py-0.5 text-xs font-medium text-muted'
      }
    >
      {status}
    </span>
  )
}
