# GoAffPro API probes — captured response shapes

**Date:** 2026-05-15
**Probe script:** `scripts/goaffpro/probe.ts` (run via `pnpm goaffpro:probe`)
**Snapshot:** `/tmp/goaffpro-snapshot-<timestamp>.json` (not committed; contains
PII)
**Account:** Animeniacs production (GoAffPro store id 7139812)

This is the read-only API survey that has to happen before we design the
artist-linkage layer. Ground truth for the memo at the bottom.

## 1. Authentication

Confirmed live against `https://api.goaffpro.com/v1`:

| Surface | Header | Result |
|---|---|---|
| Admin endpoints | `x-goaffpro-access-token: <admin token>` | ✅ 200 |
| Admin endpoints | `Authorization: Bearer <admin token>` | ❌ 403 (rejected with the "Kindly generate and use the token" message) |
| Public endpoints | `x-goaffpro-public-token: <public token>` | ⚠️ accepted, but every guessed path 404'd (see §6) — public surface is undocumented and not needed for the artist-linkage decision |

Both tokens are in `.env.local`:

```
GOAFFPRO_ADMIN_API_KEY     # 64-char hex, admin
GOAFFPRO_PUBLIC_TOKEN      # 64-char hex, public/storefront
```

Gitignored. Never commit. Never echo to logs.

## 2. The `fields=` quirk (this one almost cost a session)

**Important.** GoAffPro's `/admin/affiliates` list endpoint returns one
empty object `{}` per row when called without a `fields=` query
parameter:

```sh
GET /v1/admin/affiliates?limit=2
→ { "affiliates": [ {}, {} ], "limit": 2, "total_results": 195 }
```

Add `fields=id,name,email,...` and the rows populate:

```sh
GET /v1/admin/affiliates?limit=2&fields=id,name,email,status,ref_code
→ { "affiliates": [
      { "id": 19589435, "name": "Miguel", "email": "...",
        "status": "blocked", "ref_code": "ilecqoyc" }, ...
   ], "limit": 2, "total_results": 195 }
```

The earlier session saw the empty objects and assumed truncation. It
wasn't truncation — the API genuinely returns nothing without
`fields=`. The probe script over-requests every plausible field name
(see `AFFILIATE_FIELDS` in `scripts/goaffpro/probe.ts`); GoAffPro
silently drops fields that don't exist.

The only fields that came back populated, across the full 195-affiliate
snapshot, are listed in §4. Anything not listed there either doesn't
exist on the production schema or has a different name.

## 3. Endpoints exercised

| Endpoint | Method | Result | Notes |
|---|---|---|---|
| `/v1/admin/affiliates` (no `fields`) | GET | 200, empty rows | The quirk above |
| `/v1/admin/affiliates?fields=...&limit=500` | GET | 200, full rows | The way to actually fetch affiliates |
| `/v1/admin/affiliates/{id}` | GET | **404** | Detail endpoint **does not exist** on this account; the list endpoint is the only way to get an affiliate |
| `/v1/admin/coupons` | GET | 200 | Returns coupons with the affiliate embedded — schema below |
| `/v1/admin/settings` | GET | 404 | Not exposed |
| `/v1/admin/custom_fields` | GET | 404 | No custom-field admin endpoint |
| `/v1/admin/customfields` | GET | 404 | (variant guess, also 404) |
| `/v1/admin/fields` | GET | 404 | (variant guess, also 404) |
| `/v1/admin/groups` | GET | 504 (gateway time-out) | Likely doesn't exist; Cloudflare returned 504 instead of 404 |
| `/v1/admin/affiliate_groups` | GET | 404 | (variant guess, also 404) |
| `/v1/admin/tags` | GET | 404 | No tag admin endpoint |
| `/v1/admin/products` | GET | 404 | No product-side endpoint exposed |
| `/v1/admin/tracking_links` | GET | 404 | Not exposed |
| `/v1/admin/dashboard` | GET | 404 | Not exposed |
| `/v1/affiliate` (public) | GET | 404 | Public storefront endpoints are undocumented; we don't need them right now |
| `/v1/storefront/affiliate` (public) | GET | 404 | (variant guess) |

**Two endpoints we can rely on:** `GET /v1/admin/affiliates` (with
`fields=`) and `GET /v1/admin/coupons`. That's it. No detail endpoint,
no group endpoint, no custom-field endpoint, no product endpoint. If we
need anything richer later, GoAffPro support is the path.

## 4. Affiliate object schema

Total affiliates: **195** (`total_results` in the envelope).

The 28 fields that came back populated, with fill rate across the 195
records:

