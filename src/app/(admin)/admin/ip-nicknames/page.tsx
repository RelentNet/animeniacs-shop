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
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1rem'
        }}
      >
        <h1>IP nicknames ({nicknames.length})</h1>
        <Link href={'/admin/ip-nicknames/new' as Route}>+ new nickname</Link>
      </header>

      {nicknames.length === 0 ? (
        <EmptyState />
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={cellStyle}>Public?</th>
              <th style={cellStyle}>Nickname</th>
              <th style={cellStyle}>Slug</th>
              <th style={cellStyle}>Square category (staff-only)</th>
              <th style={cellStyle}>Description</th>
              <th style={cellStyle} />
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
                <tr key={n.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={cellStyle}>
                    <PublicBadge isPublic={n.isPublic} />
                  </td>
                  <td style={cellStyle}>{n.nickname}</td>
                  <td style={cellStyle}>
                    <code>{n.slug}</code>
                  </td>
                  <td style={cellStyle}>{catName}</td>
                  <td style={cellStyle}>{trimmedDesc}</td>
                  <td style={cellStyle}>
                    <Link href={`/admin/ip-nicknames/${n.id}` as Route}>edit</Link>
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

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

function EmptyState(): JSX.Element {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#f7f7f7' }}>
      <p>No nicknames yet.</p>
      <Link href={'/admin/ip-nicknames/new' as Route}>Create the first one</Link>
    </div>
  )
}

function PublicBadge({ isPublic }: { isPublic: boolean }): JSX.Element {
  const bg = isPublic ? '#dfd' : '#eee'
  const label = isPublic ? 'Public' : 'Hidden'
  return (
    <span style={{ background: bg, padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
      {label}
    </span>
  )
}
