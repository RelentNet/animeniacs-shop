# Artist system + GoAffPro retirement — hand-off to master agent

**Status:** Design closed. Re-planning needed. Phase 3/4/5/7/13 of the
original design spec all change. This brief is the entry point for the
next agent session to replan those phases.

**Date:** 2026-05-15

**Required reading before planning** (in this order):

1. `docs/superpowers/specs/reference/goaffpro-api-probes.md` — the
   decision narrative. §10 (phase status) + §11 (new structure) are
   the load-bearing sections; sections 1–9 are probe data and
   historical context.
2. `docs/superpowers/specs/reference/square-production-survey.md` —
   what's currently in Square production (categories, item options,
   custom attributes, the "Artist" category being half-built).
3. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — the
   original design spec. **§3, §4, §5 (artist meta line), §7 (Phase 7
   admin), §13 are now stale and must be revised.** Other sections
   stand.
4. `scripts/goaffpro/probe.ts` and `scripts/square-account-probe/probe.ts`
   — the probe code, useful as a reference for the read-only-script
   pattern (env loading, fetch helpers, snapshot writing, lint
   overrides via `scripts/**` biome override).

## TL;DR of the new direction

- **Square Categories** (with multiple-categories-per-item) are the
  single source of truth for which artist made a product and which
  IP/franchise it represents.
- **One new Postgres table — `artists`** — stores artist profile
  enrichment (avatar, bio, socials, commission rate, payment info).
  Joined to Square via `squareCategoryId`.
- **One small admin area — `/admin/artists`** — Logto `admin`-role
  gated. CRUD on the `artists` table. No commission engine, no orders
  view, no item-to-artist UI.
- **GoAffPro retired entirely.** No runtime calls. No referral cookie.
  No coupon resolution. The integration goes away. Subscription gets
  cancelled after launch.
- **Commission reporting is a manual monthly Square-dashboard task.**
  No commission engine in code.
- **Plausible** stays as general analytics on whatever tier you're
  already paying for. No upgrade required for this design.
- **Inbound external-affiliate tracking** is *out of v1 scope*. When
  a partner relationship eventually happens, it's "one Square Discount
  per partner, monthly Sales-by-Discount report" — still no code.

## What the master agent needs to produce

A revised plan covering at minimum these workstreams, in this order:

### Plan A — Phase 2/3 schema patch + artist system foundation

**Goal:** Add the `artists` table to the schema, run the Drizzle
migration, build the query helpers, seed the production data.

**Scope of work:**

1. **Drizzle schema addition** to `src/lib/db/schema.ts`:

   ```ts
   export const artists = pgTable('artists', {
     id: uuid('id').primaryKey().defaultRandom(),
     slug: text('slug').notNull().unique(),
     displayName: text('display_name').notNull(),
     squareCategoryId: text('square_category_id').notNull(),
     status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
     avatarUrl: text('avatar_url'),
     bio: text('bio'),
     instagram: text('instagram'),
     twitter: text('twitter'),
     facebook: text('facebook'),
     youtube: text('youtube'),
     tiktok: text('tiktok'),
     website: text('website'),
     commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'),
     paymentMethod: text('payment_method'),
     paymentEmail: text('payment_email'),
     notes: text('notes'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
   })
   ```

   Indexes: unique on `slug` (already declared), additional index on
   `squareCategoryId` for the by-category lookup.

2. **Drizzle migration:** `pnpm db:generate` then `pnpm db:migrate`.

3. **Query helpers** in `src/lib/db/queries/artists.ts`:
   - `getActiveArtists()` — list view
   - `getArtistBySlug(slug)` — `/artist/[slug]` page lookup
   - `getArtistByCategoryId(categoryId)` — PDP join
   - `createArtist(input)`, `updateArtist(id, input)`, `setArtistStatus(id, status)`
   - All input types Zod-validated.

4. **Catalog category helper:** a server-side function that fetches
   all `CatalogCategory` objects from Square (cached for ~5 min) and
   returns them as `{ id, name, parentCategoryId }[]`. Used by the
   admin form's category-picker dropdown and by the PDP for resolving
   IP/taxonomy category names.

5. **TDD discipline:** unit tests for each query helper using the same
   integration-test infrastructure already established for `wishlists`
   and `reviews` (`vitest.integration.config.ts`).

6. **Production seed data:** a one-time data-entry pass populating
   the `artists` table with the 23 currently-approved-in-GoAffPro
   artists (their data is captured in
   `goaffpro-api-probes.md §5`). The squareCategoryId for each must
   first be created in the Square dashboard (see Plan C). Bio and
   avatar data can come from GoAffPro's snapshot (manually) or be
   left blank for the user to fill in via the admin UI later.

