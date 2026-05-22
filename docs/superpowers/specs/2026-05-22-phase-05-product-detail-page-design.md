# Phase 5 — Product Detail Page (PDP) design spec

**Status:** APPROVED design, ready to plan.
**Date:** 2026-05-22
**Predecessor:** `docs/superpowers/specs/reference/phase-04-handoff.md`
**Resumption source:** `docs/superpowers/specs/reference/phase-05-brainstorm-resumption.md` (captures the 13 locked decisions and the section-by-section approval history).
**Next step:** invoke `superpowers:writing-plans` to produce
`docs/superpowers/plans/2026-05-22-phase-05-product-detail-page.md`.

---

## 0. Goals

Ship the public-facing Product Detail Page (`/product/[id]`), the
public IP browse page (`/category/[slug]`), a new admin area for
mapping Square IP categories to safe public nicknames
(`/admin/ip-nicknames`), and the supporting server-side read layer.

The PDP currently 404s; this phase wires it end-to-end against real
Square catalog data with a read-through cache. The cart, wishlist,
reviews, recently-viewed strip, PDP upsells, `/shop`, `/admin/settings`,
the Square webhook handler, and the backfill sync script are all
explicitly **out of scope** — they each become their own phase.

## 1. Non-goals (Phase 5 does NOT ship these)

- Cart, wishlist UI, or any localStorage writes from the PDP.
- Reviews UI.
- Recently-viewed strip.
- PDP add-on upsell section.
- `/shop` listing or any global product browser.
- `/admin/settings` route group or any scene/upsell admin UI.
- The Square `catalog.version.updated` webhook handler.
- `pnpm square:sync` backfill script.
- IP cover-image uploads (the `cover_image_url` column stays in the
  schema but no Phase 5 UI populates it).
- Footer or navigation links to `/category/[slug]` (operator hand-shares
  URLs in Phase 5; nav surfacing is a later phase).

## 2. Hard constraints (still in force from Phase 4)

