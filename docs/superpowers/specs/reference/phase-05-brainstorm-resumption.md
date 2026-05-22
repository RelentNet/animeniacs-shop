# Phase 5 brainstorming — resumption handoff

**Status:** Brainstorming in progress. **NOT** ready for implementation yet.

**Where we are:** Mid-way through the `superpowers:brainstorming` skill flow.
Twelve clarifying decisions captured, one organizational decision captured,
three of seven design sections presented and approved. Four sections remain
before the spec doc can be written.

**Date paused:** 2026-05-22
**Resuming agent should:** open a fresh master terminal, read this doc end
to end, then continue the brainstorming from Section 4 of 7.

This document is the entire portable state of the brainstorming session.
Treat it as authoritative — do not re-litigate decisions captured below
without an explicit user signal.

---

## Required reading order (resuming agent)

Same as the Phase 4 → Phase 5 handoff, plus this doc:

1. **This document, front to back.**
2. `docs/superpowers/specs/reference/phase-04-handoff.md` — the Phase 4
   handoff that bootstrapped the Phase 5 brainstorm. Hard constraints
   still in force; required reading order section there is also yours.
3. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` §5
   (Product Detail Page), §6 (Cart/Wishlist), §7 (Reviews), §8 (Recently
   Viewed). The PDP spec is in §5; §6/§7/§8 are explicitly DEFERRED out
   of Phase 5 scope (see Decision 1 below).
4. `docs/superpowers/plans/2026-05-14-phase-03-square-catalog.md` — has
   unfinished Tasks 7-12 that overlap with Phase 5 catalog-read work.
   Phase 5 cherry-picks the read-through cache idea (Decision 2);
   webhooks and sync script are explicitly DEFERRED.
5. Existing reference code Phase 5 will reuse or extend (no changes
   to these — just read for context):
   - `src/lib/square/items.ts` — `getItemsByCategoryId()`, the existing
     60s-cached helper. Reused unchanged.
   - `src/lib/square/types.ts` — `CachedProduct`, `CachedVariation`,
     `CachedMoney`. Will likely need to extend `CachedProduct` for the
     PDP (ITEM_OPTION list, descriptionHtml). Discuss in Section 5.
   - `src/lib/square/categories.ts` — cached helpers including
     `getArtistSubCategories`.
   - `src/components/product/ArtistMetaLine.tsx` — "Designed by
     [Artist]" component. Drop-in for the PDP, no changes needed.
   - `src/app/(admin)/admin/artists/*` — the admin pattern Phase 5's
     `/admin/ip-nicknames` will mirror exactly.
   - `src/lib/db/schema.ts` — append `ip_nicknames` table per Section 2.
   - `docs/superpowers/specs/reference/mockup-gallery-original.html` —
     the 4 scenes Phase 5 hardcodes into a TS const.

---

## Baseline verification (run before resuming)

```sh
cd ~/code/animeniacs-shop
git describe --tags --abbrev=0   # → phase-4-artist-system
git rev-parse --short HEAD       # → 9e10cfa or descendant (this doc + commits added since)
pnpm lint && pnpm typecheck
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT count(*) FROM artists WHERE status='active';"
# Should print: 15
```

If any of those fail, stop. Same contract as Phase 4 → Phase 5.

---

## Decisions captured (13 total — DO NOT re-litigate)

### Scope decisions (one big question each)

**Decision 1 — Phase 5 scope:** PDP-shell-first.
Ships: product fetch + cache layer + full PDP layout per design §5.
**Defers:** the cart (§6), wishlist (§6.2), reviews (§7), recently-viewed (§8).
Those become their own phases (6, 7, 8 or similar). The PDP renders a
disabled Add-to-Cart button (see Decision 5), a hidden wishlist heart,
no reviews UI, no recently-viewed strip.

**Decision 2 — Catalog infrastructure:** Read-through cache only.
PDP calls a new `getProductById(id)` that hits `product_cache` first,
falls back to live Square on miss, writes back with a 1-hour TTL.
**Defers:** the webhook handler (Phase 3 Tasks 9-11), `pnpm square:sync`
backfill (Phase 3 Task 8). Cache fills organically. Acceptable staleness
in v1: up to 1 hour for price/availability changes.

**Decision 3 — Mockup gallery scene library:** Hardcoded TS const.
Ship the 4 original scenes from `docs/superpowers/specs/reference/
mockup-gallery-original.html` baked into a `src/lib/mockup-scenes.ts`
const. **Defers:** `/admin/settings` route group + scene editor admin
UI to a later phase.

**Decision 4 — Variant picker UX:** Auto-detect ITEM_OPTION axes.
PDP introspects the item's options at fetch time. Renders one `<select>`
per ITEM_OPTION (Media, Size, anything else Square has). Generalizable.
As the customer picks, resolve to the matching ITEM_VARIATION and update
price + add-to-cart binding.

**Decision 5 — Add-to-Cart button in Phase 5:** Disabled with tooltip.
Render the button visibly (layout final) but `disabled` with tooltip /
inline note: 'Shopping cart launching soon — follow us on Instagram for
the launch.' No localStorage writes, no state changes. Phase 6 just
wires the click handler.

**Decision 6 — Production time + PDP upsells:** Hardcoded default text
for the production-time badge; PDP upsell section omitted entirely
from Phase 5. Production-time text lives in a TS const, not in
`site_settings`. **Defers:** `/admin/settings` editor + universal-
upsells admin row. The PDP just doesn't show an upsell section.

**Decision 7 — PDP breadcrumbs:** Minimal `Home / {Product Name}`.
Two segments only. **Defers:** the middle segment until /shop exists
in a later phase. Sidesteps the IP-never-public constraint cleanly.

**Decision 8 — IP nicknames table + admin:** NEW. Add a Postgres table
`ip_nicknames` (square_category_id PK-unique, slug PK-unique, nickname,
description, cover_image_url, is_public, timestamps). New admin route
`/admin/ip-nicknames` (CRUD, gated by existing Logto admin role,
mirrors the `/admin/artists` pattern exactly). Operator browses Square
IP categories and assigns nicknames + slugs to each one they want
public. Categories without a row stay private (Phase 4's IP-never-
public constraint continues to apply to unmapped categories).

**Decision 9 — IP-related public surface in Phase 5:** Ship both.
**Capability A:** PDP related-products uses same-artist (priority 1)
then same-IP-via-nickname (priority 2). Label is "More from [Artist]"
or "More from [Nickname]" — never the literal IP name.
**Capability B:** Public `/category/[slug]` IP browse page — analog
of `/artist/[slug]` for IPs. Lists all items in that IP category,
paginated.

**Decision 10 — Product image gallery:** Mockup gallery + thumbnail strip.
Mockup-gallery scene viewer is the primary image surface. A second
thumbnail strip shows all the product's raw images. Clicking a raw
thumbnail swaps that image into the active mockup scene as the overlay.
One combined component.

**Decision 11 — Description sanitization:** Strict dompurify whitelist.
Run `descriptionHtml` through `isomorphic-dompurify` (already a project
dep from Phase 1). Whitelist: `p`, `br`, `ul`, `ol`, `li`, `strong`,
`em`, `a` (with href + enforced `rel='noopener noreferrer'` +
`target='_blank'`). Strip everything else. No `<img>` allowed.

**Decision 12 — Test coverage depth:** Match Phase 4 discipline.
Unit tests for components + helpers (vitest + RTL, mocked deps).
Integration tests for the new DB query helpers (vitest:integration
config, real Postgres). Manual smoke for client-side interactivity
(mockup gallery scene swap, variant picker price update). No Playwright
addition in Phase 5.

### Organizational decision

**Decision 13 — Plan structure:** Five plans, bottom-up.

| Plan | Scope | Depends on |
|---|---|---|
| **A** | Catalog read layer: `getProductById()` read-through cache + Square fetch + `denormalize()` helper. Includes `src/lib/products/cache.ts` + unit/integration tests. | — |
| **B** | `ip_nicknames` schema + Drizzle migration + `src/lib/db/queries/ip-nicknames.ts` query helpers + `/admin/ip-nicknames` CRUD admin UI. | — |
| **C** | Client components in isolation: `<MockupGallery />` + `<VariantPicker />`. Tested with mocked product data. No PDP route work. | — |
| **D** | PDP `/product/[id]` page wires A + B + C + reuses `<ArtistMetaLine />`, `getItemsByCategoryId()`, and new `getRelatedProducts()` resolver. | A, B, C |
| **E** | Public `/category/[slug]` IP browse page. | A, B |

A and B can run in parallel. C is independent. D needs all three (A + B
+ C). E needs A + B but not C.

---

## Design sections — APPROVED (do not re-present)

### Section 1 of 7: Scope & deliverables — APPROVED

(Full content in this conversation's earlier turn; summary:)

- Ships: `/product/[id]`, `/category/[slug]`, `/admin/ip-nicknames`,
  `ip_nicknames` table, `getProductById()`, `<MockupGallery />`,
  `<VariantPicker />`.
- Does NOT ship: cart, wishlist, reviews, recently-viewed, `/shop`,
  `/admin/settings`, PDP upsells, Square webhook handler, `pnpm
  square:sync`.
- Acceptance criteria (5):
  1. `/product/<real-square-item-id>` renders PDP end-to-end.
  2. `/category/<real-ip-nickname-slug>` renders IP browse page.
  3. Operator can sign in to `/admin/ip-nicknames`, browse Square's
     IP categories, assign nicknames + slugs, see IP go live on
     `/category/[slug]`.
  4. `pnpm test`, `pnpm test:integration`, `pnpm typecheck`,
     `pnpm lint`, `pnpm build` all green.
  5. Tag `phase-5-product-detail-page`.

### Section 2 of 7: Data model — APPROVED

(Full content in this conversation's earlier turn; load-bearing details:)

- New `ip_nicknames` Drizzle table with the exact column list specified
  inline in Section 2 of the conversation. Two indexes: `slug`,
  `square_category_id`. Migration to be named `0010_<random>_ip_nicknames.sql`.
- `cover_image_url` is in the schema; the upload UI is a sub-decision
  flagged for Section 4 (admin UI). Minimal viable admin: text input
  for an external URL. Full `sharp`-resize upload is optional, can be
  cut.
- Reuses existing `product_cache` table from Phase 2 (already in
  schema, never used). Phase 5 wires the read path: `data` jsonb holds
  the CachedProduct; TTL 1 hour against `updated_at`.
- No FK constraint between `ip_nicknames.square_category_id` and any
  local table. Square is the source of truth; the local row points
  outward by string.
- TTL of 1 hour is a guess. Constant lives in one place
  (`src/lib/products/cache.ts`) for easy tuning post-launch.

### Section 3 of 7: Server-side read modules — APPROVED

(Full content in this conversation's earlier turn; load-bearing details:)

Four new server files:

| File | Purpose | Size |
|---|---|---|
| `src/lib/products/cache.ts` | `getProductById` + read-through cache + private `readFresh`, `refreshFromSquare`, `denormalize`. Test-only `__forceRefresh(itemId)` export. | ~120 lines |
| `src/lib/db/queries/ip-nicknames.ts` | 7 query helpers + Zod input schema. Mirrors `src/lib/db/queries/artists.ts`. Exports: `getAllIpNicknames`, `getPublicIpNicknames`, `getIpNicknameBySlug`, `getIpNicknameByCategoryId`, `getIpNicknameById`, `createIpNickname`, `updateIpNickname`. | ~150 lines |
| `src/lib/categories/related.ts` | `getRelatedProducts(currentItemId, categoryIds): RelatedResult`. Two-tier priority (artist → IP nickname). Returns `{items: ArtistProduct[], source: {kind, slug, displayName/nickname} \| null}`. | ~50 lines |
| `src/lib/categories/index.ts` | `getProductsForIpNickname(nickname): ArtistProduct[]` thin wrapper around `getItemsByCategoryId`. | ~10 lines |

No changes to: `src/lib/square/items.ts`, `src/lib/square/client.ts`,
`src/lib/square/categories.ts`, `src/lib/db/queries/artists.ts`,
`src/lib/db/schema.ts` (other than appending the `ipNicknames` table).

Sub-decisions captured:

- `getProductById` is single-item only. Bulk-load (for product grids)
  uses the existing `getItemsByCategoryId()` which does its own batched
  fetch.
- Square free tier rate limit is plenty; no backoff in Phase 5.
- Deleted-item handling: leave the stale cache row, let next miss
  replace it. Acceptable behaviour for v1.

---

## Design sections — NOT YET PRESENTED (resume here)

Four sections remain. The resuming agent should present each one in turn,
asking for approval after each before proceeding to the next. Stop after
each section, wait for user signal.

### Section 4 of 7: Admin UI — `/admin/ip-nicknames`

Anticipated content:

- Three-route group following `/admin/artists` pattern exactly:
  - `src/app/(admin)/admin/ip-nicknames/page.tsx` — list view
  - `src/app/(admin)/admin/ip-nicknames/new/page.tsx` + `actions.ts` —
    create
  - `src/app/(admin)/admin/ip-nicknames/[id]/page.tsx` + `actions.ts` —
    edit
- A `SquareIpCategoryPicker` component analogous to
  `SquareCategoryPicker` from /admin/artists, but filters to NON-artist
  category leaves only (the operator picks an IP-style category and
  gives it a nickname).
- The cover image question: Minimal text URL input vs full `sharp`
  upload. **DECIDE IN SECTION 4 PRESENTATION.** Lean: text URL input
  for v1 (matches the `description` field upload pattern that doesn't
  exist), full upload is a nice-to-have that can be cut.
- Auth gating: reuses existing `(admin)/layout.tsx`. No new auth code.

### Section 5 of 7: PDP client components — `<MockupGallery />` + `<VariantPicker />`

Anticipated content:

- `<MockupGallery>` props: `{ scenes: MockupScene[], productImages:
  string[] }`. Internal state: active scene index, active product
  image index. Click thumbnail strip → swap active scene OR swap
  product overlay (Decision 10 says one combined component handles
  both contexts).
- `<VariantPicker>` props: `{ variations: CachedVariation[],
  itemOptions: ItemOption[], onChange: (variation) => void }`.
  Auto-renders one `<select>` per item option. Resolves to a
  specific variation via cross-product of selected option values.
- `CachedProduct` type likely needs extending to carry `itemOptions` +
  the option-value mapping for each variation. **DECIDE IN SECTION 5
  PRESENTATION.** Could push the SDK shape through unchanged and have
  the picker introspect; could projection at `denormalize()` time.
  Lean: projection at denormalize time (one shape across the codebase).

### Section 6 of 7: PDP route + `/category/[slug]` route — page-level integration

Anticipated content:

- `src/app/product/[id]/page.tsx` replaces the current 404 stub. Full
  layout per design §5 minus the deferred items.
- `src/app/category/[slug]/page.tsx` is new. Renders the IP browse
  page using the new `getIpNicknameBySlug` + `getItemsByCategoryId`.
- Both routes are server components; client interactivity comes from
  `<MockupGallery />` and `<VariantPicker />` only.
- Decision needed: image-host CSP / next.config.ts `images.remotePatterns`.
  Square serves images from `items-images-production.s3.us-west-2.amazonaws.com`
  (verified in the production probe). Phase 5 needs to allowlist that
  domain. **DECIDE IN SECTION 6 PRESENTATION.**

### Section 7 of 7: Testing strategy + acceptance gates

Anticipated content:

- Unit tests for: `<MockupGallery>` (mocked product), `<VariantPicker>`
  (mocked variations), `<RelatedProducts>` carousel UI, the PDP page
  shell (mocked `getProductById`).
- Integration tests for: `ip_nicknames` query helpers (real Postgres,
  same `testNamespace` + `cleanupByPrefix` pattern as Phase 4),
  `getProductById` read-through cache (real Postgres + mocked
  Square client).
- Manual smoke checklist for the user to run before tagging:
  - Sign in to `/admin/ip-nicknames`, create one nickname, save.
  - Visit `/category/[slug]`, see the IP page.
  - Visit `/product/<real-item-id>`, see PDP.
  - Switch variant in picker, see price update.
  - Click thumbnail in gallery, see scene swap.
- Pre-tag gate: lint + typecheck + test + test:integration + build
  all green.

---

## Hard constraints (still in force from Phase 4)

Same list as `phase-04-handoff.md` "Hard constraints (still in force)".
Restated here for the resuming agent so they don't have to re-read:

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/`
   must return zero hits.
2. **No `artist` Square custom attribute definition.** Square
   `categories[]` carries this signal.
3. **No new auth vendors.** Reuse existing Logto + `(admin)` route group
   pattern.
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 5 adds exactly ONE new table: `ip_nicknames`. That's it.
6. **Sandbox-first for any production write.** Phase 5 doesn't write to
   Square at all, so this is mostly a no-op for Phase 5. But if any
   step pivots to "create a Square category programmatically" or
   similar, sandbox-first applies.
7. **IP categories never public via their literal name.** This is THE
   constraint that drove Decision 8 (nicknames table). The Square
   `Anime > Naruto` category is never exposed as text on the public
   site. Its nickname row is. `<ArtistMetaLine />` already has a
   regression test for this; preserve the discipline in PDP layout
   work too.

---

## Hand-off integrity checklist

When the resuming agent is ready to start, they should:

1. ✅ Read this entire document.
2. ✅ Read the doc list in "Required reading order" above.
3. ✅ Run the "Baseline verification" commands. Confirm `phase-4-artist-system`
     tag, clean lint + typecheck, 15 active artists.
4. ✅ Re-load the `superpowers:brainstorming` skill (this session has it
     loaded; a new session needs to invoke `Skill` for it).
5. ✅ Present Section 4 of 7 (Admin UI). Use multiple-choice questions
     for any sub-decisions (e.g., cover image upload approach).
6. After Sections 4-7 all approved, write the spec doc to
   `docs/superpowers/specs/2026-05-XX-phase-05-product-detail-page-design.md`.
7. Spec self-review per the skill checklist.
8. Ask user to review the written spec.
9. After spec approval, invoke `superpowers:writing-plans` to produce
   `docs/superpowers/plans/2026-05-XX-phase-05-product-detail-page.md`.
10. Write the Phase 5 implementation handoff prompt (for a separate
    execution terminal). Style: match the Phase 4 execution-handoff
    prompt that lived in chat at the end of the Phase 4 planning
    session.
11. **Stop. No implementation.** A separate execution terminal will
    pick up the plan.

---

## What the resuming agent should NOT do

- Do not re-ask the 13 captured decisions.
- Do not re-present Sections 1-3 of the design.
- Do not start implementation (no code, no migrations, no commits other
  than the spec doc + the plan doc + this handoff doc tweaks if needed).
- Do not skip the multiple-choice format for clarifying questions.
- Do not invoke any skill other than `superpowers:brainstorming` (now)
  and `superpowers:writing-plans` (after spec is approved).
- Do not exit brainstorming until all 7 design sections are approved
  and the spec doc is written + user-reviewed.

---

## Why the handoff happened here

This session's context grew large enough that it became inefficient to
finish Sections 4-7 in the same conversation. The user explicitly
called it: "our context is getting way to big and we need pass this off
to a new master terminal."

Phase 5's planning is genuinely big — it ships a PDP, an IP browse
page, a new admin area, three server modules, two client components,
and a new DB table. Decomposing across two brainstorming sessions
(this one + a fresh resumption) keeps each session focused and lets
the spec doc emerge fully digested rather than rushed.

The execution itself will then be a third terminal, dispatched via
`superpowers:executing-plans` against the not-yet-written plan doc.
