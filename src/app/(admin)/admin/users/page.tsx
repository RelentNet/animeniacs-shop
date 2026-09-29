import { isAdminAccount } from '@/lib/admin/ban-guard'
import { getUserSummary, listUsers } from '@/lib/db/queries/users'
import type { Route } from 'next'
import Link from 'next/link'
import {
  banSelectedAction,
  banUserAction,
  sendPasswordResetAction,
  unbanSelectedAction,
  unbanUserAction
} from './actions'
import { BulkBar, SelectAll } from './bulk-controls'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Users — admin'
}

const th = 'py-2 px-3 font-medium'
const td = 'py-2 px-3 align-top'
const badge = 'rounded border px-1.5 py-0.5 text-xs'
const linkBtn = 'text-neon-soft underline hover:text-neon'

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: {
    view?: string | string[]
    q?: string | string[]
    page?: string | string[]
    notice?: string | string[]
  }
}): Promise<JSX.Element> {
  const q = first(searchParams.q)?.trim() || undefined
  const notice = first(searchParams.notice)
  const view = first(searchParams.view) === 'banned' ? 'banned' : 'active'
  const isBanned = view === 'banned'
  const [{ rows, total, page, pageSize }, summary] = await Promise.all([
    listUsers({ q, view, page: Number(first(searchParams.page)) || 1 }),
    getUserSummary()
  ])
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (p: number) =>
    `/admin/users?${new URLSearchParams({ view, ...(q ? { q } : {}), page: String(p) })}` as Route

  return (
    <div>
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">Users</h1>
        <p className="mt-2 text-muted">
          {summary.total} accounts · {summary.last24h} sign-ups in 24h · {summary.last7d} in 7d ·{' '}
          {summary.noOrders} with 0 orders · {summary.banned} banned
        </p>
      </header>

      {notice && <output className="panel mt-4 block p-3 text-sm text-bone">{notice}</output>}

      <nav aria-label="Users view" className="mt-6 flex gap-6 border-b border-line text-sm">
        {(['active', 'banned'] as const).map((v) => (
          <Link
            key={v}
            href={`/admin/users?view=${v}` as Route}
            className={`-mb-px border-b-2 pb-2 ${view === v ? 'border-neon text-neon' : 'border-transparent text-muted hover:text-bone'}`}
          >
            {v === 'active' ? 'Users' : `Banned (${summary.banned})`}
          </Link>
        ))}
      </nav>

      <form method="get" className="mt-6 flex gap-3">
        <input type="hidden" name="view" value={view} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email or name"
          className="field-input max-w-sm"
        />
        <button type="submit" className="btn-neon">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="text-muted">No users match.</p>
        </div>
      ) : (
        <>
          <BulkBar
            action={isBanned ? unbanSelectedAction : banSelectedAction}
            label={isBanned ? 'Unban selected' : 'Ban selected'}
            withReason={!isBanned}
          />
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-muted">
                <th className={th}>
                  <SelectAll />
                </th>
                <th className={th}>Email</th>
                <th className={th}>Name</th>
                <th className={th}>Signed up</th>
                {isBanned ? (
                  <>
                    <th className={th}>Reason</th>
                    <th className={th}>Banned</th>
                  </>
                ) : (
                  <>
                    <th className={th}>Last sign-in</th>
                    <th className={th}>Orders</th>
                    <th className={th}>Status</th>
                  </>
                )}
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const admin = isAdminAccount(u)
                return (
                  <tr key={u.id} className="border-b border-line hover:bg-wall-2">
                    <td className={td}>
                      {!admin && (
                        <input
                          type="checkbox"
                          name="ids"
                          value={u.id}
                          form="bulk"
                          aria-label={`Select ${u.email}`}
                        />
                      )}
                    </td>
                    <td className={`${td} text-bone`}>{u.email}</td>
                    <td className={`${td} text-muted`}>{u.name}</td>
                    <td className={`${td} text-muted`}>{u.createdAt.toISOString().slice(0, 10)}</td>
                    {isBanned ? (
                      <>
                        <td className={`${td} text-muted`}>{u.banReason ?? '—'}</td>
                        <td className={`${td} text-muted`}>
                          {u.updatedAt.toISOString().slice(0, 10)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`${td} text-muted`}>
                          {u.lastSignIn ? new Date(u.lastSignIn).toISOString().slice(0, 10) : '—'}
                        </td>
                        <td className={`${td} text-bone`}>{u.orderCount}</td>
                        <td className={`${td} flex flex-wrap gap-1`}>
                          {admin && (
                            <span className={`${badge} border-purple-soft text-purple-soft`}>
                              Admin
                            </span>
                          )}
                          {u.banned && (
                            <span
                              className={`${badge} border-red-400 text-red-400`}
                              title={u.banReason ?? ''}
                            >
                              Banned
                            </span>
                          )}
                        </td>
                      </>
                    )}
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-3">
                        <form action={sendPasswordResetAction} className="m-0">
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className={linkBtn}>
                            Reset password
                          </button>
                        </form>
                        {u.banned ? (
                          <form action={unbanUserAction} className="m-0">
                            <input type="hidden" name="userId" value={u.id} />
                            <button type="submit" className={linkBtn}>
                              Unban
                            </button>
                          </form>
                        ) : (
                          !admin && (
                            <form action={banUserAction} className="m-0 flex items-center gap-2">
                              <input type="hidden" name="userId" value={u.id} />
                              <input
                                type="text"
                                name="reason"
                                maxLength={500}
                                placeholder="Reason (optional)"
                                className="field-input w-40 py-1 text-xs"
                              />
                              <button
                                type="submit"
                                className="text-red-400 underline hover:text-red-300"
                              >
                                Ban
                              </button>
                            </form>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-4 text-sm text-muted">
          {page > 1 && (
            <Link href={href(page - 1)} className="link-neon">
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="link-neon">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