These are inherited from `phase-04-handoff.md` and remain non-negotiable:

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/`
   must return zero hits.
2. **No `artist` Square custom attribute definition.** Artists are
   resolved via the local `artists` table joined by `squareCategoryId`.
3. **No new auth vendors.** New admin routes inherit `src/app/(admin)/layout.tsx`.
4. **No commission engine.** Manual Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 5 adds exactly ONE new table: `ip_nicknames`.
6. **Sandbox-first for any production write.** Phase 5 does no Square
   writes, so this is mostly a no-op — but the rule still applies if
   something pivots.
7. **IP categories never public via their literal Square name.** This is
   THE constraint that drove the `ip_nicknames` design. The literal
   Square category name (`Anime > Naruto`) is staff-only.

## 3. Locked decisions (13 — from the brainstorm session)

Captured in full in
`docs/superpowers/specs/reference/phase-05-brainstorm-resumption.md`.
Restated here so this spec is self-contained.

| # | Decision |
|---|----------|
| 1 | **Scope:** PDP-shell-first. Ships PDP layout + cache; defers cart, wishlist, reviews, recently-viewed. |
| 2 | **Catalog infrastructure:** read-through cache only. New `getProductById()` hits `product_cache`, falls back to Square, writes back with 1h TTL. Defers webhook + backfill. |
| 3 | **Mockup gallery scene library:** 4 scenes hardcoded in `src/lib/mockup-scenes.ts` (TS const). Defers admin scene editor. |
| 4 | **Variant picker UX:** auto-detect ITEM_OPTION axes. One `<select>` per axis. Generalizable. |
| 5 | **Add-to-Cart button:** rendered but `disabled` + tooltip *"Shopping cart launching soon — follow us on Instagram for the launch."* No state writes. |
| 6 | **Production time text:** hardcoded const in `src/lib/site-copy.ts`. Default: *"Ships in 3-10 days depending on convention schedule."* PDP upsell section omitted entirely from Phase 5. |
| 7 | **PDP breadcrumbs:** minimal `Home / {Product Name}` (two segments only). Middle `/shop` segment deferred. |
| 8 | **IP nicknames table + admin:** new `ip_nicknames` Postgres table + `/admin/ip-nicknames` CRUD admin. Operator assigns nicknames + slugs to Square IP categories. Categories without a row stay private. |
| 9 | **IP-related public surface:** ship both. (a) PDP related-products uses same-artist (priority 1) then same-IP-via-nickname (priority 2), labeled *"More from [Artist]"* or *"More from [Nickname]"* — never the literal IP name. (b) Public `/category/[slug]` IP browse page. |
| 10 | **Product image gallery:** mockup gallery + thumbnail strip combined. One component. Clicking a product image thumbnail swaps the overlay; clicking a scene thumbnail swaps the background. |
| 11 | **Description sanitization:** strict `isomorphic-dompurify` whitelist (`p`, `br`, `ul`, `ol`, `li`, `strong`, `em`, `a` with enforced `rel="noopener noreferrer"` + `target="_blank"`). Strip everything else. No `<img>`. |
| 12 | **Test coverage depth:** match Phase 4 discipline. vitest + RTL for unit, `vitest.integration.config.ts` for DB-backed tests, manual smoke for client interactivity. No Playwright addition. |
| 13 | **Plan structure:** five plans, bottom-up (A: cache, B: ip_nicknames table+admin, C: client components, D: PDP page, E: /category page). A/B/C in parallel; D needs A+B+C; E needs A+B. |

Additional sub-decisions captured during Sections 4–6 brainstorm:

- **Cover-image upload deferred.** `ip_nicknames.cover_image_url` stays
  nullable in the schema; Phase 5 ships no UI for it. `/category/[slug]`
  shows a CSS gradient + nickname text as the cover instead of an image.
- **IP picker UX:** flat `<select>` with hierarchical labels (e.g.
  `Anime > Naruto`).
- **IP nickname slug pattern:** lowercase letters, digits, hyphen only
  (no dot — artists allow dot for handles like `Bxnny.Arts`; IP
  nicknames don't need it).
- **ITEM_OPTION projection:** project at `denormalize()` time, fully
  typed. `CachedProduct` gains `itemOptions: CachedItemOption[]`;
  `CachedVariation` gains `optionValueIds: string[]`.
- **Square image host allowlist:** tight allowlist of both production
  and sandbox S3 buckets only (no wildcards). Execution plan verifies
  hostnames against live Square responses before committing
  `next.config.mjs` edits.

## 4. Acceptance criteria

These five gates determine "Phase 5 done":

1. `/product/<real-square-item-id>` renders the full PDP layout
   end-to-end against live Square data.
2. `/category/<real-ip-nickname-slug>` renders the IP browse page.
3. Operator can sign in to `/admin/ip-nicknames`, browse Square's
   non-artist categories, create + edit nicknames, and toggle `is_public`
   to make a page go live or hide it.
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`,
   and `pnpm build` all pass clean.
5. Git tag `phase-5-product-detail-page` applied at the final commit.

## 5. Architecture overview

Phase 5 layers cleanly on Phase 4. Nothing in Phase 4's surface area
changes; new modules slot in as siblings.

