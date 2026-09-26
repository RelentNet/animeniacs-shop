import { getAllSmsRecipients } from '@/lib/db/queries/sms-recipients'
import type { Route } from 'next'
import Link from 'next/link'
import { deleteSmsRecipientAction } from './[id]/actions'

export const metadata = {
  title: 'SMS recipients — admin'
}

export default async function AdminSmsRecipientsListPage(): Promise<JSX.Element> {
  const recipients = await getAllSmsRecipients()

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
            SMS recipients ({recipients.length})
          </h1>
        </div>
        <Link href={'/admin/sms-recipients/new' as Route} className="btn-neon">
          + New recipient
        </Link>
      </header>

      <p className="mt-2 max-w-2xl text-muted">
        Phone numbers that receive transactional SMS (e.g. order notifications). Disable to silence
        without losing the row; delete to remove permanently.
      </p>

      {recipients.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className={th}>Status</th>
              <th className={th}>Label</th>
              <th className={th}>Phone</th>
              <th className={th}>Added</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-b border-line hover:bg-wall-2">
                <td className={td}>
                  <EnabledBadge enabled={r.enabled} />
                </td>
                <td className={`${td} text-bone`}>
                  {r.label ?? <span className="text-faint">—</span>}
                </td>
                <td className={td}>
                  <code className="font-mono text-bone">{r.phone}</code>
                </td>
                <td className={`${td} text-muted`}>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td className={`${td} flex gap-3`}>
                  <Link href={`/admin/sms-recipients/${r.id}` as Route} className="link-neon">
                    Edit
                  </Link>
                  <form action={deleteSmsRecipientAction.bind(null, r.id)} className="m-0">
                    <button type="submit" className="text-red-400 underline hover:text-red-300">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
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
      <p className="text-muted">No SMS recipients yet.</p>
      <Link href={'/admin/sms-recipients/new' as Route} className="link-neon mt-2 inline-block">
        Add the first one
      </Link>
    </div>
  )
}

function EnabledBadge({ enabled }: { enabled: boolean }): JSX.Element {
  return (
    <span
      className={
        enabled
          ? 'rounded-full bg-neon/15 px-2 py-0.5 text-xs font-medium text-neon-soft'
          : 'rounded-full bg-wall-2 px-2 py-0.5 text-xs font-medium text-muted'
      }
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  )
}
