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
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1rem'
        }}
      >
        <h1>SMS recipients ({recipients.length})</h1>
        <Link href={'/admin/sms-recipients/new' as Route}>+ new recipient</Link>
      </header>

      <p style={{ color: '#666' }}>
        Phone numbers that receive transactional SMS (e.g. order notifications). Disable to silence
        without losing the row; delete to remove permanently.
      </p>

      {recipients.length === 0 ? (
        <EmptyState />
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Label</th>
              <th style={cellStyle}>Phone</th>
              <th style={cellStyle}>Added</th>
              <th style={cellStyle} />
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={cellStyle}>
                  <EnabledBadge enabled={r.enabled} />
                </td>
                <td style={cellStyle}>{r.label ?? <span style={{ color: '#999' }}>—</span>}</td>
                <td style={cellStyle}>
                  <code style={{ fontFamily: 'ui-monospace, monospace' }}>{r.phone}</code>
                </td>
                <td style={cellStyle}>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td style={{ ...cellStyle, display: 'flex', gap: '0.75rem' }}>
                  <Link href={`/admin/sms-recipients/${r.id}` as Route}>edit</Link>
                  <form action={deleteSmsRecipientAction.bind(null, r.id)} style={{ margin: 0 }}>
                    <button
                      type="submit"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#a33',
                        cursor: 'pointer',
                        padding: 0,
                        font: 'inherit',
                        textDecoration: 'underline'
                      }}
                    >
                      delete
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

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

function EmptyState(): JSX.Element {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#f7f7f7' }}>
      <p>No SMS recipients yet.</p>
      <Link href={'/admin/sms-recipients/new' as Route}>Add the first one</Link>
    </div>
  )
}

function EnabledBadge({ enabled }: { enabled: boolean }): JSX.Element {
  const bg = enabled ? '#dfd' : '#eee'
  const label = enabled ? 'Enabled' : 'Disabled'
  return (
    <span style={{ background: bg, padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
      {label}
    </span>
  )
}
