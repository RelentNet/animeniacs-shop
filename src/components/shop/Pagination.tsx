import type { Route } from 'next'
import Link from 'next/link'

/**
 * Builds a `/shop` href that preserves every current query param and changes
 * only `page`. Empty params are dropped so URLs stay clean.
 */
function buildHref(params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page') continue
    if (typeof value === 'string' && value.length > 0) sp.set(key, value)
  }
  sp.set('page', String(page))
  return `/shop?${sp.toString()}`
}

/**
 * Numbered pagination with prev/next. All links preserve the active filter/sort
 * params and only change `page`. Prev is omitted on the first page and next on
 * the last. Renders nothing when there is a single page.
 */
export function Pagination({
  page,
  pageCount,
  params
}: {
  page: number
  pageCount: number
  params: Record<string, string | undefined>
}): JSX.Element | null {
  if (pageCount <= 1) return null

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 && (
        <Link
          href={buildHref(params, page - 1) as Route}
          rel="prev"
          className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          ‹ Previous
        </Link>
      )}

      {pages.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={buildHref(params, n) as Route}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            {n}
          </Link>
        )
      )}

      {page < pageCount && (
        <Link
          href={buildHref(params, page + 1) as Route}
          rel="next"
          className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          Next ›
        </Link>
      )}
    </nav>
  )
}