| Field | Type | Set | % populated | Notes |
|---|---|---|---|---|
| `id` | number | 195 | 100% | Stable internal id (e.g. `17972691`); good join key but opaque |
| `email` | string | 195 | 100% | Login email; PII; not a good URL slug |
| `ref_code` | string | 195 | 100% | **The referral slug**, mixed case (e.g. `viachofq`, `AddHam2it`); 100% distinct; this is what shows in `?ref=` URLs |
| `status` | enum | 195 | 100% | Distribution: `approved` × 23, `blocked` × 172 (see §5) |
| `name` | string | 194 | 99% | Display name; one blocked affiliate (id=14528037, email `lizzy2321@gmail.com`) has empty `name` and `first_name`. None of the 23 approved are missing names. |
| `first_name` | string | 194 | 99% | Same single blocked record missing |
| `created_at` | ISO date | 195 | 100% | |
| `updated_at` | ISO date | 195 | 100% | |
| `last_login` | ISO date | 195 | 100% | |
| `last_name` | string | 89 | 46% | |
| `metadata` | object | 79 | 41% | Signup geolocation only (`signup_info: { latitude, longitude, city, country, ... }, email_verified_at`); **NOT** writeable custom fields |
| `payment_method` | string | 98 | 50% | E.g. `paypal` |
| `avatar` | object | 70 | 36% | `{ url, size, width, height, mimetype }`; CDN at `creatives.goaffpro.com` |
| `instagram` | string | 76 | 39% | URL or handle (mixed); not normalized |
| `facebook` | string | 76 | 39% | URL or handle (mixed) |
| `twitter` | string | 16 | 8% | |
| `youtube` | string | 12 | 6% | |
| `tiktok` | string | 0 | 0% | Field exists but no one set it |
| `website` | string | 20 | 10% | |
| `phone` | string | 18 | 9% | |
| `country` | ISO-2 string | 18 | 9% | |
| `city`, `state`, `zip`, `address` | string | 0 each | 0% | Fields exist but no one set them |
| `tags` | array | 0 | 0% | **Always `[]`** in production. No one is using GoAffPro tags. |
| `group_id` | int\|null | 0 | 0% | **Always `null`** in production. No one is using GoAffPro groups. |
| `parent_id` | int\|null | 0 | 0% | No sub-affiliate hierarchy in use |

### Fields probed that **do not exist** on this account

The probe over-requested: anything not in the table above is silently
absent from production. Notably:

- No `is_artist` boolean. No `role` / `type` field.
- No `bio` / `description` field.
- No `coupon_code` on the affiliate (coupons live on `/admin/coupons` and
  carry `affiliate_id`, see §7).
- No `custom_fields`.
- No `total_sales` / `total_commission` / `total_orders` / `total_clicks`
  in the list response. (Those may be available via a stats endpoint we
  haven't found, but they're irrelevant to artist-linkage.)
- No `profile_image` (use `avatar` instead).
- No `account_status` separate from `status`.

### Sample full record (the richest one in the snapshot)

```json
{
  "id": 19313248,
  "name": "Quan Ho",
  "first_name": "Quan",
  "last_name": "Ho",
  "email": "up.life165662@gmail.com",
  "phone": "+84379998046",
  "website": "up.life165662@gmail.com",
  "status": "blocked",
  "ref_code": "evvxgdmq",
  "avatar": {
    "url": "https://creatives.goaffpro.com/7139812/tzzsxdgt-...-z7618771707985-...jpg",
    "size": 36425,
    "width": 500,
    "height": 500,
    "mimetype": "image/jpeg"
  },
  "country": "US",
  "city": null, "state": null, "zip": null, "address": null,
  "instagram": "Coolmate1897",
  "twitter": "Coolmate1897",
  "facebook": "Coolmate.me",
  "youtube": "Coolmate1897",
  "tiktok": null,
  "tags": [],
  "group_id": null,
  "parent_id": null,
  "payment_method": "paypal",
  "metadata": {
    "signup_info": {
      "latitude": "40.71427",
      "postalCode": "10001",
      "timezone": "America/New_York",
      "longitude": "-74.00597",
      "city": "New York City",
      "country": "US",
      "region": "New York"
    },
    "email_verified_at": null
  },
  "created_at": "2026-03-23T03:29:41.000Z",
  "updated_at": "2026-05-13T16:55:50.000Z",
  "last_login": "2026-03-23T03:29:43.000Z"
}
```