```
src/
├── app/
│   ├── (admin)/admin/ip-nicknames/        # NEW — admin CRUD (mirrors /admin/artists)
│   │   ├── page.tsx                       # list
│   │   ├── new/{page,actions}.ts(x)
│   │   ├── [id]/{page,actions}.ts(x)
│   │   └── _components/
│   │       ├── IpNicknameForm.tsx
│   │       ├── SquareIpCategoryPicker.tsx
│   │       ├── formData.ts
│   │       └── validation.ts
│   ├── product/[id]/                       # REPLACE — currently 404 stub
│   │   ├── page.tsx                       # full PDP
│   │   ├── loading.tsx
│   │   └── error.tsx
│   └── category/[slug]/                    # NEW — public IP browse
│       ├── page.tsx
│       ├── loading.tsx
│       └── error.tsx
├── components/product/
│   ├── ArtistMetaLine.tsx                  # UNCHANGED (Phase 4)
│   ├── MockupGallery.tsx                   # NEW (client)
│   ├── MockupGallery.module.css            # NEW
│   ├── VariantPicker.tsx                   # NEW (client)
│   └── PdpPurchasePanel.tsx                # NEW (client island wrapping VariantPicker)
├── lib/
│   ├── db/
│   │   ├── schema.ts                       # APPEND `ipNicknames` table
│   │   └── queries/
│   │       └── ip-nicknames.ts             # NEW — 7 query helpers + Zod schema
│   ├── square/
│   │   ├── categories.ts                   # APPEND `getNonArtistCategories()` + hierarchical label helper
│   │   ├── items.ts                        # UNCHANGED
│   │   ├── client.ts                       # UNCHANGED
│   │   └── types.ts                        # EXTEND CachedProduct + CachedVariation
│   ├── products/
│   │   └── cache.ts                        # NEW — `getProductById` read-through cache + `denormalize` + `__forceRefresh`
│   ├── categories/
│   │   ├── related.ts                      # NEW — `getRelatedProducts` two-tier resolver
│   │   └── index.ts                        # NEW — `getProductsForIpNickname` wrapper
│   ├── mockup-scenes.ts                    # NEW — 4 scenes baked in as TS const
│   ├── sanitize-html.ts                    # NEW — dompurify wrapper with Decision 11 whitelist
│   └── site-copy.ts                        # NEW — `PRODUCTION_TIME_TEXT` const
├── public/images/
│   ├── mockup-scenes/                      # NEW — 4 background images committed
│   └── ip-covers/                          # (empty for Phase 5; future uploads land here)
└── ...

next.config.mjs                              # EDIT — add Square S3 hostnames to images.remotePatterns
```

Migration files: one new Drizzle migration named
`0010_<random>_ip_nicknames.sql` (auto-generated via `pnpm db:generate`).

## 6. Data model

### 6.1 New table: `ip_nicknames`

```ts
// src/lib/db/schema.ts (appended)
export const ipNicknames = pgTable(
  'ip_nicknames',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    squareCategoryId: text('square_category_id').notNull().unique(),
    slug: text('slug').notNull().unique(),
    nickname: text('nickname').notNull(),
    description: text('description'),
    coverImageUrl: text('cover_image_url'),     // nullable; no Phase 5 UI populates it
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  }
)
```

Indexes: implicit indexes on the two unique columns (`slug`,
`square_category_id`) cover all public lookup paths. No additional
indexes for v1.

No foreign-key constraint between `square_category_id` and any local
table. Square is the source of truth; the column points outward by
string.

### 6.2 Existing tables touched

- **`product_cache`** (Phase 2 schema, never used until now): Phase 5
  wires the read path. The `data` jsonb column holds a serialized
  `CachedProduct`. `updated_at` drives the 1-hour TTL.

No other table changes.

### 6.3 Type extensions in `src/lib/square/types.ts`

```ts
export interface CachedItemOptionValue {
  id: string
  name: string
}

export interface CachedItemOption {
  id: string
  name: string
  values: CachedItemOptionValue[]
}

export interface CachedProduct {
  // ...existing fields...
  itemOptions: CachedItemOption[]      // NEW (empty array for items with no options)
}

export interface CachedVariation {
  // ...existing fields...
  optionValueIds: string[]              // NEW (empty array for variations with no option values)
}
```

## 7. Server-side read modules

Four new server-only modules. Sizes are estimates from the brainstorm.

| File | Purpose | Approx LOC |
|---|---|---|
| `src/lib/products/cache.ts` | `getProductById(id)` + read-through cache + private `readFresh`, `refreshFromSquare`, `denormalize`. Test-only `__forceRefresh(itemId)` export. TTL constant lives here for easy tuning. | ~120 |
| `src/lib/db/queries/ip-nicknames.ts` | 7 query helpers + Zod input schema. Mirrors `src/lib/db/queries/artists.ts` exactly. Exports: `getAllIpNicknames`, `getPublicIpNicknames`, `getIpNicknameBySlug`, `getIpNicknameByCategoryId`, `getIpNicknameById`, `createIpNickname`, `updateIpNickname`. | ~150 |
| `src/lib/categories/related.ts` | `getRelatedProducts(currentItemId, categoryIds): RelatedResult`. Two-tier priority (artist → IP nickname). Returns `{items: ArtistProduct[], source: {kind: 'artist' \| 'ip', slug, displayName \| nickname} \| null}`. Caps at 6 items. Excludes the current item id. | ~50 |
| `src/lib/categories/index.ts` | `getProductsForIpNickname(nickname): ArtistProduct[]` — thin wrapper around the existing `getItemsByCategoryId`. | ~10 |

