import { getPendingReviews } from '@/lib/db/queries/reviews'
import { deleteReviewAction, publishReviewAction } from './actions'

export const metadata = {
  title: 'Review moderation — admin'
}

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
  textDecoration: 'underline'
}

export default async function AdminReviewsModerationPage(): Promise<JSX.Element> {
  const pending = await getPendingReviews()

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1>Review moderation ({pending.length})</h1>
        <p style={{ color: '#666' }}>
          Reviews from verified purchasers publish automatically. These are held for approval —
          publish to make a review public, or delete to remove it.
        </p>
      </header>

      {pending.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#f7f7f7' }}>
          <p>No reviews awaiting moderation.</p>
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={cellStyle}>Product</th>
              <th style={cellStyle}>Rating</th>
              <th style={cellStyle}>Title</th>
              <th style={cellStyle}>Review</th>
              <th style={cellStyle}>Author</th>
              <th style={cellStyle}>Submitted</th>
              <th style={cellStyle} />
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={cellStyle}>
                  <code style={{ fontFamily: 'ui-monospace, monospace' }}>{r.productId}</code>
                </td>
                <td style={cellStyle}>{r.rating}/5</td>
                <td style={cellStyle}>{r.title ?? <span style={{ color: '#999' }}>—</span>}</td>
                <td style={{ ...cellStyle, maxWidth: '24rem' }}>
                  {r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body}
                </td>
                <td style={cellStyle}>
                  {r.authorName ?? <span style={{ color: '#999' }}>Anonymous</span>}
                </td>
                <td style={cellStyle}>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td style={{ ...cellStyle, display: 'flex', gap: '0.75rem' }}>
                  <form action={publishReviewAction.bind(null, r.id, r.productId)} style={{ margin: 0 }}>
                    <button type="submit" style={{ ...buttonStyle, color: '#181' }}>
                      publish
                    </button>
                  </form>
                  <form action={deleteReviewAction.bind(null, r.id, r.productId)} style={{ margin: 0 }}>
                    <button type="submit" style={{ ...buttonStyle, color: '#a33' }}>
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
