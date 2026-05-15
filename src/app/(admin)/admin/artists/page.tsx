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
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1rem'
        }}
      >
        <h1>Artists ({artists.length})</h1>
        <Link href={'/admin/artists/new' as Route}>+ new artist</Link>
      </header>

      {artists.length === 0 ? (
        <EmptyState />
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Display name</th>
              <th style={cellStyle}>Slug</th>
              <th style={cellStyle}>Square category</th>
              <th style={cellStyle}>Commission</th>
              <th style={cellStyle}>Avatar</th>
              <th style={cellStyle} />
            </tr>
          </thead>
          <tbody>
            {artists.map((a) => {
              const catName = categoryNames.get(a.squareCategoryId) ?? '(unknown)'
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={cellStyle}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td style={cellStyle}>{a.displayName}</td>
                  <td style={cellStyle}>
                    <code>{a.slug}</code>
                  </td>
                  <td style={cellStyle}>{catName}</td>
                  <td style={cellStyle}>{(Number(a.commissionRate) * 100).toFixed(2)}%</td>
                  <td style={cellStyle}>{a.avatarUrl ? 'yes' : '—'}</td>
                  <td style={cellStyle}>
                    <Link href={`/admin/artists/${a.id}` as Route}>edit</Link>
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
      <p>No artists yet.</p>
      <Link href={'/admin/artists/new' as Route}>Create the first one</Link>
    </div>
  )
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const bg = status === 'active' ? '#dfd' : '#eee'
  return (
    <span style={{ background: bg, padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
      {status}
    </span>
  )
}