Sub-rules captured during Section 3:

- `getProductById` is single-item only. Bulk-load uses the existing
  `getItemsByCategoryId` (which has its own caching).
- No backoff / retry layer in Phase 5; Square free-tier rate limit is
  plenty for read-only PDP traffic.
- Deleted-item handling: leave the stale cache row, let the next miss
  replace it. Acceptable for v1.

### 7.1 Append to `src/lib/square/categories.ts`

```ts
/**
 * Every category that is NOT the Artist parent and NOT one of its
 * children. Used by the IP-nicknames admin to assign nicknames to
 * non-artist categories.
 */
export async function getNonArtistCategories(): Promise<SquareCategory[]>

/**
 * Walks parentCategoryId up the chain, joining names with ` > `.
 * Used to build hierarchical labels for the IP category picker.
 */
export function buildHierarchicalLabel(
  category: SquareCategory,
  allById: Map<string, SquareCategory>
): string
```

## 8. Admin UI — `/admin/ip-nicknames`

Mirrors `/admin/artists` exactly. Auth inherited from the existing
`src/app/(admin)/layout.tsx` gate.

### 8.1 List page (`/admin/ip-nicknames`)

| Column | Source |
|---|---|
| Public? | green badge if `is_public=true`, gray if false |
| Nickname | `nickname` |
| Slug | `slug` (mono-font) |
| Square category | `getCategoryNameMap().get(squareCategoryId)` (staff-only visibility — this is behind the admin gate) |
| Description | first ~80 chars + ellipsis |
| — | edit link |

`+ new nickname` header link. Empty state mirrors the artists list empty state.

### 8.2 New / Edit forms

`IpNicknameForm.tsx` is a client component using `useFormState` for
inline server-action errors (same pattern as `ArtistForm`).
Mode-aware (`create` | `edit`). Slug becomes `readOnly` in edit mode.

Fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| Slug | `<input type="text" pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$">` | yes | Lowercase letters, digits, hyphen. Max 80 chars. **No dot.** |
| Nickname | `<input type="text">` | yes | Max 120 chars. The freeform public display name. |
| Square category | `<select>` from `SquareIpCategoryPicker` (hierarchical labels) | yes | Excludes already-mapped categories; re-includes the current row's id in edit mode. |
| Description | `<textarea>` | no | Max 2000 chars. Plain text. |
| Is public | radio: Public / Hidden | yes | Default `Public` on create. |

No cover-image field in Phase 5.

### 8.3 Server actions

`createIpNicknameAction` and `updateIpNicknameAction` follow the
`ArtistForm` pattern exactly: `parseIpNicknameForm` → Zod validation →
DB call → unique-violation translation → `revalidatePath` →
`redirect('/admin/ip-nicknames')`.

Unique violations distinguish two cases (slug already used OR
square_category_id already mapped) via constraint name in the Postgres
error.

### 8.4 Square IP category picker

`SquareIpCategoryPicker.tsx` (server component):

```ts
export interface SquareIpCategoryOption {
  id: string
  label: string  // hierarchical, e.g. "Anime > Naruto"
}

export async function loadIpCategoryOptions(
  alreadyMappedCategoryIds?: Set<string>
): Promise<SquareIpCategoryOption[]>
```

Sorted alphabetically by label. Used as a plain `<select>` in the form.

## 9. PDP client components

### 9.1 `<MockupGallery />`

`src/components/product/MockupGallery.tsx` (client).

```ts
interface MockupGalleryProps {
  scenes: MockupScene[]            // from src/lib/mockup-scenes.ts
  productImages: string[]          // CachedProduct.images
  productName: string              // alt-text base
}
```

Internal state: `sceneIdx`, `productImageIdx`.

Layout:
- Thumbnail strip (left on desktop / top on mobile) with two groups:
  - Scene thumbnails (always rendered)
  - Product image thumbnails (rendered only if `productImages.length > 1`)
