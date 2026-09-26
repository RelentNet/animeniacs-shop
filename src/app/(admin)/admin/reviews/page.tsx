import { getPendingReviews } from '@/lib/db/queries/reviews'
import { deleteReviewAction, publishReviewAction } from './actions'

export const metadata = {
  title: 'Review moderation — admin'
}

const th = 'py-2 px-3 font-medium'
const td = 'py-2 px-3 align-top'

export default async function AdminReviewsModerationPage(): Promise<JSX.Element> {
  const pending = await getPendingReviews()

  return (
    <div>
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
          Review moderation ({pending.length})
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Reviews from verified purchasers publish automatically. These are held for approval —
          publish to make a review public, or delete to remove it.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="text-muted">No reviews awaiting moderation.</p>
        </div>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className={th}>Product</th>
              <th className={th}>Rating</th>
              <th className={th}>Title</th>
              <th className={th}>Review</th>
              <th className={th}>Author</th>
              <th className={th}>Submitted</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id} className="border-b border-line hover:bg-wall-2">
                <td className={td}>
                  <code className="font-mono text-purple-soft">{r.productId}</code>
                </td>
                <td className={`${td} text-bone`}>{r.rating}/5</td>
                <td className={`${td} text-bone`}>
                  {r.title ?? <span className="text-faint">—</span>}
                </td>
                <td className={`${td} max-w-sm text-muted`}>
                  {r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body}
                </td>
                <td className={`${td} text-muted`}>
                  {r.authorName ?? <span className="text-faint">Anonymous</span>}
                </td>
                <td className={`${td} text-muted`}>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td className={`${td} flex gap-3`}>
                  <form action={publishReviewAction.bind(null, r.id, r.productId)} className="m-0">
                    <button type="submit" className="text-neon-soft underline hover:text-neon">
                      Publish
                    </button>
                  </form>
                  <form action={deleteReviewAction.bind(null, r.id, r.productId)} className="m-0">
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
