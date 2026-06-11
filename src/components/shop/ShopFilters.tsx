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
      className="mb-8 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-2">
        <span className="font-medium text-gray-700">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ''}
          placeholder="Search products"
          aria-label="Search"
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">Series</span>
        <select
          name="category"
          defaultValue={query.categorySlug ?? ''}
          aria-label="Series"
          className="rounded-md border border-gray-300 px-3 py-2"
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
        <span className="font-medium text-gray-700">Artist</span>
        <select
          name="artist"
          defaultValue={query.artistSlug ?? ''}
          aria-label="Artist"
          className="rounded-md border border-gray-300 px-3 py-2"
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
        <span className="font-medium text-gray-700">Min $</span>
        <input
          type="number"
          name="min"
          min="0"
          step="1"
          defaultValue={centsToDollars(query.minCents)}
          aria-label="Min price"
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">Max $</span>
        <input
          type="number"
          name="max"
          min="0"
          step="1"
          defaultValue={centsToDollars(query.maxCents)}
          aria-label="Max price"
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">Sort</span>
        <select
          name="sort"
          defaultValue={query.sort ?? ''}
          aria-label="Sort"
          className="rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">Name (A–Z)</option>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end sm:col-span-2 lg:col-span-1">
        <button
          type="submit"
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Apply
        </button>
      </div>
    </form>
  )
}