- Main display: active scene background + product overlay positioned per
  `scenes[sceneIdx].productPosition`. Overlay `src` = `productImages[productImageIdx]`.

Interactivity:
- Click scene thumbnail → cross-fade backgrounds (400ms `transition: opacity`).
- Click product image thumbnail → instant overlay `src` swap.
- Keyboard arrows cycle scenes when container is focused.
- `prefers-reduced-motion`: skip cross-fade, instant swap.

Accessibility:
- Real `<button type="button">` for every thumbnail; `aria-label`, `aria-pressed`.
- Main display `<div>` has `role="img"` + composed `aria-label`.
- Container `tabIndex={0}` for keyboard nav.

Empty-state guard: `productImages.length === 0` → render scene only with
`aria-label="No product image available"`. Layout doesn't collapse.

Styling: CSS modules co-located (`MockupGallery.module.css`). Background
images loaded via `next/image` with `priority` on the active scene.

### 9.2 `<VariantPicker />`

`src/components/product/VariantPicker.tsx` (client).

```ts
interface VariantPickerProps {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  onChange: (variation: CachedVariation | null) => void
  initialVariationId?: string
}
```

Rendering rules:
- For each `itemOption`: render labeled `<select>` over its values
  (`name="option-{itemOption.id}"`).
- If `itemOptions.length === 0`:
  - One variation: render nothing.
  - Multiple variations: single `<select>` over variation names.

Resolution:
- Track `selected: Map<itemOptionId, optionValueId>`.
- Match: `variations.find(v => itemOptions.every(opt => v.optionValueIds.includes(selected.get(opt.id))))`.
- Found → `onChange(matchedVariation)`.
- No match → `onChange(null)`. Parent renders *"Combination unavailable"*.

Initial selection: `initialVariationId` if provided, else
`variations[0]`'s option values. Always boots to a valid combo.

Accessibility:
- Each `<select>` properly labeled via `<label htmlFor>`.
- Picker emits no `<form>`; lives inside the PDP's layout.

### 9.3 Edge cases (both components)

| Case | Behaviour |
|---|---|
| Item has no variations | Picker renders nothing; PDP renders item-level fields and disabled Add-to-Cart. |
| Item has variations but no ITEM_OPTIONs | Single `<select>` over variation names. |
| Variation count exceeds cross-product of option values | Excess legacy variations not selectable. Acceptable v1. |
| Duplicate value names across different option IDs | Scoped by `itemOption.id`; no collision. |

### 9.4 Scene library

`src/lib/mockup-scenes.ts`:

```ts
export interface MockupScene {
  id: string
  name: string
  backgroundImage: string  // local path: /images/mockup-scenes/<id>.webp
  productPosition: {
    top: string; left: string; width: string; height: string; transform: string
  }
}

export const MOCKUP_SCENES: readonly MockupScene[] = [/* 4 scenes from reference HTML */]
```

The 4 original scenes from
`docs/superpowers/specs/reference/mockup-gallery-original.html` are
migrated verbatim. Background images downloaded from the old WordPress
URLs at plan execution time and committed to
`public/images/mockup-scenes/<id>.webp`. Self-hosted, survives any
WordPress deprecation.

## 10. PDP route (`/product/[id]`)

Replaces the current `notFound()` stub at
`src/app/product/[id]/page.tsx`.

Server flow:

```ts
const product = await getProductById(params.id)
if (!product) notFound()
const related = await getRelatedProducts(product.id, product.categoryIds)
// render
```

`generateMetadata` returns
`{ title: '{product.name} | Animeniacs', description: stripHtml(product.descriptionHtml).slice(0, 160) }`.

Page layout (top to bottom):