**Out of scope for Plan A:** the admin UI itself, the public website
integration, any Square write operations.

### Plan B — Admin area: `/admin/artists`

**Goal:** Build the CRUD admin pages for the `artists` table.

**Scope of work:**

1. **Route group structure** under `src/app/(admin)/admin/artists/`:
   - `page.tsx` — list view (status, slug, displayName, edit link)
   - `new/page.tsx` + corresponding `actions.ts` server action — create
   - `[id]/page.tsx` + corresponding `actions.ts` — edit + update
   - `_components/ArtistForm.tsx` — shared form between new and edit
   - `_components/SquareCategoryPicker.tsx` — dropdown of Square
     CatalogCategory objects, filtered to children of "Artist" parent
     category, ordered by name

2. **Auth gating:** reuse the Logto pattern from design spec §10/§11.
   The `(admin)` route group's `layout.tsx` calls
   `getLogtoContext(logtoConfig)` and redirects to `/login` if not
   `isAuthenticated` or if the user lacks the `admin` role. **No new
   auth code required** — wire into the existing pattern.

3. **Image upload:** for v1, write uploads to `/public/images/artists/`
   at admin save time (works if deploys are git-driven). If/when the
   production deploy moves to Vercel, swap to Vercel Blob — interface
   stays the same. Decision is non-blocking; pick whichever is simpler
   for the current deploy target.

4. **Forms:** standard `<form>` + server actions, not a client-side
   form library. Inputs:
   - slug (text, URL-safe, validated client + server)
   - displayName (text, required)
   - squareCategoryId (dropdown, required)
   - status (radio: active / inactive)
   - avatarUrl (file upload, optional, resizes to ~500x500 server-side)
   - bio (textarea, optional, ~500 char soft limit)
   - instagram / twitter / facebook / youtube / tiktok / website (text URLs, optional)
   - commissionRate (numeric, 0.0–1.0, default 0.20)
   - paymentMethod (select: paypal / venmo / check / zelle / other)
   - paymentEmail (text, optional)
   - notes (textarea, optional, admin-only)

5. **No commission UI. No orders UI. No item-assignment UI. No
   reporting UI.** Square dashboard does all of that.

6. **TDD discipline:** vitest tests for the create/update server
   actions, including validation failure paths.

**Out of scope for Plan B:** public website integration, anything
GoAffPro-related, anything commission-related.

### Plan C — Square dashboard work (no code, but tracked as a plan)

**Goal:** Get the Square catalog into a state where the new design
can read it correctly.

**Scope of work** (user does this in the Square dashboard; the master
agent should produce a *checklist*, not code, for this):

1. **Standardize the Artist category naming convention.** Current
   production has `Merc Da Artist` as the only child of `Artist`.
   Decide whether the slug-style convention is `Bxnny.Arts` (matches
   GoAffPro display name) or `Bxnny` (shorter). Document the decision
   in the plan.

2. **Create the missing artist sub-categories** under `Artist > …` —
   one per active artist (~22 new sub-categories, matching the 23
   approved-in-GoAffPro records minus `Merc` which already exists).
   Each sub-category gets a stable `id` that gets recorded in the
   `artists` table.

3. **Assign existing items to artist sub-categories.** For each real
   item in the production catalog (not the 30 graveyard SKUs), add
   the appropriate `Artist > X` to its `categories[]` array. Items
   typically also stay in their IP category (`Anime > Naruto`,
   `Pokemon`, etc.) — the multiple-categories design supports this.

4. **Archive the 30 graveyard SKUs.** Once real items carry the
   artist category, the placeholder graveyard items (`Bxnny.Arts
   print`, `Saru Acrylic`, etc.) are redundant. Archive via the
   Square dashboard or via a small one-off operation script using
   the same `scripts/square-cleanup/` pattern.

5. **Optional Square dashboard customisation:** rename the
   `portrait` (lowercase) category if it's still around — the
   production survey flagged it as a likely accident.

**This work is independent of Plan A and Plan B** but blocks Plan
D's public website integration. It should run in parallel.

### Plan D — Public website integration

**Goal:** PDP, artist gallery, and artist profile pages read from
the new sources.

**Scope of work:**