That signup metadata is interesting (it's geo-IP at signup) but useless
for artist-linkage. Note: status is `blocked` even on this rich record.
Spammers and real artists both fill in the avatar; status is the only
real signal.

## 5. Status distribution & "what is an artist?"

```
status:  approved × 23   blocked × 172
```

There are **23 `approved` affiliates**. Spot-check confirms all 23
present as artists (real names, art-themed handles, avatars, social
links). The 172 `blocked` are spam signups (the kind of name-bash
emails like `ilarrazamhunterdeals@gmail.com`).

**Conclusion:** GoAffPro has no `is_artist` flag. In production, the
sole effective filter is `status === 'approved'`. If we add a
non-artist affiliate later (e.g. an influencer who isn't an artist),
this conflation breaks. But today, `approved === artist`.

### The 23 approved affiliates

| id | ref_code | name | avatar | socials |
|---|---|---|---|---|
| 19391926 | qxwjztnc | Jeffery Seth wood | ✓ | instagram, facebook |
| 19383010 | vodylrea | Noah.theartis | ✓ | instagram, facebook |
| 18929870 | xdigdocq | Jacque A Chandler | ✓ | instagram, twitter, facebook, youtube |
| 18452088 | vtbjwezw | Dalyn Bentley | ✓ | instagram, facebook |
| 18435239 | zxkauqyq | Ojartist | ✓ | instagram, facebook |
| 18330734 | chmhupjl | Obioraart | ✓ | instagram, twitter, facebook |
| 18096655 | saewuzty | zybbhorn | ✓ | instagram, twitter, facebook |
| 18036670 | xsrtndhi | Doodle Bob | ✓ | instagram, facebook |
| 17972691 | viachofq | **Bxnny. Arts** | ✓ | instagram |
| 17970408 | txqxkxwf | Lotus Lilly | ✓ | instagram, facebook |
| 17966700 | **AddHam2it** | Addham2it Artworks | ✓ | instagram, twitter, facebook |
| 17956890 | omzopikf | Sketched Reality | ✓ | instagram, facebook |
| 17880361 | rsdvbmus | **Merc** | ✓ | instagram, twitter, facebook, youtube |
| 17818220 | mledltfv | Galit | ✓ | instagram, facebook |
| 17815617 | vkxgnbft | xthememoryshopx | ✓ | instagram, facebook |
| 17806576 | xceltlyf | Opalis | — | instagram |
| 17777587 | syvrwzhj | dr.dude2099 | ✓ | instagram, facebook |
| 17741397 | ctmdlfpr | Marios Dal | ✓ | instagram, facebook |
| 17728264 | dzitvgjq | Penciler | ✓ | instagram, facebook |
| 16990782 | qmlwsxgq | **sarudrawss** | ✓ | instagram, twitter, facebook |
| 16985242 | fhxrxmzt | aceus | ✓ | instagram, facebook |
| 16977588 | jdzbyscq | tepidzeal | — | instagram, twitter |
| 16970201 | qgjahogd | Daniel Velez | — | (none) |

Bolded names match the Square graveyard SKUs (Bxnny, Saru, Merc,
Addham2it). All four artists for which placeholder Square items exist
**are present in GoAffPro and approved.**

### Profile data fill rate among approved affiliates

- 20 / 23 (87%) have an avatar
- 22 / 23 (96%) have at least one social link
- 20 / 23 (87%) have **both** avatar and ≥1 social

Realistic expectation for a PDP-side artist card: **3 of 23 won't
render with a photo today** (Opalis, tepidzeal, Daniel Velez). Daniel
Velez has zero socials at all. Either (a) we fall back to initials and
nudge the artist to update GoAffPro, or (b) we host a fallback image
ourselves.

## 6. Joinable identifiers — what would Square reference?

| Field | Set / total | Distinct? | Stable? | Notes |
|---|---|---|---|---|
| `id` | 195/195 | 195 (yes) | Stable forever | Numeric, opaque (e.g. `17972691`); good for a database join, bad for a URL slug |
| `email` | 195/195 | 195 (yes) | Mostly stable | PII; the artist could reasonably change it; bad URL slug |
| `ref_code` | 195/195 | 195 (yes) | **Mutable by the artist** in their GoAffPro dashboard; mixed case (`AddHam2it`, `viachofq`) | Already the public referral identifier (used in `?ref=...` URLs); but if an artist edits their ref_code we lose the link |

**No good single identifier.** The cleanest approach is to store
**both** the slug we control (something staff types: e.g. `bxnny`) *and*
the GoAffPro `id` we resolve once at admin time, not at request time.
That way:
- The Square-side slug is stable (we own it).
- The GoAffPro `id` is stable (GoAffPro never recycles it).
- We resolve the GoAffPro `id` from the slug exactly once during
  admin-side product setup (or in the build step), not on every PDP
  request.
- If `ref_code` changes, we re-resolve.

`ref_code` itself is fine as a **fallback label** but we shouldn't make
it the storage key.

## 7. The `/admin/coupons` endpoint (bonus discovery)

This one returned 200 unexpectedly. Each coupon embeds the affiliate it
belongs to:

```json
{
  "code": "addham2it",
  "discount_value": 10,
  "discount_type": "percentage",
  "type": "personal",
  "affiliate_id": 17966700,
  "affiliate": {
    "id": 17966700,
    "name": "Addham2it Artworks",
    "email": "addham2it@gma...",  // (truncated in preview)
    ...
  }
}
```

Useful for Phase 5 (when we eventually ingest commission codes), not
relevant for the artist-linkage decision. Documented here so the next
session doesn't have to rediscover it.

## 8. Anything weird / surprising / undocumented

1. **`fields=` is mandatory.** Documented in §2. The single biggest
   gotcha.
2. **No detail endpoint.** `GET /admin/affiliates/{id}` returns 404.
   The list endpoint is the only way to read affiliate data, so any
   integration has to fetch all 195 (or page through) and filter
   client-side.
3. **No segmentation in production.** `tags` is always `[]`,
   `group_id` is always `null`. GoAffPro supports both, but no one set
   them. So there's no native "this is an artist" flag — `status ===
   'approved'` is the only signal.
4. **`ref_code` is mixed case in production** (`AddHam2it` is the
   counterexample to the all-lowercase pattern). Any matcher needs to
   be case-insensitive.
5. **Geolocation in `metadata.signup_info`** — IP-based, captured at
   signup. Useful for nothing in v1 but worth knowing it's there.
6. **`/admin/groups` returned a Cloudflare 504**, not a 404. Likely
   means GoAffPro has a real but slow/broken endpoint there. Treating
   as "doesn't exist" for our purposes.
7. **Public endpoints are undocumented.** We have a public token but no
   confirmed paths. Not a blocker for artist-linkage; the public token
   is for the storefront-side referral cookie flow that runs
   client-side.

---

# 9. Memo: how Square products link to GoAffPro artists

The original spec assumed we'd add an `artist` custom attribute
(string slug) to every Square ITEM. That decision was made before
we had real data. Now we do. Three branches, ranked by recommendation:

## Recap of context the user already has

- The Square production survey
  (`docs/superpowers/specs/reference/square-production-survey.md`)
  already established that we're keeping `artist` as a custom
  attribute concept — categories are hierarchical and would clutter
  the seller's category browser. The 30 graveyard SKUs (Bxnny / Saru
  / Merc placeholder items) are waiting on this decision before they
  get cleaned up.
- The "Artist" category in Square is half-built: only "Merc Da
  Artist" exists as a sub-category; Bxnny, Saru, etc. don't.
- All four artists with graveyard SKUs **are approved in GoAffPro**
  (Bxnny.Arts / sarudrawss / Merc / Addham2it Artworks).

## Branch A — Square custom attribute `artist` (slug)

Add a single new `CUSTOM_ATTRIBUTE_DEFINITION` to Square production:

```
key:    "artist"
type:   STRING
allowedObjectTypes: ITEM
visibility: VISIBILITY_READ_ONLY (or _WRITE_VALUES — staff fills it)
```

Staff sets the slug per ITEM (e.g. `bxnny`, `saru`, `merc`,
`addham2it`). The site reads the slug at build time, resolves it
**once** to a GoAffPro `id` via the cached affiliate snapshot
(rebuilt nightly or on demand), and renders the artist card from the
cached profile.

| Question | Answer |
|---|---|
| How many places does staff set the artist when uploading? | **One** — fill in the `artist` custom attribute on the Square item. |
| What breaks if the GoAffPro `ref_code` (slug) changes? | **Nothing on the Square side.** The Square slug is independent of the GoAffPro `ref_code`. The site joins via `name`/our-resolved-`id`. We re-resolve from the cached snapshot at build time. |
| Effect on the 30 graveyard SKUs? | The graveyard SKUs become **unnecessary**. Once any *real* item carries `artist=bxnny`, the standalone "Bxnny" placeholder ITEM serves no purpose. Cleanup: archive the 30 graveyard SKUs (they were placeholders; the new attribute provides the linkage). |
| Cleanup integration | Resumes Pattern 3 of the cleanup workstream cleanly: archive the 30 graveyard SKUs, then bulk-edit the *real* items they were placeholders for to carry the `artist` attribute. |
| New seller workflow | When uploading a new product, staff types one slug into one field. Discoverable in the seller's existing custom-attribute UI. |
| Risk | Typos: `bxnney` vs `bxnny`. Mitigated by validating the slug at build time against the cached affiliate snapshot — a build-time error surfaces typos before they ship. |
| Bottom line | **Single source of truth, one field per item, simple build-time validation.** |

## Branch B — Square's existing `Artist` category tree

Use Square's existing "Artist" parent category. Each artist gets a
sub-category (`Artist > Bxnny.Arts`, `Artist > sarudrawss`, etc.).
Items get assigned to the relevant sub-category. The site reads the
category, joins to GoAffPro **by name** to find the profile.

| Question | Answer |
|---|---|
| How many places does staff set the artist when uploading? | **One** (in principle) — assign the item to the artist sub-category. But categories also serve other navigational purposes (Anime / Pokemon / Slaps / Movies); items often want to be in an Anime sub-category *and* an Artist sub-category, so it's already two assignments per item, not one. |
| What breaks if the GoAffPro `ref_code` changes? | Nothing — we join by `name`, not `ref_code`. But if the GoAffPro `name` changes (artist renames their account), the join silently fails and no artist card renders. Worse, we'd have no way to detect this without comparing snapshots. |
| Effect on the 30 graveyard SKUs? | The graveyard SKUs *might* be repurposed as the artist sub-category's "feature" item. But more likely they remain orphans — categories don't need a representative ITEM. Probably still archive them. |
| Cleanup integration | Adds 14+ new sub-categories under "Artist" (one per active artist). Bloats the category browser. Conflicts with the survey's recommendation (§5 of `square-production-survey.md`) to keep the category tree small. |
| New seller workflow | When adding a new artist, staff has to (a) create a Square sub-category, (b) ensure the sub-category name *exactly* matches the GoAffPro account name (case-sensitive, including punctuation like `Bxnny. Arts` with the period), (c) assign new items to it. Three places to get wrong instead of one. |
| Risk | Name-based join is fragile. `Bxnny. Arts` (the GoAffPro name) vs `Bxnny` (the natural Square category name) is exactly the kind of mismatch that breaks silently. The probe shows mixed-case `ref_code` (`AddHam2it`) — we'd see the same drift on names. |
| Bottom line | **Two sources of truth (Square category + GoAffPro account), fragile name-based join, clutters category tree.** |

## Branch C — Combined: custom attribute `artist` AND category assignment

Both. Staff sets `artist=bxnny` on the item *and* assigns it to the
`Artist > Bxnny.Arts` category.

| Question | Answer |
|---|---|
| How many places does staff set the artist when uploading? | **Two**, redundantly. |
| What breaks if `ref_code` changes? | Nothing extra (custom-attribute path covers us, same as Branch A). |
| Effect on graveyard SKUs? | Same as A — archive them. |
| Cleanup integration | Worst of both worlds: bloats category tree (B downside) *and* requires a second field per item (extra work). |
| New seller workflow | Two fields to remember. They can drift (`artist=bxnny` but category set to `sarudrawss`) and there's no system check. |
| Risk | Drift between the two fields is silent. Unless we add lint/validation at build time, the two paths can disagree. |
| Bottom line | **Pure duplication; only useful if there's a separate reason to want artists as a Square category (e.g. seller-side filtering in the Square dashboard). For our purposes, the custom attribute alone gives us that.** |

## Ranked recommendation

1. **Branch A** — single `artist` custom attribute, slug stored on the
   ITEM, resolved to a GoAffPro `id` at build time. **Strongest
   recommendation.** One field, stable join, decoupled from GoAffPro
   `ref_code` mutations, validates at build time.
2. **Branch B** — category tree only. Cheap to implement (no schema
   change at all) but the join is fragile. Acceptable as a v0 if we
   want to ship something *today* without touching custom attributes,
   but the maintenance cost compounds with every new artist.
3. **Branch C** — both. Pure overhead. Skip unless seller-side
   workflow specifically benefits from Square-side artist categories
   (the survey suggested it doesn't).

Branch A is also the cleanest path forward for the cleanup
workstream's pending Pattern 3 — once `artist=bxnny` exists as an
attribute on the real Bxnny products, the 30 graveyard SKUs can be
archived without losing any information.

The decision is the user's. The data above is what I'd want on the
table when making it.

## What this decision unblocks

- **Cleanup workstream Pattern 3:** the 30 artist-named graveyard SKUs.
  Under Branch A or C: archive them after attributing real items.
  Under Branch B: archive them after categorizing real items.
- **Phase 5 plan:** GoAffPro integration. Once Branch is chosen, the
  Phase 5 plan can be written cleanly — it knows where the slug
  lives, how to resolve it, and how to fall back when the cached
  snapshot is stale.

---

# 10. Phase status — **this workstream did not complete**

**Status:** Probe complete, design decision reopened, **a new structural
direction has been chosen**, this phase is paused and will be re-planned
from the new direction (see §11 below). Branches A/B/C above are
**historical context only** — do not implement them. They were
superseded by the discussion captured in §11.

## What did complete in this session

- ✅ `scripts/goaffpro/probe.ts` — read-only GoAffPro admin-API probe,
  wired as `pnpm goaffpro:probe`.
- ✅ `docs/superpowers/specs/reference/goaffpro-api-probes.md` — this
  document, sections 1–9 (auth, schema, fill rates, joinable
  identifiers, the original three Square-side linkage branches).
- ✅ `scripts/square-account-probe/probe.ts` — read-only Square
  production-account probe, wired as `pnpm sq:account-probe`.
  Confirmed: account is `ACTIVE`, both locations process cards, all
  9 load-bearing APIs return 200, **no Square Plus/Premium upgrade
  is required** to build any of the integration the design space
  ultimately landed on.

## What did NOT complete (and why)

- ❌ **A decision among Branches A / B / C.** During the design
  discussion the user surfaced new context that invalidated the
  premise of the original three branches. Specifically:
  1. GoAffPro has no artist-vs-affiliate discriminator field
     visible via the admin API (verified by inspecting the full
     record schema; `tags[]` and `group_id` are 0% populated; no
     `is_artist`, no `role`, no `type`, no `kind`, no `level` on
     any record). The "status === 'approved'" filter coincides
     with "is artist" today only because 100% of approved
     accounts happen to be artists; this conflation will break
     the moment a non-artist affiliate gets approved.
  2. There are **no per-affiliate coupon codes attributing sales
     to artists**. Artist commission is product-based: if a piece
     by Bxnny sells, Bxnny earns commission, regardless of how
     the customer arrived. Cookie/referral tracking is *not* the
     attribution mechanism for artist commission.
  3. Discounts that *do* exist (con discount, military discount,
     site-wide promo) reduce the line-item net; commission is
     paid on net-of-discount, pre-tax.
  4. **Square supports multiple categories per item** (verified
     against current docs; `categories[]` is an array on
     `item_data`, ordinal-ranked). This was the key data-model
     fact that unlocked the simpler design.
  5. **Square's seller dashboard already runs Sales-by-Category
     reports** — the user runs the business in Square daily, so
     monthly commission reconciliation is a 30-minute dashboard
     task, not a code task.

  Once those five facts were on the table, none of Branches A / B / C
  remained the best answer. The discussion converged on a different
  architecture entirely; see §11.

- ❌ **Implementation of any artist-linkage code, custom-attribute
  definition, admin UI, or commission engine.** The implementation
  of the artist system depends on the structural decision above,
  which is now different from what the original spec assumed.

- ❌ **Resumption of cleanup workstream Pattern 3 (the 30 artist-named
  graveyard SKUs).** Pattern 3 was paused waiting on the artist
  linkage decision. The new design resolves it — the graveyard SKUs
  are archived once real items carry the artist sub-category. But
  the actual archival operation is part of the new plan, not done
  yet.

# 11. The new structure — what we landed on

After working through five design branches across the session, the
user proposed (and on review the assistant agreed is correct for
the actual size and shape of this business) a much simpler design.
**This is the structure the next plan should be built around.**

## Core decision: Square Categories are the primary source of truth

- **Artist is a Square Category.** `Artist > Bxnny.Arts`,
  `Artist > sarudrawss`, `Artist > Merc Da Artist`, etc. Each
  active GoAffPro-approved artist gets one sub-category under the
  existing top-level `Artist` category (which is already half-built
  in production — only `Merc Da Artist` exists today).
- **IP is also a Square Category.** `Anime > Naruto`, `Comics > Marvel`,
  `Video Games > Street Fighter`, etc. These mostly already exist in
  production (per `square-production-survey.md`).
- **Items belong to multiple categories.** Square's `item_data.categories[]`
  is an array of `{ id, ordinal }` objects. A Bxnny-drawn Naruto piece
  is in **both** `Artist > Bxnny.Arts` *and* `Anime > Naruto`. The
  `ordinal` field can rank them (artist as primary, IP as secondary)
  but is mostly cosmetic.
- **No new Square custom attributes are needed.** Drop the planned
  `artist` custom-attribute-definition. Drop the planned `ip` custom-
  attribute-definition (already provisionally dropped per the survey).
  The categories-array carries everything.

## What GoAffPro becomes

**GoAffPro is retired entirely from the Animeniacs Shop project.**

- No artist profile data from GoAffPro at runtime.
- No `?ref=` referral cookie / `affiliate_ref` cookie / referral
  attribution layer.
- No GoAffPro coupon resolution at checkout.
- No GoAffPro webhooks.
- Section §13 of the design spec (GoAffPro Affiliate Tracking) is
  removed from scope.

The 23 approved-and-real artists currently in GoAffPro are migrated
into the new in-app Postgres `artists` table (one-time data entry, no
GoAffPro API at runtime). The 172 spam-blocked GoAffPro accounts are
simply abandoned — they go away when the GoAffPro subscription is
cancelled. **Cancelling the GoAffPro subscription is part of the
post-launch cleanup**, not a blocker to building.

## What Plausible's role is

**Plausible stays at whatever tier you already have for general
website analytics.** It is *not* a load-bearing part of the artist
or affiliate system anymore. UTM-tagged inbound links (`?utm_source=…`)
flow through to Plausible's dashboard for traffic visibility. No
Plausible Business-tier upgrade is required for anything in this
design. No Purchase events, no revenue tracking, no Stats API.

## What inbound external affiliates become (optional add-on, not v1)

If/when you partner with an external influencer for inbound traffic:

- Create a **single Square Discount** per partner (`INFLUENCER10` —
  10% off, named after the partner so it's identifiable in reports).
- Give the partner a link like
  `https://animeniacs.shop/?utm_source=influencer123` for Plausible
  to count traffic, and instruct them to tell their audience to use
  the discount code at checkout.
- Once a month, run Square's "Sales by Discount" report for the
  date range. Multiply revenue-using-`INFLUENCER10` by the
  commission rate. Pay manually (PayPal/Venmo/check).
- **No cookie middleware. No Order Custom Attribute API. No
  attribution code in the app. No affiliates DB table.**

This is the "lazy" approach we discussed; it's sufficient for the
expected partner count (1–10), and the engineering cost is roughly
zero. If volume grows large enough that this becomes painful, a
proper attribution layer can be retrofitted later (Square Order
Custom Attributes API was verified to work and provides a clean
upgrade path), but it is **explicitly out of scope for v1**.

## What still needs to be built (the actual v1 scope)

### Schema

**One new Postgres table — `artists`.** That is the entire database
schema addition.

```ts
// src/lib/db/schema.ts (new)
export const artists = pgTable('artists', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),                  // 'bxnny-arts' — URL slug; stable
  displayName: text('display_name').notNull(),            // 'Bxnny.Arts'
  squareCategoryId: text('square_category_id').notNull(), // FK-by-string to Square's CatalogCategory.id
  status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
  avatarUrl: text('avatar_url'),                          // hosted by us; admin upload
  bio: text('bio'),
  instagram: text('instagram'),
  twitter: text('twitter'),
  facebook: text('facebook'),
  youtube: text('youtube'),
  tiktok: text('tiktok'),
  website: text('website'),
  commissionRate: numeric('commission_rate', { precision: 5, scale: 4 })
    .notNull().default('0.2000'),                         // for the user's reference when running reports
  paymentMethod: text('payment_method'),
  paymentEmail: text('payment_email'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

No `affiliates` table. No `commission_reports` table. No
`commission_line_items` table. No `affiliate_attributions` table.
No `affiliate_clicks` table. **One table.**

### Admin area (small)

Under `/admin/artists` (the existing Phase 7 admin route group, gated
by Logto's `admin` role — auth is FREE because Logto is already wired
into the stack and the design spec §10 + §11 already provides the
pattern for admin pages via `getLogtoContext(logtoConfig)`):

- `GET /admin/artists` — list of all artists with status, edit link,
  "+ new artist" button
- `GET /admin/artists/new` — create form
- `POST /admin/artists` — create handler
- `GET /admin/artists/[id]` — edit form (avatar upload, all profile
  fields, link to the chosen Square category via a dropdown
  populated from Square's CatalogCategory list)
- `PUT /admin/artists/[id]` — update handler

Image upload: simplest available path is Vercel Blob if the production
deploy uses Vercel; otherwise local `/public/images/artists/` written
at admin save time. **Decision deferred to the implementation plan**;
both work.

**Admin scope is exclusively artist profile CRUD.** Do not add: a
commission engine, an orders viewer, a discount manager, an
item-to-artist assignment UI, an artist-facing self-service
dashboard, a webhook handler, or an inbound-affiliate manager. All
of those either live in Square's dashboard already or are out of v1
scope.

### Public website integration

Two read paths:

1. **PDP** (`/product/[id]`):
   - Read the item's `categories[]` array from Square.
   - For each category in the array, look up by `squareCategoryId`
     in the local `artists` table.
   - If a match: render the artist card (avatar, name as link to
     `/artist/[slug]`, social links).
   - If no match: that category is an IP/taxonomy category (e.g.
     `Anime > Naruto`) — render as a breadcrumb / "From Naruto"
     tag with no avatar.

2. **Artist gallery + profile** (`/artist`, `/artist/[slug]`):
   - `/artist` — `SELECT * FROM artists WHERE status = 'active'`
     → grid of cards.
   - `/artist/[slug]` — `SELECT * FROM artists WHERE slug = $1`
     for the profile header, then Square `searchCatalogObjects`
     with `set_query: { attribute_name: 'categories',
     attribute_values: [artist.squareCategoryId] }` to get the
     artist's products. Cache aggressively.

### Operations

- Monthly commission report: open Square dashboard → Reports →
  Sales by Category → filter to artist sub-categories for the date
  range → for each artist, multiply revenue by the commission rate
  from the `artists` table → pay manually. **No code, no admin
  workflow.**
- Cleanup workstream Pattern 3 resumes: archive the 30 graveyard
  SKUs after the real items they were placeholders for are
  re-categorized into the right `Artist > X` sub-category. This is
  Square dashboard work, not code.

### Phase mapping (revised)

The design spec's current phase numbering becomes:

| Phase | Original scope | Revised scope |
|---|---|---|
| 3 (Square Catalog) | Add `artist`+`ip`+`product_type`+`sibling_group` custom attributes | **Drop all four custom attributes.** Add `artists` Postgres table + Drizzle schema migration. Build the `artists` table read helpers. |
| 4 (Artist System) | Read from GoAffPro at runtime | **Read from local `artists` table** keyed by Square category id. No GoAffPro at runtime. |
| 5 (PDP) | Show artist card (joined from GoAffPro) + variant tabs | Show artist card (joined from local `artists` table by category) + variant tabs. Variant tabs unchanged. |
| 7 (Admin) | `/admin` for site settings + event logos + diagnostics | **Add `/admin/artists` CRUD.** Logto `admin` role already gates `/admin/*`. |
| 13 (GoAffPro Affiliate Tracking) | Build the visit/conversion tracking integration | **Removed from scope.** Replace with: optional "one Square Discount per external partner, monthly manual reconciliation" workflow (see above). No code required. |

Phases 6 (Cart & Wishlist), 8 (Recently Viewed), 9 (Checkout), 10
(Auth), 12 (Events) are unaffected by this decision. Phases 14
(Newsletter), 15+ are unaffected.

## Why this design is correct for this business (the honest summary)

1. **Matches the size of the problem.** ~23 active artists, monthly
   cadence, single-person operator, manual oversight already exists.
   A commission engine that runs once a month is overhead for the
   359 days a year it's idle.
2. **Square dashboard already does the reporting work for free.**
   Building parallel infrastructure to replicate it is bad ROI.
3. **One table, ~15 columns, ~3 admin pages.** That's the entire
   technical surface area added to the stack for the artist system.
4. **Logto auth is already in the stack** — no admin auth to design
   or build; reuse the pattern from design spec §10–§11.
5. **No GoAffPro vendor risk and one subscription cancelled.**
6. **POS sales count toward artist commission for free**, because
   POS sales flow through Square's Sales-by-Category report just
   like online sales. GoAffPro never tracked POS sales.

## What does NOT change

- `Plausible` for general analytics — unchanged, untouched.
- `Logto` for auth — unchanged, untouched. Already-defined `admin`
  role gates the new `/admin/artists` routes for free.
- Variant pattern (`ITEM_OPTION` + `ITEM_VARIATION` for
  Acrylic/Vinyl/Size) — unchanged, per the production survey.
- Cart, checkout, wishlist, reviews, events, newsletter, etc. —
  unchanged.
- Square production account — no new custom attribute definitions
  to create (one decision averted; the 5 existing ones don't need
  changes either).

## Implementation hand-off

A separate brief for the master agent is at
**`docs/superpowers/specs/reference/artist-system-handoff.md`** with
the full re-planning scope and the order of work. This memo is the
*why*; that brief is the *what to do next*.