| # | Element | Source | Notes |
|---|---|---|---|
| 1 | Breadcrumbs | `Home / {product.name}` | Two segments only (Decision 7). |
| 2 | `<MockupGallery>` | `MOCKUP_SCENES` + `product.images` | Left column desktop / full width mobile. |
| 3 | `<h1>` | `product.name` | |
| 4 | `<ArtistMetaLine categoryIds={product.categoryIds} />` | Existing component | Renders nothing if no artist match. |
| 5 | Price | Resolved variation's `price.amount` formatted USD | Updates live via client island. |
| 6 | Production time badge | `PRODUCTION_TIME_TEXT` from `src/lib/site-copy.ts` | Default per Decision 6. |
| 7 | `<VariantPicker>` | `product.itemOptions` + `product.variations` | Hidden when zero options + one variation. |
| 8 | Quantity stepper | Internal to `<PdpPurchasePanel>` (no separate file), defaults to 1 | Visually grouped with Add-to-Cart. |
| 9 | Add-to-Cart button | Disabled + tooltip (Decision 5) | *"Shopping cart launching soon — follow us on Instagram for the launch."* |
| 10 | Sanitized description | `sanitizeProductDescription(product.descriptionHtml)` via `dangerouslySetInnerHTML` | Hidden if `descriptionHtml` is null. |
| 11 | Related products | `related.items` | Heading per `related.source.kind`: *"More from {Artist}"* or *"More from {Nickname}"*. Hidden if no items or no source. |

Client wiring: `<PdpPurchasePanel>` is a client component combining
price + variant picker + qty stepper + disabled CTA. Server page passes
`variations`, `itemOptions`, `productionTimeText` as props.

```ts
// src/components/product/PdpPurchasePanel.tsx (client)
interface Props {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  productionTimeText: string
}

export function PdpPurchasePanel(...) {
  const [selected, setSelected] = useState<CachedVariation | null>(variations[0] ?? null)
  // renders: price, badge, <VariantPicker onChange={setSelected} />, qty, disabled CTA
}
```

Loading state: `src/app/product/[id]/loading.tsx` — minimal skeleton
(gray rectangles where gallery + title + price will go).

Error state: `src/app/product/[id]/error.tsx` (client component per
Next.js requirement) — *"Couldn't load this product."* + retry button
calling `reset()`.

## 11. `/category/[slug]` route

New route. Analog of `/artist/[slug]` for IP nicknames.

Server flow:

```ts
const nickname = await getIpNicknameBySlug(params.slug)
if (!nickname || !nickname.isPublic) notFound()
const products = await getProductsForIpNickname(nickname)
// render
```

`generateMetadata` returns
`{ title: '{nickname.nickname} | Animeniacs', description: nickname.description?.slice(0, 160) ?? 'Drops featuring {nickname.nickname}.' }`.

Page layout:

1. **Cover slot** — CSS gradient background (brand-neutral) + nickname
   centered as `<h1>` in display weight. No image asset in Phase 5.
2. **Description** — `nickname.description` as paragraph below cover.
   Hidden if NULL.
3. **Product grid** — same shape as the `/artist/[slug]` grid (2 cols
   mobile / 3 cols desktop), each item linking to `/product/[id]`.
4. **Empty state** — *"No drops featuring {nickname} just yet."* if
   product list is empty.

No artist meta line on this page. Grid items link to PDPs where
`<ArtistMetaLine>` renders.

Hard-constraint reinforcement: the page renders `nickname.nickname` and
`nickname.description`; the underlying Square category name from
`getCategoryNameMap()` is NEVER rendered here. Regression test enforced
(see §13).

Loading + error states mirror the PDP.

## 12. Cross-cutting modules

### 12.1 `src/lib/sanitize-html.ts`

```ts
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a']
const ALLOWED_ATTR = ['href']

export function sanitizeProductDescription(html: string): string {
  // isomorphic-dompurify with the whitelist + AFTER_SANITIZE_ATTRIBUTES
  // hook that forces rel="noopener noreferrer" + target="_blank" on links.
}

export function stripHtml(html: string | null | undefined): string {
  // For metadata description; strips all tags, returns plain text.
}
```

`isomorphic-dompurify` is already a project dep from Phase 1; no new dep.

### 12.2 `src/lib/site-copy.ts`

```ts
export const PRODUCTION_TIME_TEXT =
  'Ships in 3-10 days depending on convention schedule.'
```

One file, one const. Future PDP copy lands here.

