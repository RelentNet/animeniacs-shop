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
| **A** | Schema + query helpers + Square category list helper | — | B, D |
| **C** | Square dashboard work (sub-category creation, item re-categorization, graveyard archival) | — | D |
| **B** | `/admin/artists` CRUD | A | E |
| **D** | Public read paths (PDP, `/artist`, `/artist/[slug]`) | A + at least one seeded artist row + C | E |
| **E** | Cleanup & launch tail (production migration, GoAffPro retirement, doc) | A, B, C, D | — |

A and C can run in parallel. B starts after A's schema lands. D needs both A (so it can read from `artists`) and ideally one seeded row + at least one re-categorized Square item from C (so there's something to look at). E is the closing sweep.

---

# Plan A — Schema + Artist Query Helpers + Category Helper

**Acceptance criteria:**

- [ ] `pnpm db:generate` produces a `0009_*_artists.sql` migration.
- [ ] `pnpm db:push --force` applies cleanly against the local Postgres at `localhost:5433`.
- [ ] `\d artists` in psql shows: 16 columns (incl. `id`, `slug` unique, `display_name`, `square_category_id` indexed, `status` CHECK-constrained, profile fields, commission fields, timestamps).
- [ ] `src/lib/db/queries/artists.ts` exports `getActiveArtists`, `getArtistBySlug`, `getArtistByCategoryId`, `getAllArtists`, `createArtist`, `updateArtist`, `setArtistStatus`, all typed via the inferred Drizzle row type.
- [ ] `src/lib/square/categories.ts` exports `listCategoriesFromSquare()` and `getArtistSubCategories()`, the latter filtering to children of the production "Artist" parent category id (`B6I2KLCRDEHSF6XHODMNSG6P` per the production survey).
- [ ] Integration test `tests/integration/artists.integration.test.ts` covers happy-path insert/select/update + the three guarded uniques (`slug` unique, `status` CHECK, indexed `square_category_id` lookup), using `testNamespace` + `cleanupByPrefix` per the existing convention.
- [ ] `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint` all green.

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