1. **PDP (`/product/[id]`):**
   - Read `categories[]` from the Square item.
   - For each category id, look up in `artists` table by
     `squareCategoryId`.
   - If matched: render artist card in the meta line ("Designed by
     [Artist]" → `/artist/[slug]`), and if matched in the wider PDP
     layout (current §5.1 of the design spec already specifies the
     artist meta line), the avatar + name + Instagram-icon block.
   - If not matched: that category is an IP/taxonomy category;
     render as breadcrumb / "From [Category Name]" pill.

2. **`/artist` (gallery):**
   - Replace the original spec's "list all `label=artist` GoAffPro
     affiliates" with: `SELECT * FROM artists WHERE status =
     'active' ORDER BY display_name`.
   - Render grid of avatar + display name → link to `/artist/[slug]`.

3. **`/artist/[slug]` (profile):**
   - `SELECT * FROM artists WHERE slug = $1` for the header.
   - Square `searchCatalogObjects` with `set_query: {
     attribute_name: 'categories', attribute_values:
     [artist.squareCategoryId] }` for the product grid.
   - Sort/paginate same as `/shop`.
   - Empty-state message stays the same ("doesn't have any drops
     yet — follow them on …").

4. **Update propagation:** when an artist record is updated via
   admin (CRUD on the local DB), call Next.js's
   `revalidatePath('/artist')` and `revalidatePath('/artist/[slug]',
   'page')` from the server action. When a Square category is
   updated, accept eventual consistency (the next ISR revalidation
   picks it up). **No GoAffPro webhook — no GoAffPro at all.**

5. **TDD discipline:** Vitest tests for the artist-by-category
   lookup and the PDP category-array-walking logic. Integration
   test for `/artist/[slug]` against a seeded `artists` table +
   mocked Square category response.

**Out of scope for Plan D:** any commission tracking, any inbound
affiliate UI, any GoAffPro fallback.

### Plan E — Cleanup & launch tail

**Goal:** Retire GoAffPro after the new system is live and working.

**Scope of work:**

1. **Smoke-test the new system in sandbox.** Mirror production to
   sandbox (existing `pnpm sq:mirror` script), run through artist
   admin CRUD, run through PDP + `/artist/[slug]` rendering, verify
   commission report can be reproduced from Square dashboard.

2. **Production migration:** create the artist sub-categories in
   Square production, seed the `artists` table, deploy the website,
   verify a real product page renders the right artist card.

3. **Cancel the GoAffPro subscription** (user does this in the
   GoAffPro dashboard). Remove `GOAFFPRO_ADMIN_API_KEY` and
   `GOAFFPRO_PUBLIC_TOKEN` from `.env.local` and `.env.example`.

4. **Remove (or mark as deprecated)** in the design spec:
   - §3 references to `artist`, `ip`, `product_type`, `sibling_group`
     custom attributes
   - §4 references to GoAffPro as the artist data source
   - §13 (entire GoAffPro Affiliate Tracking section)
   - any environment variable, route, or dependency that was
     GoAffPro-only
   - `scripts/goaffpro/probe.ts` stays in-tree as a historical
     reference (same pattern as `scripts/square-cleanup/probe.ts`)

5. **Document the manual monthly commission workflow** in
   `docs/operations/commission-payouts.md` (new file): how to run
   the Square dashboard Sales-by-Category report, how to multiply
   by the rate from the `artists` table, how to record payouts
   (probably just a "Mark as Paid" note in the artist's `notes`
   field).

**Out of scope for Plan E:** anything that requires building an
automated commission engine. That's a future decision if/when manual
becomes painful.

## Constraints the master agent must respect

1. **No GoAffPro at runtime.** Anywhere. Ever. The probe stays in-tree
   as a one-shot artifact, not a dependency.
2. **No `artist` Square custom attribute definition.** Square
   categories carry this now.
3. **No new vendors.** Don't propose Tapfiliate, Rewardful, Refersion,
   AffiliateWP, or any other paid SaaS to replace GoAffPro. The
   answer is "no replacement; manual monthly reporting via Square
   dashboard."
4. **No Plausible Business tier upgrade.** Plausible stays at its
   current tier; the design does not depend on revenue tracking,
   custom event props, or the Stats API.
5. **One Postgres table only.** Do not propose `affiliates`,
   `commission_reports`, `commission_line_items`, `affiliate_clicks`,
   `affiliate_attributions`, or similar tables. If volume ever
   demands more, that's a future workstream; not v1.
6. **Logto auth is free.** Use the existing `admin` role and
   `getLogtoContext()` pattern from §10/§11 of the design spec. Do
   not build separate password auth.
7. **No commission code.** No SearchOrders job, no monthly cron, no
   webhook attribution. Manual workflow via Square dashboard only.
8. **Sandbox-first.** Production catalog operations only after
   sandbox-mirror rehearsal, same discipline as the cleanup
   workstream (`scripts/square-cleanup/`).
9. **Existing patterns:** new scripts use the `scripts/**` biome
   override; new admin routes mirror the existing
   `src/app/(admin)/admin/*` style (per design spec §11); Drizzle
   migrations use the existing `db:generate` / `db:migrate` flow.

## Verified facts the master agent can rely on (don't re-probe)

These have been verified live against production this session; the
new plan does not need to re-verify them:

- ✅ Square production account is `ACTIVE` (merchant ID
  `ML9YFWJCKY96D`, business name `Animeniacs.Shop`).
- ✅ Both production locations (`L182TWM8YVZSR` Animeniacs Mobile,
  `L9G64BGJWXNF4` Online Sales) are ACTIVE with
  `CREDIT_CARD_PROCESSING`.
- ✅ All required APIs return 200 on production: `/v2/merchants`,
  `/v2/locations`, `/v2/catalog` (list ITEM / CATEGORY /
  CUSTOM_ATTRIBUTE_DEFINITION / DISCOUNT), `/v2/orders/search`,
  `/v2/orders/custom-attribute-definitions`,
  `/v2/webhooks/subscriptions`, `/v2/team-members/search`.
- ✅ Square supports multiple categories per item via
  `item_data.categories[]` (array of `{ id, ordinal }`). Documented;
  search by category via `set_query` works.
- ✅ Square free tier is sufficient for this design. **No Square
  Plus / Premium / Pro upgrade is required.** (Upgrades remain a
  separate business-economics decision about processing fees,
  untied to this workstream.)
- ✅ 5 production custom attribute definitions already exist
  (`is_alcoholic`, `ecom_target_classic_site_id`,
  `ecom_gifting_enabled`, `Media`, `Size`). None of them are
  `artist`. The plan does **not** add any new ones.
- ✅ GoAffPro has 195 affiliate records, 23 approved (all
  effectively artists today, but the data model has no
  artist-vs-affiliate field — verified by exhaustive field probe).
- ✅ The 4 known graveyard-SKU artists (Bxnny / Saru / Merc /
  Addham) are all approved in GoAffPro; their display names and
  GoAffPro IDs are captured in `goaffpro-api-probes.md §5`.

## Order of work (recommended)

1. **Plan A** (schema + `artists` table + query helpers) — can start
   immediately; no Square dashboard prerequisite.
2. **Plan C** (Square dashboard sub-category creation + item
   re-categorization + graveyard archival) — runs in parallel with
   Plan A; produces the `squareCategoryId` values the artists table
   needs.
3. **Plan B** (admin UI) — depends on Plan A; can start once schema
   is live.
4. **Plan D** (public website integration) — depends on Plan A + at
   least one row in `artists` table for testing.
5. **Plan E** (GoAffPro retirement) — only after Plans A–D are live
   and verified in production.

## Output the master agent should produce

A single coherent revised plan document covering Plans A–E, with:

- Acceptance criteria for each plan
- TDD test plan for the code changes (Plans A, B, D)
- Sandbox-rehearsal step in front of any production change (Plan E)
- Updated phase mapping that lines up with the existing design-spec
  phase numbering
- An explicit "do not implement" callout for anything in the
  original spec that this rewrites (the master agent should also
  add a banner to the affected sections of the design spec
  pointing readers to this hand-off)

## Stop point for this session

This hand-off is the deliverable. The current session:
- ✅ Wrote and ran two read-only probes (GoAffPro + Square
  production account)
- ✅ Surfaced the design-changing facts (no GoAffPro artist
  discriminator, no artist coupons, multiple Square categories
  per item)
- ✅ Documented the architectural pivot in
  `goaffpro-api-probes.md §10–§11`
- ✅ Produced this brief for the master agent

**The current session does NOT:**

- ❌ Write the revised plan document (that's the master agent's job)
- ❌ Touch Square production data
- ❌ Touch GoAffPro production data
- ❌ Implement any of Plans A–E
- ❌ Modify the original design spec (the master agent or a follow-up
  pass should add deprecation banners; this session leaves it alone)

The next agent session should treat this brief plus the probe memo as
the source of truth and produce a `docs/superpowers/plans/<date>-phase-
04-artist-system.md` (or similar — naming follows existing
`2026-05-14-phase-XX` convention) as its primary output.