### 12.3 `next.config.mjs`

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'items-images-production.s3.us-west-2.amazonaws.com' },
    { protocol: 'https', hostname: 'items-images-sandbox.s3.us-west-2.amazonaws.com' }
  ]
}
```

Execution plan verifies both hostnames against live Square responses
(one item from each env) before committing the edit. If sandbox uses a
different hostname, the plan amends accordingly.

## 13. Testing strategy

Matches Phase 4 discipline exactly (Decision 12). No new test deps.

### 13.1 Unit tests (vitest + RTL, mocked deps)

| Test file | Coverage |
|---|---|
| `tests/public/mockup-gallery.test.tsx` | Renders with mocked scenes + images. Scene click swaps background + `aria-pressed`. Product image click swaps overlay `src`. Empty `productImages` → fallback. `prefers-reduced-motion` skips transitions. Arrow keys cycle scenes. |
| `tests/public/variant-picker.test.tsx` | One `<select>` per `itemOption`. Change → `onChange` with matching variation. No match → `onChange(null)`. Zero options + one variation → nothing. Zero options + multiple → single select over names. `initialVariationId` honored. |
| `tests/public/pdp-purchase-panel.test.tsx` | Price updates with picker. Add-to-Cart disabled + tooltip from Decision 5. Quantity stepper increments/decrements. Production time text renders. |
| `tests/public/product-detail-page.test.tsx` | Mocks `getProductById`, `getRelatedProducts`. Asserts H1, breadcrumbs are exactly `Home / {name}` (no IP segment — regression guard), `<ArtistMetaLine>` rendered, related section omitted when source null, description omitted when null. |
| `tests/public/category-page.test.tsx` | Mocks `getIpNicknameBySlug`, `getProductsForIpNickname`. Asserts H1 = nickname, description rendered, product grid links to PDPs, empty state. **Regression guard:** Square category name from `getCategoryNameMap()` NEVER in the DOM. |
| `tests/public/sanitize-html.test.ts` | Whitelist enforced (Decision 11). `<script>`, `<img>`, `<iframe>`, inline event handlers, `javascript:` URLs all stripped. `<a>` gets `rel="noopener noreferrer"` + `target="_blank"`. `stripHtml` returns plain text. |
| `tests/admin/ip-nicknames-actions.test.ts` | `createIpNicknameAction` happy path + unique-violation paths (slug, square_category_id) + invalid Zod input. `updateIpNicknameAction` mirrors. |
| `tests/square/non-artist-categories.test.ts` | `getNonArtistCategories()` excludes Artist parent + every Artist sub-category. Hierarchical label builder produces `Anime > Naruto` for nested categories. |
| `tests/products/cache.test.ts` | Unit-level (mocked Postgres + mocked Square): `getProductById` cache hit/miss/expiry decision logic. `denormalize()` projects `itemOptions` + `optionValueIds` from a fixture SDK response. The real-DB version of these flows lives in the integration suite below. |
| `tests/categories/related.test.ts` | `getRelatedProducts`: artist priority > IP nickname priority. Excludes current item id. Caps at 6. Returns `{items: [], source: null}` when no match. |

### 13.2 Integration tests (vitest:integration, real Postgres)

Same pattern as Phase 4: `tests/helpers/db.ts` provides `testNamespace`
and `cleanupByPrefix` for collision-free concurrent runs.

| Test file | Coverage |
|---|---|
| `tests/integration/ip-nicknames.integration.test.ts` | All 7 query helpers. Unique-constraint behaviour on `slug` AND `square_category_id`. `is_public=false` excluded from `getPublicIpNicknames` but included in `getAllIpNicknames`. Timestamps set/updated correctly. |
| `tests/integration/product-cache-readthrough.integration.test.ts` | `getProductById` against real Postgres + mocked Square client. Cold cache → Square call → row written → second call reads from row. Stale row past TTL → re-fetches + overwrites. Square-not-found → returns null without polluting cache. `__forceRefresh(itemId)` drops the row. |

### 13.3 Manual smoke checklist (operator runs before tagging)

1. Sign in to `/admin/ip-nicknames`.
2. Browse the IP category picker — confirm hierarchical labels.
3. Create one nickname (e.g. `Anime > Naruto` → slug `ramen-shop`,
   nickname `Ramen Shop`, public).
4. Visit `/category/ramen-shop` — gradient cover + nickname + description
   + product grid (or empty state).
5. Visit `/product/<a-real-item-id>` (pick one from `/artist/<slug>`):
   - Mockup gallery: click a scene → background swaps.
   - Click a product image thumbnail → overlay swaps.
   - Variant picker (if applicable): change → price updates.
   - Description renders if present.
   - Artist meta line renders.
   - Add-to-Cart is disabled with tooltip.
   - Related products section renders or is correctly hidden.
6. View Source → confirm no Square category name (literal IP name)
   anywhere in public DOM.
7. Edit nickname → set `is_public=false` → `/category/ramen-shop` 404s.
8. Set it back → 200.

### 13.4 Pre-tag acceptance gate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

All must pass. Build output should list the new routes:
`/product/[id]`, `/category/[slug]`, `/admin/ip-nicknames`,
`/admin/ip-nicknames/new`, `/admin/ip-nicknames/[id]`.

Image-host probe (one-off, run before committing `next.config.mjs`
edit): `curl -sI` against live Square image URLs from both prod and
sandbox to verify the S3 hostnames in the allowlist.

Test counts expected to grow:
- Unit: `63 → ~120`
- Integration: `40 → ~60`

### 13.5 What is NOT tested in Phase 5

- No Playwright / browser-driven e2e.
- No visual regression / screenshot diffing.
- No load testing.
- No security penetration testing (admin auth gate already tested in
  Phase 4; not modified here).
- No upstream Square API contract testing (SDK shape mocked against
  fixtures; integration tests would catch breakage via real calls).

## 14. Plan structure (Phase 5 plan organization)

The brainstorm locked this as Decision 13. The plan doc will lay these
out as five sub-plans (A–E) that can be executed in the dependency
order shown.

| Plan | Scope | Depends on |
|------|-------|------------|
| **A** | Catalog read layer: `getProductById()` + read-through cache + `denormalize()`. `src/lib/products/cache.ts` + unit/integration tests. **Also extends `CachedProduct` / `CachedVariation` types in `src/lib/square/types.ts`** — these type additions ship in Plan A so Plan C (client components) can consume them. | — |
| **B** | `ip_nicknames` schema + Drizzle migration + `src/lib/db/queries/ip-nicknames.ts` + `/admin/ip-nicknames` CRUD admin UI. | — |
| **C** | Client components in isolation: `<MockupGallery />` + `<VariantPicker />` + `src/lib/mockup-scenes.ts` + committed scene background images. Tested with mocked product data. No PDP route work. | — |
| **D** | PDP `/product/[id]` page wires A + B + C + reuses `<ArtistMetaLine />`, `getItemsByCategoryId()`, new `getRelatedProducts()` resolver, `<PdpPurchasePanel />` client island, `sanitizeProductDescription`, `next.config.mjs` image allowlist. | A, B, C |
| **E** | Public `/category/[slug]` IP browse page. | A, B |

A, B, C can be worked in parallel. D needs all three. E needs A + B but
not C.

## 15. Out-of-scope items (future phases)

Reminder of what Phase 5 specifically does NOT include, all destined
for later phases:

- Phase 6 (likely): Cart drawer + Add-to-Cart wiring + localStorage cart
  state. The disabled CTA already in the DOM just needs its click
  handler.
- Phase 7+: Wishlist UI (Postgres + localStorage merge).
- Phase 7+: Reviews UI.
- Phase 7+: Recently-viewed strip (localStorage + server enrichment).
- Phase 7+: `/admin/settings` route group (scene editor, universal
  upsells, promo settings).
- Phase 7+: IP cover image uploads (column already in schema, just
  needs UI + sharp resize helper).
- Phase 7+: PDP upsells (universal-upsells admin row).
- Phase 7+: Square `catalog.version.updated` webhook handler (drops
  the 1-hour staleness window).
- Phase 7+: `pnpm square:sync` backfill (warms the cache pre-launch).
- Phase 7+: `/shop` listing page (and the middle breadcrumb segment).
- Phase 7+: Footer / nav link to `/category/[slug]`.

## End of spec.
