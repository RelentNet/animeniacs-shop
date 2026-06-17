import type { ShopQuery, ShopSort } from '@/lib/shop/parse-params'

export interface FilterOption {
  slug: string
  label: string
}

const SORT_OPTIONS: { value: ShopSort; label: string }[] = [
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' }
]

const FIELD =
  'rounded-md border border-line-strong bg-ink px-3 py-2 text-bone placeholder:text-faint focus:border-neon focus:outline-none'
const FIELD_LABEL = 'font-medium text-muted'

/** Dollars string for a cents value, or '' when null. */
function centsToDollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toString()
}

/**
 * The `/shop` filter bar. A plain `GET` form so all state lives in the URL
 * (shareable, SEO-friendly, works without JS). Category options come from the
 * curated public IP nicknames and artist options from active artists — never
 * raw Square category names (IP-never-public). Pre-selects the current query.
 */
export function ShopFilters({
  categories,
  artists,
  query
}: {
  categories: FilterOption[]
  artists: FilterOption[]
  query: ShopQuery
}): JSX.Element {
  return (
    <form
      method="get"
      action="/shop"
      className="mb-10 grid grid-cols-1 gap-3 rounded-lg border border-line bg-wall p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-2">
        <span className={FIELD_LABEL}>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ''}
          placeholder="Search products"
          aria-label="Search"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={FIELD_LABEL}>Series</span>
        <select
          name="category"
          defaultValue={query.categorySlug ?? ''}
          aria-label="Series"
          className={FIELD}
        >
          <option value="">All series</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={FIELD_LABEL}>Artist</span>
        <select
          name="artist"
          defaultValue={query.artistSlug ?? ''}
          aria-label="Artist"
          className={FIELD}
        >
          <option value="">All artists</option>
          {artists.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={FIELD_LABEL}>Min $</span>
        <input
          type="number"
          name="min"
          min="0"
          step="1"
          defaultValue={centsToDollars(query.minCents)}
          aria-label="Min price"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={FIELD_LABEL}>Max $</span>
        <input
          type="number"
          name="max"
          min="0"
          step="1"
          defaultValue={centsToDollars(query.maxCents)}
          aria-label="Max price"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={FIELD_LABEL}>Sort</span>
        <select name="sort" defaultValue={query.sort ?? ''} aria-label="Sort" className={FIELD}>
          <option value="">Name (A–Z)</option>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end sm:col-span-2 lg:col-span-1">
        <button type="submit" className="btn-neon w-full justify-center !py-2 text-sm">
          Apply
        </button>
      </div>
    </form>
  )
}