> **Note on timestamps:** the original handoff brief snippet used `timestamp('created_at').notNull().defaultNow()` without `withTimezone: true`. Every other timestamp column in the codebase uses `withTimezone: true` (Phase 2 convention). The plan normalizes to `withTimezone: true` for consistency. **Flagged for user review** — if you specifically wanted naive timestamps for some reason, change before running A.1.

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
- Verify (do not modify if present): `src/app/(admin)/layout.tsx` — should already exist per design spec §11. If it does **not** exist yet (Phase 7 hasn't shipped), this plan ships a minimal version here as the first usage of the `(admin)` route group. **Flagged for user review** — the original spec §11 placed admin auth in Phase 7; the artist admin is the first concrete consumer, so the route group's `layout.tsx` may need to be created here. If you'd rather wait until Phase 7 is plotted, defer Plan B and ship Plans A + C + D + E with manual seed scripts replacing the admin UI; that path is viable but trades 30 min of admin work for ~2 hr of seed-script work.

**Steps (only if `(admin)/layout.tsx` does not already exist):**

- [ ] **B.1.1: Create `src/app/(admin)/layout.tsx`.** Calls `getLogtoContext(logtoConfig)` (the import + setup mirrors design spec §10), redirects to `/sign-in` if `!claims?.isAuthenticated`, returns a 403 page component if `!claims?.roles?.includes('admin')`. Render `<div>{children}</div>` (or a thin admin chrome).
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
- [ ] **B.2.2: Implement `src/lib/images/upload.ts`.** Function `saveAvatar(file: File, slug: string): Promise<string>` returns the public URL path (`/images/artists/<slug>.webp`). Uses `sharp` if available; if `sharp` is not yet a project dependency, add it (it's a sensible new dev dep here). Validates: max 2 MB, mime type in whitelist; resizes to 500×500 (square crop, center); writes to `public/images/artists/`. **Flagged for user review** — `sharp` is the standard for Node-side image processing but it is a new dependency; if you'd rather defer image handling, the field can be a plain URL input for v1 and uploads added later.
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

**Acceptance criteria:**

- [ ] One-shot data dump from GoAffPro for the 23 approved artists captured to `/tmp/goaffpro-approved-artists-<ts>.json` for human review.
- [ ] `artists` table seeded in production with all 23 records — every row has a real `squareCategoryId` (from Plan C.2), `displayName` from GoAffPro, `slug` derived from displayName, `bio` / social links copied from GoAffPro where present, `commissionRate` set to `0.2000` unless the operator overrides per artist.
- [ ] Avatar images either uploaded via admin or left blank for the operator to fill in later.
- [ ] Sandbox smoke-test passes end-to-end: artist gallery loads, per-artist page loads, PDP joins to artist correctly, admin CRUD round-trips.
- [ ] Production smoke-test passes (same flow).
- [ ] GoAffPro subscription cancelled (manual; operator does this).
- [ ] `GOAFFPRO_ADMIN_API_KEY` and `GOAFFPRO_PUBLIC_TOKEN` removed from `.env.local` and `.env.example`.
- [ ] `src/lib/square/types.ts` dead constants (`CUSTOM_ATTR_KEYS`, `PRODUCT_TYPES`, `isProductType`, the `customAttributes` field on `CachedProduct`) culled — see E.4 below for the precise scope.
- [ ] `docs/operations/commission-payouts.md` shipped.
- [ ] Tag `phase-4-artist-system` after sandbox + production smoke passes.

### Task E.1 — One-shot GoAffPro data dump

**Files:**
- (No new files — uses the existing `scripts/goaffpro/probe.ts`.)

**Steps:**

- [ ] **E.1.1: Run `pnpm goaffpro:probe`** (existing script from commit `5a0200e`). Output lands in `/tmp/goaffpro-snapshot-<ts>.json`.
- [ ] **E.1.2: Filter to `status === 'approved'`** — the 23 artists. Capture this filtered subset to `/tmp/goaffpro-approved-artists-<ts>.json` for the data-entry pass.
- [ ] **E.1.3: No commit needed** — these are local artifacts under `/tmp/`. The probe script itself stays in-tree as historical reference.

### Task E.2 — Seed the `artists` table

**Two paths depending on operator preference:**

**Path A — Manual via admin UI.** Open `/admin/artists/new`, transcribe each of the 23 artists' data from the dump file. ~5 minutes per artist × 23 = ~2 hours. Pros: every row gets human review; avatars can be uploaded inline. Cons: 2 hours of typing.

**Path B — One-shot seed script.** Create `scripts/seed-artists.ts` that reads `/tmp/goaffpro-approved-artists-<ts>.json` + a hand-prepared CSV mapping GoAffPro id → `squareCategoryId` from Plan C.2, and inserts directly via `createArtist`. ~30 minutes of script work, then ~5 minutes to run, then ~30 minutes to spot-check via the admin UI.

- [ ] **E.2.1: Decide between Path A and Path B.** Flagged for user review.
- [ ] **E.2.2: Execute the chosen path.**
- [ ] **E.2.3: Verify** — `SELECT count(*) FROM artists WHERE status='active'` returns 23 (or whatever subset the operator approved during review).
- [ ] **E.2.4: Commit** (Path B only) — `Task E.2: Phase 4 — one-shot artists seed script`.

### Task E.3 — Sandbox + production smoke-test

- [ ] **E.3.1: Sandbox** — mirror production to sandbox via the existing `pnpm sq:mirror`, seed the same `artists` data into the local Postgres pointing at the sandbox-paired DB if separate (the current setup uses one Postgres, so no extra step). Walk through admin CRUD, `/artist` gallery, `/artist/[slug]`, PDP for at least 5 real items.
- [ ] **E.3.2: Production** — deploy to staging / production per the project's existing deploy story (out of scope for this plan; the deploy pipeline is whatever it is for the project). Walk through the same flow against real production data.

### Task E.4 — Cull dead constants from `src/lib/square/types.ts`

**Decision flag:** the original Phase 3 amendment marked `CUSTOM_ATTR_KEYS`, `PRODUCT_TYPES`, `isProductType`, and the `customAttributes` field on `CachedProduct` as harmless dead weight. They can be culled now or left for a future cleanup pass.

**Recommendation:** cull them in Plan E because (a) the Phase 4 code is touching this area anyway when Plan D wires the PDP, and (b) every line of dead code is a future-reader confusion source. Cull is a ~10-line diff.

**Files:**
- Modify: `src/lib/square/types.ts`
- Possibly modify: any consumers — check via grep before deleting.

**Steps:**

- [ ] **E.4.1: Grep** — `grep -rn "CUSTOM_ATTR_KEYS\|PRODUCT_TYPES\|isProductType\|customAttributes" src/ tests/`. Expected: references only in `types.ts` and possibly its own unit test. If there are real consumers, hold and re-scope.
- [ ] **E.4.2: Delete the four exports** from `types.ts` and delete the `customAttributes` field from `CachedProduct`.
- [ ] **E.4.3: Delete the `types.test.ts` file** if it exists and only tested these exports.
- [ ] **E.4.4: Run `pnpm typecheck && pnpm lint && pnpm test`.** Expected: clean.
- [ ] **E.4.5: Commit.** `Task E.4: Phase 4 — cull dead Square custom-attribute constants`.

### Task E.5 — Cancel GoAffPro + remove env vars

**Steps:**

- [ ] **E.5.1: Operator cancels GoAffPro subscription** in the GoAffPro dashboard.
- [ ] **E.5.2: Remove from `.env.local`** the `GOAFFPRO_ADMIN_API_KEY` and `GOAFFPRO_PUBLIC_TOKEN` lines.
- [ ] **E.5.3: Remove from `.env.example`** the same two lines.
- [ ] **E.5.4: Search for any other GoAffPro references** in code or docs that need cleanup. The probe script and the reference docs stay (historical). Expected hits: zero in `src/`; some in `docs/` reference docs (left alone — they are historical context).
- [ ] **E.5.5: Commit.** `Task E.5: Phase 4 — remove GoAffPro env vars after subscription cancellation`.

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
- [ ] **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/` returns zero hits (script directory and docs are OK).
- [ ] **No new vendors.** No new package added beyond `sharp` (if Plan B.2.2 chose to include it).
- [ ] **No `artist` Square custom attribute definition.** `grep -rn "artist.*custom.*attribute\|custom_attribute_definition.*artist" src/` returns zero hits.
- [ ] **One Postgres table.** Only `artists` was added. No `affiliates`, `commission_*`, `attribution_*`, `clicks` tables.
- [ ] **Logto auth reused.** `(admin)/layout.tsx` calls `getLogtoContext()`; no separate auth code.
- [ ] **Sandbox-first discipline.** Every production write (graveyard archival, seed) was rehearsed in sandbox first.
- [ ] **All commit steps ran `pnpm lint:fix` before `git add`.**

---

## Open items for user review

These are decisions that were ambiguous in the brief or that need an explicit call before the implementing agent dispatches:

1. **Timestamp timezone consistency** — the brief snippet used `timestamp('created_at').notNull().defaultNow()` (no timezone). This plan normalizes to `withTimezone: true` matching the existing schema convention. If you specifically wanted naive timestamps, change A.1.2 before running.
2. **`(admin)` route group origin** — the original spec §11 placed admin auth in Phase 7. The artist admin is the first concrete consumer. This plan (Task B.1) ships the minimal `(admin)/layout.tsx` if it isn't already present. If you'd rather defer admin entirely and use a seed script + psql for v1, drop Plan B and bump it to Phase 7.
3. **Avatar uploads** — this plan adds `sharp` as a new dev dependency to do server-side resize. Acceptable? Or skip image uploads in v1 (avatar is a plain URL field that admin pastes manually)?
4. **Sub-category naming convention** (Task C.1) — recommendation is "match GoAffPro display name exactly" (e.g., `Bxnny.Arts`, `sarudrawss`, `Merc Da Artist`). Confirm before starting Plan C.
5. **Seed path** (Task E.2) — manual via admin UI (~2 hours of typing, good for review) or one-shot script (~30 min build + ~30 min spot-check, faster but bypasses review). Pick one.
6. **Cull `types.ts` dead constants** (Task E.4) — recommendation is yes, cull now. Confirm or defer.

Stop after the plan ships and surface these for review before dispatching the implementer.
