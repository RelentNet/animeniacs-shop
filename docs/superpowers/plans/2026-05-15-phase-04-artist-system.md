# Phase 4: Artist System (replacement for GoAffPro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the originally-planned GoAffPro runtime integration with a small in-house artist system: one Postgres `artists` table, a Logto-gated `/admin/artists` CRUD area, public website read paths (`/artist`, `/artist/[slug]`, PDP artist meta line) that join Square `categories[]` to the local `artists` table by `squareCategoryId`. GoAffPro is retired after the new system is live.

**Architecture:**

- **Source of truth for "who made this product":** Square `categories[]` on each item. Items belong to multiple Square categories simultaneously (e.g., `Artist > Bxnny.Arts` and `Anime > Naruto`).
- **Source of truth for artist profile data:** local Postgres `artists` table, joined to Square via `squareCategoryId` (Square's `CatalogCategory.id` for that artist's sub-category).
- **No GoAffPro at runtime, anywhere.** No coupon middleware, no `?ref=` cookie, no attribution layer. The 23 approved-in-GoAffPro artist records are migrated to the `artists` table as a one-time data-entry pass.
- **Commission reporting:** manual monthly Square dashboard task using *Sales by Category*. The `artists` table stores the commission rate as a reference for the human running the report. **No commission code.**
- **Inbound partner attribution** (if/when relevant): one Square Discount per partner, manual monthly *Sales by Discount* report. Out of v1 scope.

**Tech Stack:** Same as Phases 1–3 — Next.js 14 (App Router), Drizzle ORM, postgres-js, Vitest, Logto (already wired in design spec §10/§11), Square Node SDK v44 (already installed in Phase 3 Task 1). No new dependencies.

**API keys needed:** None at runtime. The migration data-entry pass in Plan E uses the existing `GOAFFPRO_ADMIN_API_KEY` from `.env.local` for a one-shot read-only data dump that's then transcribed into the `artists` table; that key is removed afterwards. Square keys (already present) are used for the category-list reads in `/admin/artists` and the PDP read path.

**Outcome at end of Phase 4:**
- New Postgres table: `artists` (15 columns) with Drizzle migration applied.
- New query helpers in `src/lib/db/queries/artists.ts` (`getActiveArtists`, `getArtistBySlug`, `getArtistByCategoryId`, plus CRUD).
- New admin area: `/admin/artists` (list, new, edit) gated by Logto `admin` role via the existing `(admin)` route group pattern.
- New public pages: `/artist` (gallery of active artists), `/artist/[slug]` (per-artist profile + product grid).
- PDP `/product/[id]` reads `categories[]`, joins to `artists` by `squareCategoryId`, renders artist meta line if matched.
- One-time Square dashboard work completed (sub-categories created under `Artist`, real items re-categorized, 30 graveyard SKUs archived).
- GoAffPro subscription cancelled. `GOAFFPRO_*` env vars and probe script removed from runtime path.
- Spec §3 / §4 / §5 / §11 / §13 deprecation banners in place (already done at commit `5a0200e`).
- Git tag `phase-4-artist-system` marks the milestone.

---

## Lessons from Phases 1, 2, 3 — applied throughout

Every commit step ends with `pnpm lint:fix && pnpm typecheck` before `git add`. Carry-forward rules:

1. **Biome glob brace expansion is a no-op.** Use separate `*.ts` and `*.tsx` entries.
2. **`vi.stubEnv('FOO', '')` does not unset.** Use `vi.stubEnv('FOO', undefined)`.
3. **Drizzle's `text({ enum: [...] })` is a TS hint, not a SQL constraint.** Add an explicit `check(name, sql\`...\`)` next to it if the constraint must be enforced at DB level. The `artists.status` column in this plan does this.
4. **`pnpm db:push` hangs without `--force`.** All db-push commands in this plan use `DATABASE_URL="postgres://animeniacs:animeniacs@localhost:5433/animeniacs" pnpm db:push --force`.
5. **biome formatter runs before commit.** Always `pnpm lint:fix` first.
6. **Smoke-test every external API before writing code that depends on it.** Plan E includes one final read-only call to GoAffPro to dump artist records for migration; that dump is captured to `/tmp/`, not consumed by runtime code.
7. **Source-app ownership matters for Square deletes.** Plan E does not delete the LitCommerce-owned `Media`/`Size` custom attribute definitions via API — those are flagged for manual deletion in the Square dashboard (or just left in place; they're inert).

---

## File structure after Phase 4

```
animeniacs-shop/
├── .env.example                                  ← MODIFIED: remove GOAFFPRO_* (Plan E)
├── .env.local                                    ← MODIFIED (gitignored): remove GOAFFPRO_* (Plan E)
│
├── docs/
│   └── operations/
│       └── commission-payouts.md                 ← NEW (Plan E): manual monthly workflow doc
│
├── drizzle/migrations/
│   └── 0009_<name>_artists.sql                   ← NEW (Plan A): generated by `pnpm db:generate`
│
├── public/
│   └── images/
│       └── artists/                              ← NEW (Plan B): admin uploads land here
│
├── scripts/
│   └── square-cleanup/
│       ├── … (existing)
│       └── archive-graveyard-skus.ts             ← NEW (Plan C): one-shot script to archive
│                                                    the 30 placeholder items after re-
│                                                    categorization; reuses the existing
│                                                    snapshot/lib utilities
│
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       └── artists/
│   │   │           ├── _components/
│   │   │           │   ├── ArtistForm.tsx        ← NEW (Plan B): shared form (new + edit)
│   │   │           │   └── SquareCategoryPicker.tsx ← NEW (Plan B): server-rendered dropdown
│   │   │           ├── [id]/
│   │   │           │   ├── actions.ts            ← NEW (Plan B): update server action
│   │   │           │   └── page.tsx              ← NEW (Plan B): edit form
│   │   │           ├── new/
│   │   │           │   ├── actions.ts            ← NEW (Plan B): create server action
│   │   │           │   └── page.tsx              ← NEW (Plan B): create form
│   │   │           └── page.tsx                  ← NEW (Plan B): list view
│   │   │
│   │   ├── artist/
│   │   │   ├── [slug]/
│   │   │   │   └── page.tsx                      ← NEW (Plan D): per-artist profile + grid
│   │   │   └── page.tsx                          ← NEW (Plan D): gallery
│   │   │
│   │   └── product/
│   │       └── [id]/
│   │           └── page.tsx                      ← TOUCHED (Plan D): join categories→artists,
│   │                                                render meta line + breadcrumb pills
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── queries/
│   │   │   │   └── artists.ts                    ← NEW (Plan A): typed query helpers
│   │   │   ├── client.ts                         ← unchanged
│   │   │   └── schema.ts                         ← MODIFIED (Plan A): appended `artists`
│   │   │
│   │   ├── images/
│   │   │   └── upload.ts                         ← NEW (Plan B): admin avatar upload helper
│   │   │                                            (local disk impl; Vercel Blob swap is a
│   │   │                                            one-file change later)
│   │   │
│   │   └── square/
│   │       ├── categories.ts                     ← NEW (Plan A): cached CatalogCategory list;
│   │       │                                        used by admin dropdown + PDP IP lookup
│   │       ├── client.ts                         ← unchanged
│   │       └── types.ts                          ← TOUCHED (Plan E cleanup, optional):
│   │                                                cull dead CUSTOM_ATTR_KEYS / PRODUCT_TYPES
│   │                                                / isProductType (see Plan E for the
│   │                                                "cull or keep" decision)
│   │
│   └── test/
│       └── … (existing helpers unchanged)
│
└── tests/
    ├── integration/
    │   └── artists.integration.test.ts           ← NEW (Plan A): real DB test, uses
    │                                                testNamespace + cleanupByPrefix
    └── admin/
        └── artists-actions.test.ts               ← NEW (Plan B): vitest tests for create/
                                                     update server actions (mocked DB)
```

---

## Phase 4 is five plans, executed in this order:

| # | Plan | Depends on | Blocks |
|---|---|---|---|
| **A** | Cull dead Phase 3 constants (Task A.0), schema + query helpers + Square category list helper | — | B, D |
| **C** | Square dashboard work (sub-category creation, item re-categorization, graveyard archival) | — | D |
| **B** | `/admin/artists` CRUD (incl. minimal `(admin)/layout.tsx`) | A | D, E |
| **D** | Public read paths (PDP, `/artist`, `/artist/[slug]`) | A + at least one artist row entered via admin + C | E |
| **E** | Cleanup & launch tail (smoke tests, `.env.example` cleanup, ops doc, tag) | A, B, C, D | — |

A and C can run in parallel. B starts after A's schema lands and requires the admin to be able to add artist records before D's public pages have anything to render. D needs A's helpers and at least one artist record entered via B's admin UI plus at least one re-categorized Square item from C (so there's something to look at). E is the closing sweep.

---

# Plan A — Schema + Artist Query Helpers + Category Helper

> **Pre-task Task A.0 cleans up dead constants left over from Phase 3 before any new schema work begins.** This is the first thing the implementer does. See Task A.0 below; Tasks A.1+ depend on `src/lib/square/types.ts` being in its post-cleanup state.

**Acceptance criteria:**

- [ ] Task A.0 ships: `CUSTOM_ATTR_KEYS`, `PRODUCT_TYPES`, `isProductType`, the `customAttributes` field on `CachedProduct`, and the matching catalog-parser population logic are removed. `pnpm typecheck` clean. Any tests touching these are removed or updated.
- [ ] `pnpm db:generate` produces a `0009_*_artists.sql` migration.
- [ ] `pnpm db:push --force` applies cleanly against the local Postgres at `localhost:5433`.
- [ ] `\d artists` in psql shows: 16 columns (incl. `id`, `slug` unique, `display_name`, `square_category_id` indexed, `status` CHECK-constrained, profile fields, commission fields, timestamps).
- [ ] `src/lib/db/queries/artists.ts` exports `getActiveArtists`, `getArtistBySlug`, `getArtistByCategoryId`, `getAllArtists`, `createArtist`, `updateArtist`, `setArtistStatus`, all typed via the inferred Drizzle row type.
- [ ] `src/lib/square/categories.ts` exports `listCategoriesFromSquare()` and `getArtistSubCategories()`, the latter filtering to children of the production "Artist" parent category id (`B6I2KLCRDEHSF6XHODMNSG6P` per the production survey).
- [ ] Integration test `tests/integration/artists.integration.test.ts` covers happy-path insert/select/update + the three guarded uniques (`slug` unique, `status` CHECK, indexed `square_category_id` lookup), using `testNamespace` + `cleanupByPrefix` per the existing convention.
- [ ] `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint` all green.

### Task A.0 — Cull dead Phase 3 constants (run first)

The Phase 3 amendment at commit `7f330a6` marked four exports + one struct field as harmless dead weight. Task A.0 removes them now, before any new schema work builds on top.

**Files:**
- Modify: `src/lib/square/types.ts` — delete 4 dead exports
- Modify: `src/lib/square/catalog.ts` — strip the `customAttributes`-population block inside `denormalizeItem`
- Modify or delete: `tests/square/types.test.ts` — covers `isProductType`; remove the test file if `isProductType` is its only subject
- Modify: `tests/square/catalog-parser.test.ts` — remove the "reads custom attributes when set" test case; the variation-id round-trip and image denorm tests stay

**Steps:**

- [ ] **A.0.1: Grep first.** `grep -rn 'CUSTOM_ATTR_KEYS\|PRODUCT_TYPES\|isProductType\|customAttributes' src/ tests/ scripts/`. Expected hits:
  - `src/lib/square/types.ts` — defines the 4 things
  - `src/lib/square/catalog.ts` — `denormalizeItem` populates `customAttributes`
  - `tests/square/types.test.ts` — tests `isProductType`
  - `tests/square/catalog-parser.test.ts` — one case asserts the `customAttributes` round-trip
  - **If any other consumer turns up, halt and re-scope.** No production caller should exist; the Phase 3 amendment claimed they're dead.

- [ ] **A.0.2: Edit `src/lib/square/types.ts`.** Delete:
  - the entire `CUSTOM_ATTR_KEYS` const + its JSDoc
  - `export type CustomAttrKey = ...`
  - `PRODUCT_TYPES` const + its JSDoc
  - `export type ProductType = ...`
  - `export function isProductType(...)` and its JSDoc
  - The `customAttributes: Partial<Record<CustomAttrKey, string>>` field on `CachedProduct`

  Keep `CachedMoney`, `CachedVariation`, `CachedProduct` (minus the deleted field), and any other types that don't reference the deleted symbols.

- [ ] **A.0.3: Edit `src/lib/square/catalog.ts`.** Find the block in `denormalizeItem` that populates `customAttributes`. Delete the block. Delete the `customAttributes` assignment inside the returned object literal. Delete any `CustomAttrKey` import.

- [ ] **A.0.4: Run typecheck.** `pnpm typecheck` should fail loudly on any remaining consumer not caught by the grep. Fix any that surface (likely none).

- [ ] **A.0.5: Delete the now-empty `tests/square/types.test.ts`** (if `isProductType` was its only subject). Run `pnpm test tests/square/types.test.ts` first to confirm what's in there before deletion.

- [ ] **A.0.6: Edit `tests/square/catalog-parser.test.ts`.** Remove the test case that asserts `customAttributes` round-tripping. Other cases (variation IDs, image denorm, price coercion to BigInt) stay.

- [ ] **A.0.7: Final verification.** `pnpm test`, `pnpm typecheck`, `pnpm lint` all green.

- [ ] **A.0.8: Commit.** `Task A.0: Phase 4 — cull dead Square custom-attribute constants (carried over from Phase 3 amendment)`.

### Task A.1 — Drizzle schema: append `artists` table

**Files:**
- Modify: `src/lib/db/schema.ts` (append; do not restructure existing tables)

**Steps:**

- [ ] **A.1.1: Add `numeric` to the drizzle-orm/pg-core import line.** Schema currently imports `{ boolean, check, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique, uuid }`. Add `numeric`.
- [ ] **A.1.2: Append the `artists` table definition at the bottom of `schema.ts`.**

```typescript
export const artists = pgTable(
  'artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    squareCategoryId: text('square_category_id').notNull(),
    // TS-side enum is a type hint only; Drizzle does NOT emit CHECK from it.
    // Explicit check below enforces at DB level (matches Phase 2 convention).
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    instagram: text('instagram'),
    twitter: text('twitter'),
    facebook: text('facebook'),
    youtube: text('youtube'),
    tiktok: text('tiktok'),
    website: text('website'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.2000'),
    paymentMethod: text('payment_method'),
    paymentEmail: text('payment_email'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check(
      'artists_status_valid',
      sql`${table.status} IN ('active', 'inactive')`
    )
  })
)

export type Artist = typeof artists.$inferSelect
export type NewArtist = typeof artists.$inferInsert
```

> **Note on timestamps:** the original handoff brief snippet used `timestamp('created_at').notNull().defaultNow()` without `withTimezone: true`. Locked at `withTimezone: true` for three reasons:
> 1. Square's API returns every timestamp as ISO-8601 UTC with the `Z` suffix (re-probed 2026-05-15 against production: `created_at: '2026-04-18T11:06:18.888Z'` on items, same shape on locations + orders + variations). Postgres `timestamp with time zone` stores UTC internally — direct match.
> 2. Matches every existing column in the codebase (all 9 Phase 2 tables use `withTimezone: true`).
> 3. Future-proofs cross-table comparisons (e.g., joining artist updates with order timestamps when the operator runs the monthly commission report).

- [ ] **A.1.3: Run `pnpm db:generate`.** Expected: a new file `drizzle/migrations/0009_<some-random-name>_artists.sql` is created. Inspect it; confirm CREATE TABLE, UNIQUE on `slug`, CHECK on `status`. (Drizzle will likely *not* emit an index on `square_category_id` by default — handled in A.1.5.)
- [ ] **A.1.4: Manually add the `square_category_id` index to the generated migration.** Append the following to the bottom of the new migration file:

```sql
CREATE INDEX IF NOT EXISTS "artists_square_category_id_idx"
  ON "artists" ("square_category_id");
```

- [ ] **A.1.5: Run `DATABASE_URL="postgres://animeniacs:animeniacs@localhost:5433/animeniacs" pnpm db:push --force`.** Expected: changes applied.
- [ ] **A.1.6: Verify in psql.** `docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d artists"`. Confirm 16 columns + CHECK + UNIQUE + the new index.
- [ ] **A.1.7: Commit.** `Task A.1: Phase 4 — artists table schema + migration`.

### Task A.2 — Query helpers

**Files:**
- Create: `src/lib/db/queries/artists.ts`

**Steps:**

- [ ] **A.2.1: TDD — write the integration test first.** Create `tests/integration/artists.integration.test.ts`. Use the `testNamespace('artists')` + `cleanupByPrefix` pattern from `tests/integration/reviews.integration.test.ts` for shape reference. Test cases:
  1. `createArtist` inserts and returns the row with generated `id`, `createdAt`, `updatedAt`.
  2. `getArtistBySlug` returns the row when the slug exists; `null`/`undefined` when it doesn't.
  3. `getArtistByCategoryId` finds the artist by `squareCategoryId`.
  4. `getActiveArtists` returns only `status='active'` rows, ordered by `display_name`.
  5. `getAllArtists` returns active + inactive.
  6. `updateArtist` patches a subset of fields and bumps `updatedAt`.
  7. `setArtistStatus` flips active ↔ inactive.
  8. Inserting a duplicate slug fails (unique constraint).
  9. Inserting `status='banned'` fails (CHECK constraint).
- [ ] **A.2.2: Run the failing test.** `pnpm test:integration tests/integration/artists.integration.test.ts`. Expected: every test fails because `src/lib/db/queries/artists.ts` doesn't exist yet.
- [ ] **A.2.3: Implement `src/lib/db/queries/artists.ts`.**

```typescript
import 'server-only'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { artists, type Artist, type NewArtist } from '@/lib/db/schema'

// Zod schemas for runtime validation of admin form input. Mirrors the
// Drizzle types but enforces shape at the API boundary.
export const ArtistInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, 'lowercase letters, digits, dot and hyphen'),
  displayName: z.string().min(1).max(120),
  squareCategoryId: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  instagram: z.string().url().nullable().optional(),
  twitter: z.string().url().nullable().optional(),
  facebook: z.string().url().nullable().optional(),
  youtube: z.string().url().nullable().optional(),
  tiktok: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  commissionRate: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v))
    .refine(
      (s) => {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 && n <= 1
      },
      { message: 'commissionRate must be a decimal between 0 and 1 inclusive' }
    )
    .default('0.2000'),
  paymentMethod: z.string().max(40).nullable().optional(),
  paymentEmail: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional()
})

export type ArtistInput = z.infer<typeof ArtistInputSchema>

export async function getAllArtists(): Promise<Artist[]> {
  return db.select().from(artists).orderBy(asc(artists.displayName))
}

export async function getActiveArtists(): Promise<Artist[]> {
  return db
    .select()
    .from(artists)
    .where(eq(artists.status, 'active'))
    .orderBy(asc(artists.displayName))
}

export async function getArtistBySlug(slug: string): Promise<Artist | undefined> {
  const rows = await db.select().from(artists).where(eq(artists.slug, slug)).limit(1)
  return rows[0]
}

export async function getArtistByCategoryId(
  squareCategoryId: string
): Promise<Artist | undefined> {
  const rows = await db
    .select()
    .from(artists)
    .where(eq(artists.squareCategoryId, squareCategoryId))
    .limit(1)
  return rows[0]
}

export async function getArtistById(id: string): Promise<Artist | undefined> {
  const rows = await db.select().from(artists).where(eq(artists.id, id)).limit(1)
  return rows[0]
}

export async function createArtist(input: ArtistInput): Promise<Artist> {
  const parsed = ArtistInputSchema.parse(input)
  const [row] = await db.insert(artists).values(parsed satisfies NewArtist).returning()
  return row
}

export async function updateArtist(id: string, input: Partial<ArtistInput>): Promise<Artist> {
  const parsed = ArtistInputSchema.partial().parse(input)
  const [row] = await db
    .update(artists)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(artists.id, id))
    .returning()
  if (!row) throw new Error(`artist ${id} not found`)
  return row
}

export async function setArtistStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<Artist> {
  const [row] = await db
    .update(artists)
    .set({ status, updatedAt: new Date() })
    .where(eq(artists.id, id))
    .returning()
  if (!row) throw new Error(`artist ${id} not found`)
  return row
}
```

- [ ] **A.2.4: Run the test until green.** Iterate on the implementation if any case fails.
- [ ] **A.2.5: Commit.** `Task A.2: Phase 4 — artists query helpers + integration tests`.

### Task A.3 — Square category list helper

The admin form needs a dropdown of all `Artist > *` sub-categories. The PDP IP/breadcrumb logic needs to look up category names for non-artist categories. Both want a fresh list of Square `CatalogCategory` objects, cached briefly so we don't hammer Square on every admin form render.

**Files:**
- Create: `src/lib/square/categories.ts`

**Steps:**

- [ ] **A.3.1: Write `src/lib/square/categories.ts`.** Reuse the Phase 3 `getSquareClient()` singleton; do not create a new client.

```typescript
import 'server-only'
import { unstable_cache as cache } from 'next/cache'
import { getSquareClient } from './client'

export interface SquareCategory {
  id: string
  name: string
  parentCategoryId: string | null
}

// Production "Artist" parent category id, from the production survey.
// (Sandbox mirrors prod so this id is also valid there post-mirror.)
export const ARTIST_PARENT_CATEGORY_ID = 'B6I2KLCRDEHSF6XHODMNSG6P'

/**
 * Lists every CATEGORY in the catalog, normalized to a flat shape.
 * Cached for 5 minutes in-process via Next.js `unstable_cache`.
 */
export const listCategoriesFromSquare = cache(
  async (): Promise<SquareCategory[]> => {
    const client = getSquareClient()
    const out: SquareCategory[] = []
    const page = await client.catalog.list({ types: 'CATEGORY' })
    for await (const obj of page) {
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward; we
      // narrow on `type === 'CATEGORY'` and read the known fields
      const c: any = obj
      if (c.type !== 'CATEGORY') continue
      out.push({
        id: c.id,
        name: c.categoryData?.name ?? '(unnamed)',
        parentCategoryId: c.categoryData?.parentCategory?.id ?? null
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  },
  ['square-categories-list'],
  { revalidate: 300 }
)

/** Filtered to children of the Artist parent category. */
export async function getArtistSubCategories(): Promise<SquareCategory[]> {
  const all = await listCategoriesFromSquare()
  return all.filter((c) => c.parentCategoryId === ARTIST_PARENT_CATEGORY_ID)
}

/** Map of categoryId → name for the IP / breadcrumb path. */
export async function getCategoryNameMap(): Promise<Map<string, string>> {
  const all = await listCategoriesFromSquare()
  return new Map(all.map((c) => [c.id, c.name]))
}
```

- [ ] **A.3.2: Unit test the parser shape.** Create `tests/square/categories.test.ts` (mocked SDK iterator), confirm: only CATEGORY objects survive the filter; `parentCategoryId` is `null` when absent; alpha sort by name.
- [ ] **A.3.3: Run `pnpm test tests/square/categories.test.ts`.** Expected: 3 passed.
- [ ] **A.3.4: Commit.** `Task A.3: Phase 4 — Square category list helper`.

---

# Plan B — Admin: `/admin/artists` CRUD

**Acceptance criteria:**

- [ ] `/admin/artists` lists all artists with edit links; "+ new artist" button visible.
- [ ] `/admin/artists/new` renders a form; submitting it creates the row, redirects to `/admin/artists`.
- [ ] `/admin/artists/[id]` renders an edit form populated with current values; submitting it updates the row, redirects to `/admin/artists`.
- [ ] All three pages are Logto-`admin`-gated. Unauthenticated visitors get redirected to sign-in; authenticated non-admins see a 403.
- [ ] Avatar uploads land in `public/images/artists/<slug>.<ext>` (local-disk implementation; swap to Vercel Blob is a one-file change). File size limit ≤ 2 MB, type whitelist: png / jpg / webp. Server-side resize to 500×500 (square crop).
- [ ] Form validation: slug regex, required fields, URL fields validate, commission rate in `[0, 1]`. Validation failures re-render the form with errors in place; do not redirect.
- [ ] Server actions are unit-tested (mocked DB), covering happy path and each validation failure mode.

### Task B.1 — Admin route group + auth gate

**Files:**
- Create: `src/app/(admin)/layout.tsx`

The original design spec §11 placed admin auth in Phase 7. The artist admin (this plan's Plan B) is the first concrete consumer of the `(admin)` route group, so Phase 4 ships the minimal layout here. Phase 7 will plug additional admin pages (site-settings, event-logos, diagnostics, etc.) into the same route group without redoing the layout. The layout body is intentionally minimal (auth gate + `<div>{children}</div>`); chrome/styling is Phase 7's call.

**Steps:**

- [ ] **B.1.1: Create `src/app/(admin)/layout.tsx`.** Calls `getLogtoContext(logtoConfig)` (the import + setup mirrors design spec §10), redirects to `/sign-in` if `!claims?.isAuthenticated`, returns a 403 page component if `!claims?.roles?.includes('admin')`. Render `<div>{children}</div>` (no nav, no styling — Phase 7's call).
- [ ] **B.1.2: Unit-test the gate.** Mock `getLogtoContext` to return: (a) unauthenticated, (b) authenticated non-admin, (c) authenticated admin. Verify the three responses (redirect / 403 / render). Test file: `tests/admin/layout-auth.test.tsx`.
- [ ] **B.1.3: Commit.** `Task B.1: Phase 4 — (admin) route group with Logto admin gate`.

### Task B.2 — List view + create flow

**Files:**
- Create: `src/app/(admin)/admin/artists/page.tsx` (list)
- Create: `src/app/(admin)/admin/artists/new/page.tsx` (create form)
- Create: `src/app/(admin)/admin/artists/new/actions.ts` (server action)
- Create: `src/app/(admin)/admin/artists/_components/ArtistForm.tsx`
- Create: `src/app/(admin)/admin/artists/_components/SquareCategoryPicker.tsx`
- Create: `src/lib/images/upload.ts` (server-side image handler)

**Steps:**

- [ ] **B.2.1: TDD — write the create action test first.** `tests/admin/artists-actions.test.ts`. Cover:
  1. Valid input → `createArtist` called, redirect to `/admin/artists`.
  2. Invalid slug → returns an error state, no DB write.
  3. Duplicate slug → DB throws, action surfaces a "slug already in use" error.
  4. Missing required field → validation error in returned state.
- [ ] **B.2.2: Implement `src/lib/images/upload.ts`.** Function `saveAvatar(file: File, slug: string): Promise<string>` returns the public URL path (`/images/artists/<slug>.webp`). Adds `sharp` as a new dependency (`pnpm add sharp`). Validates: max 2 MB, mime type in whitelist (png / jpg / webp); resizes to 500×500 (square crop, center); writes to `public/images/artists/`. **Deploy target is Coolify**, which has writable `public/` at runtime — no need to swap to Vercel Blob / S3.
- [ ] **B.2.3: Implement the shared `ArtistForm.tsx`** — server component renders, fields per the brief (slug, displayName, squareCategoryId via picker, status radio, avatarUrl file input or text input depending on B.2.2 outcome, bio textarea, six social URL inputs, commissionRate, paymentMethod select, paymentEmail, notes). All fields are progressive-enhancement HTML forms — no client-side form library.
- [ ] **B.2.4: Implement `SquareCategoryPicker.tsx`.** Server-renders a `<select>` populated from `getArtistSubCategories()` (Plan A's helper). Includes a "Create new in Square dashboard" link as a `<small>` hint underneath the select.
- [ ] **B.2.5: Implement the create server action** in `new/actions.ts`. Receives the `FormData`, parses through `ArtistInputSchema`, on success calls `createArtist()` and `redirect('/admin/artists')`, on failure returns an error state for the form to render.
- [ ] **B.2.6: Implement the list `page.tsx`** — server component calls `getAllArtists()`, renders a table: status, displayName, slug, square category name (joined via `getCategoryNameMap()`), commission rate, edit link.
- [ ] **B.2.7: Implement the new-form `page.tsx`** — server component renders `<ArtistForm />` bound to the create action.
- [ ] **B.2.8: Run tests and manual smoke.** Boot the dev server, sign in as admin, create a test artist, verify the row appears in the list.
- [ ] **B.2.9: Commit.** `Task B.2: Phase 4 — admin artists list + create flow`.

### Task B.3 — Edit + update flow

**Files:**
- Create: `src/app/(admin)/admin/artists/[id]/page.tsx`
- Create: `src/app/(admin)/admin/artists/[id]/actions.ts`

**Steps:**

- [ ] **B.3.1: Extend the existing test file** `tests/admin/artists-actions.test.ts` with update cases:
  1. Valid partial update → `updateArtist` called with patch, redirect to `/admin/artists`.
  2. Invalid commissionRate (`1.5`) → validation error.
  3. Status flip → row's `status` flips and `updatedAt` advances.
- [ ] **B.3.2: Implement the update server action.** Reuse `ArtistForm` (rendered with current values pre-filled). Server action uses `updateArtist(id, parsed)` from Plan A.
- [ ] **B.3.3: Implement the edit `page.tsx`** — fetches by id via `getArtistById`, 404s if missing, renders `<ArtistForm initial={artist} />` bound to the update action.
- [ ] **B.3.4: Commit.** `Task B.3: Phase 4 — admin artists edit + update flow`.

---

# Plan C — Square dashboard work (checklist for the user, no code except the graveyard archival)

**Acceptance criteria:**

- [ ] The 23 currently-approved-in-GoAffPro artists each have a sub-category under `Artist > X` in Square production, with a stable category id recorded in the migration data the `artists` table will be seeded with.
- [ ] Every real-and-active production item that has a known artist has been re-categorized to include the appropriate `Artist > X` in its `categories[]`. (Items keep their IP / `Acrylic Wall Art` etc. categories too — multi-category is the design.)
- [ ] The 30 graveyard SKUs identified in the Phase B audit (Pattern 1) are archived.
- [ ] The lowercase `portrait` top-level category is either renamed to `Portrait` or deleted (operator's call).

### Task C.1 — Sub-category naming convention (decide once)

**Decision needed:** sub-category slugs match GoAffPro display names exactly (`Bxnny.Arts`, `sarudrawss`, `Merc Da Artist`, `Addham`, …) or use a shorter house style (`Bxnny`, `Saru`, `Merc`, `Addham`). Both work. **Recommendation: match the GoAffPro display name** because (a) it makes the data-entry pass into the `artists` table trivial — `displayName` is literally the GoAffPro field, (b) Merc Da Artist already exists in this style in production, and (c) the user-facing artist page header reads the same string from the `artists.displayName` column.

- [ ] **C.1.1: Record the decision in this plan** (overwrite this line with the chosen convention before C.2).

### Task C.2 — Create the sub-categories in Square production

**Steps (manual, Square dashboard):**

- [ ] **C.2.1: Open Square Dashboard → Items & Services → Categories.**
- [ ] **C.2.2: For each of the 22 missing artists** (everyone approved in GoAffPro per `goaffpro-api-probes.md §5` except `Merc Da Artist` which exists), create a new category named per the convention from C.1, with `Artist` as the parent.
- [ ] **C.2.3: Record each new category's id in a temporary `artists-seed.csv`** (or just a markdown table in this plan during execution) — these ids become the `squareCategoryId` values seeded into the `artists` table in Plan E.

### Task C.3 — Re-categorize real items

**Steps (manual, Square dashboard; can be done in bulk via CSV import if the operator prefers):**

- [ ] **C.3.1: Bulk approach:** export items to CSV (Square Dashboard → Items → Actions → Export), add the new artist category id to each row's `Categories` cell, re-import. The CSV column accepts comma-separated category ids.
- [ ] **C.3.2: Manual approach:** for each real item, open its detail page, multi-select to add the relevant `Artist > X` category in the Categories field, save.
- [ ] **C.3.3: Verify** by running `pnpm sq:snapshot production` and grepping for one re-categorized item; confirm the new category id appears in its `categories[]`.

### Task C.4 — Archive the 30 graveyard SKUs

These are the artist-named placeholder items from the Phase B audit (Pattern 1: `Bxnny.Arts Acrylic`, `Saru Print`, `MercDaArtist Acrylic`, etc. — 30 items, listed in the audit report). Once real items carry the `Artist > X` category, the placeholders are redundant.

**Files:**
- Create: `scripts/square-cleanup/archive-graveyard-skus.ts` (one-shot script, follows the existing `scripts/square-cleanup/*` pattern, gated behind `--apply` and the production confirmation phrase)

**Steps:**

- [ ] **C.4.1: TDD-lite — dry-run first.** Script reads the production snapshot (or pulls live), filters items whose names match the graveyard pattern (artist-named placeholders with no images / no category / no description per audit Pattern 1), and prints a list. No writes without `--apply`.
- [ ] **C.4.2: Verify the dry-run hit list matches the 30 expected items** before applying. The audit report has the canonical list — the script's output should be a subset/match.
- [ ] **C.4.3: Apply (sandbox first per the standing rule), then production.** Archival in Square's API: `UpsertCatalogObject` with `item_data.is_archived = true`. Idempotent.
- [ ] **C.4.4: Commit.** `Task C.4: Phase 4 — archive graveyard-SKU script + applied to production`.

### Task C.5 — Lowercase `portrait` category (optional)

- [ ] **C.5.1: Rename or delete** via dashboard (operator's call).

---

# Plan D — Public read paths

**Acceptance criteria:**

- [ ] `/artist` renders a grid of `status='active'` artists (avatar + display name → link), ordered by display name.
- [ ] `/artist/[slug]` renders artist header (avatar, bio, social links) + product grid for items whose `categories[]` contains `artist.squareCategoryId`.
- [ ] PDP `/product/[id]` renders the artist meta line ("Designed by [Artist]" with avatar + Instagram icon) when the item's `categories[]` contains an artist-matched category id, and a "From [Category Name]" breadcrumb pill for each non-artist category.
- [ ] Empty-state on `/artist/[slug]` matches the original spec: "doesn't have any drops yet — follow them on …".
- [ ] Updates from `/admin/artists` actions call `revalidatePath('/artist')` and `revalidatePath('/artist/[slug]', 'page')`.
- [ ] Vitest tests cover: the category-array-walking logic (PDP), the artist-by-category lookup (PDP + `/artist/[slug]`), the active-artists filter (`/artist`).

### Task D.1 — `/artist` gallery

**Files:**
- Create: `src/app/artist/page.tsx`

**Steps:**

- [ ] **D.1.1: TDD — Vitest test** mocks `getActiveArtists()` and renders the page; asserts the grid contains one card per returned artist; inactive artists are not in the result.
- [ ] **D.1.2: Implement** — server component, calls `getActiveArtists()`, renders the grid.
- [ ] **D.1.3: Commit.** `Task D.1: Phase 4 — /artist gallery`.

### Task D.2 — `/artist/[slug]` profile + product grid

**Files:**
- Create: `src/app/artist/[slug]/page.tsx`
- (Possibly) Modify: `src/lib/square/catalog.ts` to add `listItemsByCategoryId(categoryId)` if no helper exists yet — this calls `client.catalog.searchCatalogObjects` with the `categoryId` filter.

**Steps:**

- [ ] **D.2.1: TDD** — mock `getArtistBySlug` + the Square category-search; assert header renders artist fields; product grid renders items returned by the search; empty state renders when product list is empty.
- [ ] **D.2.2: Implement** — fetch artist by slug, 404 if missing or `status='inactive'`. Fetch items via Square `searchCatalogObjects` filtering on `categoryIds: [artist.squareCategoryId]`. Render header + grid.
- [ ] **D.2.3: Commit.** `Task D.2: Phase 4 — /artist/[slug] profile + product grid`.

### Task D.3 — PDP artist meta line + breadcrumb pills

**Files:**
- Modify: `src/app/product/[id]/page.tsx` (does not exist yet; create if absent — Phase 5 in the original spec)

**Steps:**

- [ ] **D.3.1: TDD** — given an item with `categories: [{ id: artistCatId }, { id: animeNarutoId }]`, the page renders one artist card (from `getArtistByCategoryId`) and one IP pill (from `getCategoryNameMap`). Given an item with only non-artist categories, no artist card renders; pills render for each category.
- [ ] **D.3.2: Implement** — server component fetches item (via Phase 3's `getProductById` / cache), then walks `categories[]`. For each category id, look up in `artists` (artist match → render card) or in the category-name map (IP/taxonomy → render pill). The lookups are O(N) categories per item, N typically ≤ 5; no caching needed beyond what `getArtistByCategoryId` and `getCategoryNameMap` already provide.
- [ ] **D.3.3: Commit.** `Task D.3: Phase 4 — PDP artist meta line + breadcrumb pills`.

### Task D.4 — Revalidation hooks

**Files:**
- Modify: `src/app/(admin)/admin/artists/new/actions.ts` and `[id]/actions.ts`

**Steps:**

- [ ] **D.4.1: After a successful create or update**, call:

```typescript
import { revalidatePath } from 'next/cache'

revalidatePath('/artist')
revalidatePath('/artist/[slug]', 'page')
```

- [ ] **D.4.2: Manual smoke.** Edit an artist's display name in admin; reload `/artist` and `/artist/[slug]` in another browser tab; confirm the change appears without a redeploy.
- [ ] **D.4.3: Commit.** `Task D.4: Phase 4 — admin actions trigger /artist revalidation`.

---

# Plan E — Cleanup & launch tail

> **Phase 4 explicitly ships no GoAffPro code.** No one-time API export, no fallback path, no migration script that touches GoAffPro. The 23 artists are entered manually by the operator through the `/admin/artists` UI (built in Plan B), reading their data from wherever the operator wants (the GoAffPro web dashboard, written notes, memory). The `scripts/goaffpro/probe.ts` from commit `5a0200e` stays in-tree as historical reference only and is never executed by Phase 4 work.
>
> **The dead-constant cull is now Task A.0** (run as the first task of Phase 4, before any new schema work). Plan E no longer carries an E.4 task for that scope.

**Acceptance criteria:**

- [ ] `artists` table seeded in production with the operator's chosen set of artists — every row has a real `squareCategoryId` (from Plan C.2), `displayName`, `slug`, `bio` / social links / avatar as the operator chooses, `commissionRate` set per artist (default `0.2000`).
- [ ] Sandbox smoke-test passes end-to-end: artist gallery loads, per-artist page loads, PDP joins to artist correctly, admin CRUD round-trips.
- [ ] Production smoke-test passes (same flow).
- [ ] `GOAFFPRO_ADMIN_API_KEY` and `GOAFFPRO_PUBLIC_TOKEN` removed from `.env.example` (operator removes from their `.env.local` separately at their convenience).
- [ ] `docs/operations/commission-payouts.md` shipped.
- [ ] Tag `phase-4-artist-system` after sandbox + production smoke passes.

### Task E.2 — Seed the `artists` table (manual via admin UI)

The operator opens `/admin/artists/new` and creates each artist record. Source of truth for the data is the operator's choice — most likely the GoAffPro web dashboard, opened in another tab as a reference. Phase 4 does not automate this.

**Steps:**

- [ ] **E.2.1: Operator creates each artist record** via `/admin/artists/new`. Slug, displayName, squareCategoryId (chosen from the dropdown populated by Plan A.3's `getArtistSubCategories()`), status `active`, optional avatar upload, bio, social links, commissionRate, paymentMethod, paymentEmail, notes.
- [ ] **E.2.2: Verify** — `SELECT count(*) FROM artists WHERE status='active'` returns the expected count.
- [ ] **E.2.3: No commit** — data entry produces DB rows, not repo changes.

### Task E.3 — Sandbox + production smoke-test

- [ ] **E.3.1: Sandbox** — mirror production to sandbox via the existing `pnpm sq:mirror`. Walk through admin CRUD, `/artist` gallery, `/artist/[slug]`, PDP for at least 5 real items. (Sandbox can use a small subset of artist records — the test is the integration shape, not the full data set.)
- [ ] **E.3.2: Production** — deploy via Coolify, run the same flow against real production data.

### Task E.5 — Slim GoAffPro env-var cleanup

The operator cancels the GoAffPro subscription on their own schedule (calendar reminder, not a code task). This task only handles the `.env.example` cleanup so the committed template doesn't keep documenting env vars the project no longer uses.

**Steps:**

- [ ] **E.5.1: Remove `GOAFFPRO_ADMIN_API_KEY` and `GOAFFPRO_PUBLIC_TOKEN` from `.env.example`.**
- [ ] **E.5.2: Verification grep** — `grep -rn "GOAFFPRO\|goaffpro" src/ tests/ scripts/`. Expected hits:
  - `scripts/goaffpro/probe.ts` — historical reference, stays
  - Zero hits in `src/` or `tests/`
  - `docs/superpowers/specs/reference/*` may carry historical context — those stay
  - **If any other consumer turns up in `src/` or `tests/`, halt** — something escaped the Phase 4 design.
- [ ] **E.5.3: Commit.** `Task E.5: Phase 4 — remove GoAffPro env vars from .env.example template`.

### Task E.6 — Operations doc

**Files:**
- Create: `docs/operations/commission-payouts.md`

**Steps:**

- [ ] **E.6.1: Write the doc.** Sections: (1) Monthly cadence (last Friday of the month, etc. — operator decides). (2) Open Square Dashboard → Reports → Sales by Category. (3) Set date range. (4) Filter to `Artist > *` categories. (5) For each artist, multiply revenue by the `commission_rate` from the `artists` table (admin UI shows this; or query psql directly). (6) Subtract any applicable discounts (con discount, military discount, site-wide promo) following the rule from `goaffpro-api-probes.md §10` (net-of-discount, pre-tax). (7) Pay via the artist's `payment_method` / `payment_email`. (8) Record payout date in the artist's `notes` field.
- [ ] **E.6.2: Commit.** `Task E.6: Phase 4 — commission payouts operations doc`.

### Task E.7 — Final tag

- [ ] **E.7.1: Run final verification.** `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all green. Sandbox + production smoke (E.3) both passed.
- [ ] **E.7.2: Tag.** `git tag -a phase-4-artist-system -m "Phase 4 complete: artist system replaces GoAffPro"`.

---

## Phase 4 self-review checklist

Before declaring complete:

- [ ] **Spec coverage.** Every superseded section in the design spec (§3, §4, §5, §11, §13) now has a banner pointing to this plan and to the handoff brief. Every concrete bullet in `artist-system-handoff.md` (Plans A through E) maps to a Task in this plan.
- [ ] **No GoAffPro code anywhere.** `grep -rn "goaffpro\|GoAffPro" src/ tests/` returns zero hits. (The probe script under `scripts/goaffpro/probe.ts` stays as historical reference; doc references under `docs/superpowers/specs/reference/*` stay as historical context.)
- [ ] **No new vendors.** Only one new package added: `sharp` (Plan B.2.2, for server-side avatar resize).
- [ ] **No `artist` Square custom attribute definition.** `grep -rn "artist.*custom.*attribute\|custom_attribute_definition.*artist" src/` returns zero hits.
- [ ] **Dead Phase 3 constants culled.** `grep -rn 'CUSTOM_ATTR_KEYS\|PRODUCT_TYPES\|isProductType' src/` returns zero hits (Task A.0 outcome).
- [ ] **One Postgres table.** Only `artists` was added. No `affiliates`, `commission_*`, `attribution_*`, `clicks` tables.
- [ ] **Logto auth reused.** `(admin)/layout.tsx` calls `getLogtoContext()`; no separate auth code.
- [ ] **Sandbox-first discipline.** Every production write (graveyard archival) rehearsed in sandbox first.
- [ ] **All commit steps ran `pnpm lint:fix` before `git add`.**

---

## Decisions captured

The six ambiguity flags surfaced in the original draft of this plan have been resolved. Locked-in decisions, all incorporated above:

1. **Timestamp timezone:** `withTimezone: true` on every column. Confirmed by re-probe of Square API on 2026-05-15 — Square returns every timestamp as ISO-8601 UTC with `Z` suffix (e.g. `'2026-04-18T11:06:18.888Z'`). Postgres `timestamp with time zone` stores UTC internally, matching Square's wire format and the existing schema convention across all 9 Phase 2 tables.
2. **`(admin)` route group origin:** Phase 4 Plan B Task B.1 ships the minimal `(admin)/layout.tsx`. Phase 7 will add more admin pages under the same route group without redoing the layout. **All GoAffPro code is dropped from Phase 4** — no one-time API export, no bootstrap script. The operator enters artist data manually through the admin UI built in Plan B.
3. **Avatar uploads:** Approach A — server-side file upload with `sharp` resize to 500×500 webp, stored to `public/images/artists/<slug>.webp`. Coolify deploy has writable `public/` at runtime, so no need to swap to Vercel Blob / S3.
4. **Sub-category naming convention:** Convention 1 — match GoAffPro display name exactly (`Bxnny.Arts`, `sarudrawss`, `Merc Da Artist`, etc.). The existing `Merc Da Artist` production sub-category stays as-is. The public-facing artist name (set in `artists.displayName` via the admin form) is independent and can be cleaned up per-artist.
5. **Seed path:** Manual via admin UI only. No seed script. Task E.2 is just "operator opens `/admin/artists/new` and creates records." Source of truth for the data is the operator's choice (GoAffPro dashboard in another tab, written notes, memory).
6. **Cull `types.ts` dead constants:** Option C — moved to a new Task A.0 at the start of Phase 4. The cull is the first thing the implementer does, before any new schema work builds on top.

All six are now locked in and reflected in the task list above. No outstanding open items.
