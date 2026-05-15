# Square catalog cleanup — work-in-progress hand-off

**Status:** Phase A (mirror production → sandbox) and Phase B (audit
report) are **both complete**. Mirror runs end-to-end; live `--apply`
succeeds; sandbox counts match production exactly except for IMAGE (594
prod, 0 sandbox — documented limitation). Audit report committed at
`docs/superpowers/specs/reference/square-production-audit.md`.

This doc tells the next session what's done, the architectural decisions
made along the way, and the specific scope of Phase C.

---

## Goal of this workstream

Clean up the production Square catalog. To do that safely, we mirror prod →
sandbox first, run cleanup against sandbox (rehearsal), then apply the same
cleanup to production. The mirror script is the prerequisite.

Five phases total:

- Phase A: Mirror prod → sandbox — **complete** (commit `75359ea`)
- Phase B: Audit report (read-only markdown of catalog hygiene issues) — **complete** (commit `c9abf17`)
- Phase C: Define cleanup rules — **partial: easy automatic wins shipped** as a hard-coded ruleset in `scripts/square-cleanup/cleanup.ts`. Sandbox rehearsal complete. Production apply pending user go-ahead. The harder pattern-level decisions (artist SKU graveyard, category-tree disposition, duplicate adjudication) deferred to a YAML rules file in a future session.
- Phase D: Add `artist` custom attribute + assignments
- Phase E: Apply cleanup to sandbox first, verify, then promote to production

### Phase C status (first iteration)

The Phase B audit surfaced 17 issue categories. Discussion clustered them
into 4 patterns:

1. **Orphan image lifecycle** (issues #13/#14) — 396 orphan IMAGEs + 4
   URL-less IMAGEs. Lowest-risk, highest-volume cleanup. Fully automatic.
2. **Vestigial custom attribute definitions** (issues #16/#17) — `Media`
   and `Size` LitCommerce-created definitions conflicting with the
   working ITEM_OPTIONs. Fully automatic.
3. **Artist SKU graveyard** (issues #1/#4/#11 overlap) — 30 artist-named
   placeholder SKUs with no category, no image, no data. Needs user
   decisions.
4. **Category-tree disposition** (issues #8/#9) — 35 of 41 categories
   empty; the entire franchise tree (Anime/Comics/Games) is built but
   unused. Needs user decisions.

This iteration ships patterns 1 and 2 (the easy automatic wins) so the
end-to-end apply pipeline is proven on low-risk data before tackling
the consequential decisions. Patterns 3 and 4 will become a YAML
rules file in a future session once the user has reviewed the audit
in depth.

### Phase C apply script: `pnpm sq:cleanup`

Script: `scripts/square-cleanup/cleanup.ts`. Hard-coded ruleset for
patterns 1 and 2 (the easy wins). Pulls live state from Square at
plan time (not from a snapshot, which would race with dashboard
edits). Dry-run by default; `--apply` commits.

Production has a triple guard:
- `--apply` flag
- `--i-mean-it` flag
- `--confirm "YES I MEAN IT"` typed verbatim

Every write goes to a JSONL audit log under `cleanup-audit/` (gitignored).

### Sandbox rehearsal — complete

```
pnpm sq:cleanup sandbox            # dry-run: 2 op(s) planned
pnpm sq:cleanup sandbox --apply    # 2 ok, 0 failed
```

Sandbox CUSTOM_ATTRIBUTE_DEFINITION count: 5 → 3 (Square-system
definitions preserved; `Media` and `Size` removed). The 0-IMAGE
inheritance from Phase A means sandbox couldn't rehearse the
image-deletion path, but the script architecture is identical for
both kinds of deletes — the production run will exercise it.

### Production apply — partial success (commit `8160b04`+follow-up)

User confirmed; ran on 2026-05-15:

```
pnpm sq:cleanup production --apply --i-mean-it --confirm "YES I MEAN IT"
```

Result: **396 of 398 operations succeeded**.

| Operation | Count | Status |
|---|---|---|
| delete-orphan-image | 392 | ✅ all ok |
| delete-image-without-url | 4 | ✅ all ok |
| delete-custom-attribute-definition (Media) | 1 | ❌ 403 FORBIDDEN |
| delete-custom-attribute-definition (Size) | 1 | ❌ 403 FORBIDDEN |

Production IMAGEs went from 594 → 198 (exactly matching Phase B's
predicted 198 referenced images). Two-thirds of the image catalog
(the dead weight) is gone.

**LitCommerce ownership gotcha:** Square's API enforces source-app
ownership on CUSTOM_ATTRIBUTE_DEFINITIONs. The Media and Size
definitions in production were created by LitCommerce (applicationId
`sq0idp-uauiGDCgVKFsxIzOIKtTUA`), so our app's token cannot delete
them — only LitCommerce or the seller (via the dashboard) can.

The cleanup script has been patched to detect ownership and skip
unowned definitions cleanly (with a console warning). The script
remains idempotent: future runs of `pnpm sq:cleanup production` are
0-op until new rules are added.

**To finish removing Media/Size from production:** log into
squareup.com → Items → Settings → Custom attributes → delete `Media`
and `Size` manually. The dashboard runs as the seller, not as our
app, so it bypasses the API restriction. ~30 seconds of manual work.

Audit log: `cleanup-audit/cleanup-production-2026-05-15T03-27-07-887Z.jsonl`
(gitignored; ~400 entries with full operation details and S3 URLs
for forensic recovery).

---

## What ships in this commit

```
scripts/square-cleanup/
├── lib.ts          shared helpers (snapshot, rewriter, chunk, sleep)
├── snapshot.ts     pnpm sq:snapshot <sandbox|production> — read-only
└── mirror.ts       pnpm sq:mirror <snapshot.json> [--apply] — sandbox-only writes
```

Plus:

- `package.json` — added `sq:snapshot` and `sq:mirror` scripts; fixed
  `lint:fix` from deprecated `--apply` to `--write`
- `biome.json` — extended overrides to allow `noNonNullAssertion`,
  `noUnusedTemplateLiteral`, `noDelete`, and `noExplicitAny` in
  `scripts/**/*.ts`
- `.env.local` — added `SQUARE_PROD_ACCESS_TOKEN` (gitignored, NOT committed)
- `docs/superpowers/specs/reference/square-production-survey.md` — survey of
  what's actually in production today
- This file

The production snapshot file lives at
`/tmp/animeniacs-square-snapshot-production-2026-05-15T02-13-19-497Z.json`
(1.33 MB). It's not in the repo and won't survive a reboot — re-run
`pnpm sq:snapshot production` to regenerate.

---

## What works (verified)

1. **`pnpm sq:snapshot production`** — pulls 915 catalog objects across 8
   types, serializes BigInt money amounts as Numbers (cents), writes to
   `/tmp/animeniacs-square-snapshot-production-<ts>.json`.

   Counts confirmed against direct curl probes:
   - 5 CUSTOM_ATTRIBUTE_DEFINITION
   - 11 TAX
   - 41 CATEGORY
   - 2 ITEM_OPTION
   - 11 ITEM_OPTION_VAL
   - 594 IMAGE
   - 20 DISCOUNT
   - 231 ITEM (with 419 nested ITEM_VARIATIONs)

2. **`pnpm sq:snapshot sandbox`** — the same flow against sandbox. Currently
   returns 19 objects (3 sample ITEMs, 11 TAX from Square defaults, 5
   IMAGE, 0 of everything else).

3. **`pnpm sq:mirror <snap>` (dry-run)** — walks both wipe and upsert plans,
   prints what it would do without calling the API.

4. **Mirror's wipe step** — confirmed working in the live `--apply` run that
   failed later (the wipe ran cleanly; failure was on the upsert).

## Final mirror result (verified)

Run `pnpm sq:mirror <snapshot.json> --apply` end-to-end output:

```
  pass: leaves (definitions / taxes / discounts) — 36 object(s)
    upserting... upserted 36 (collected 36 id mappings)
  pass: item options — 2 object(s)
    upserting... upserted 2 (collected 13 id mappings)
  pass: categories — 41 object(s)
    upserting... upserted 41 (collected 41 id mappings)
  pass: items (with nested variations) — 231 object(s)
    upserting... upserted 231 (collected 650 id mappings)

Mirror complete. Sandbox now matches the snapshot.
```

`pnpm sq:snapshot sandbox` confirms:

| Type | Production | Sandbox | Status |
|------|---|---|---|
| CUSTOM_ATTRIBUTE_DEFINITION | 5 | 5 | exact |
| TAX | 11 | 11 | exact |
| CATEGORY | 41 | 41 | exact |
| ITEM_OPTION | 2 | 2 | exact |
| ITEM_OPTION_VAL | 11 | 11 | exact (nested) |
| IMAGE | 594 | 0 | **skipped** — see below |
| DISCOUNT | 20 | 20 | exact |
| ITEM | 231 | 231 | exact |
| ITEM_VARIATION (nested) | 419 | 419 | exact |

Spot-checked items resolve: "Custom UV Printed Decals" has 8 size variants
with correct prices and Size ITEM_OPTION wired up; "10 for 10 Slaps" has
its category assignment intact.

## Architectural decisions taken to get here

The first live `--apply` failure was on production location IDs leaking
through the rewriter. After patching that, the path to a clean mirror
required several more rounds of debugging. The fixes accumulated in
`scripts/square-cleanup/lib.ts` and `scripts/square-cleanup/mirror.ts`:

1. **Recursive `stripRecursive` helper** in `lib.ts` instead of per-type
   field deletes. Strips `version`, `updatedAt`, `createdAt`, `isDeleted`,
   `presentAtLocationIds`, `absentAtLocationIds`, `presentAtAllLocations`,
   `catalogV1Ids`, `channels`, `locationOverrides`,
   `itemVariationVendorInfos`/`Ids` at every nesting level. Same helper
   coerces every `*Money.amount` from `Number` back to `BigInt` (the
   snapshot file stores BigInts as Numbers because JSON can't represent
   BigInts; the SDK's Zod schema validates `amount` as bigint).

2. **Generic `remapStringsRecursive` helper** that walks the entire
   payload and remaps any string equal to a production Square ID into
   its `#temp_<n>` placeholder. This catches any reference field we
   haven't enumerated explicitly (e.g. `itemData.itemOptions[].itemOptionId`,
   which we discovered the hard way — Square requires the order of
   `itemOptions` on the parent ITEM to match the order of `itemOptionValues`
   on each variation, and an unrewritten production ID broke that).

3. **Pre-allocated temp IDs for nested ITEM_VARIATIONs and nested
   ITEM_OPTION values**, not just top-level objects. Without this, Square
   sees the original production variation/value IDs in the upsert payload
   and tries to *update* a nonexistent object instead of creating a new
   one.

4. **`scrubUnresolvedTempRefs` helper** to remove any leftover `#temp_<n>`
   references after rewrite. Used to drop image references on items (since
   IMAGE objects are skipped — see below), without disturbing nested
   objects' own `id` fields (which need to stay `#temp_<n>` until upsert).

5. **Per-type-specific strips that the recursive strip can't handle by
   key name alone:**
   - `categoryData.parentCategory.ordinal`: a Square-internal sort key
     that exceeds JS's safe integer range. The SDK validates it as a
     bigint, but JSON.parse turns it into a Number, so it always fails
     SDK validation. Same for `itemData.categories[].ordinal` and
     `itemData.reportingCategory.ordinal`. Square regenerates ordering
     on its own.
   - `categoryData.rootCategory`: a production category ID; safest to
     drop and let Square recompute it from `parentCategory`.
   - `taxData.appliesToProductSetId`: production references a
     `PRODUCT_SET` we don't snapshot. Stripping makes the tax apply to
     all products, which is fine for sandbox.

6. **Multi-pass upsert in `mirror.ts`** instead of one big atomic batch.
   Square's batchUpsert atomic-batch limit is 1,000 *total* objects
   (including nested variations). Our 915 top-level + 419 nested = 1,334.
   And `#temp_<n>` IDs only resolve within a single atomic batch. So we
   upsert in dependency-ordered passes (definitions/taxes/discounts →
   item-options → categories → items), using the response's `id_mappings`
   to rewrite `#temp_<n>` references into real IDs before the next pass.

7. **IMAGE objects are skipped entirely.** Square requires images to be
   created through the dedicated `CreateCatalogImage` endpoint with an
   actual file upload — they cannot be created via batchUpsert. Items
   with image references have those refs scrubbed before upsert. Result:
   sandbox items have no images, but everything else (categories,
   variants, prices, custom attributes) is faithful. This is acceptable
   for development/cleanup-rehearsal because the cleanup work doesn't
   touch images. If we ever need images in sandbox, we can either
   re-upload from the production S3 URLs via `createCatalogImage`, or
   write a separate image-mirror script.

8. **ITEM_OPTION_VAL standalone objects are skipped on upsert** because
   they're already nested inside their parent ITEM_OPTION; sending them
   again would conflict on the parent reference. They're still entered
   into the temp-ID map so cross-references from variations resolve.

9. **Wipe step deletes in reverse RESTORE_ORDER** (ITEMs first, leaves
   last) and skips ITEM_OPTION_VAL standalone deletes (deleting them
   before the parent fails Square's "must have at least 1 value"
   constraint; deleting the parent ITEM_OPTION cascades to the values).

## How to re-run the mirror

```bash
set -a && source .env.local && set +a

# Optional: refresh the production snapshot first.
pnpm sq:snapshot production
SNAP=$(ls -t /tmp/animeniacs-square-snapshot-production-*.json | head -1)

# Dry run to confirm shapes:
pnpm sq:mirror "$SNAP"

# Live: wipe sandbox + replay.
pnpm sq:mirror "$SNAP" --apply

# Verify counts.
pnpm sq:snapshot sandbox
```

Sandbox dashboard for spot-checks:
https://app.squareupsandbox.com/dashboard/items/library

## Tools and patterns established

- **`pnpm sq:snapshot <env>`** is read-only and safe; run as much as you
  want against either env.
- **`pnpm sq:mirror <snap>`** without `--apply` is a dry-run; safe.
- **`pnpm sq:mirror <snap> --apply`** writes to sandbox only. Hard guard
  in the script — refuses to write to production no matter the flags.
- The rewriter runs in two passes: assign temp IDs, then deep-rewrite all
  cross-references. Adding new ID-bearing fields = add a new line in pass 2.
- Money amounts are serialized as Numbers (cents). The SDK accepts Numbers
  on input.
- The Square v44 SDK uses CAMELCASE field names (itemData, imageIds,
  itemOptionValues, parentCategory). The rewriter has been ported to
  camelCase. Don't try to "fix" snake_case occurrences; the SDK does the
  conversion automatically.

## Phase B (audit report) — COMPLETE

**Status:** Done. Report committed at
`docs/superpowers/specs/reference/square-production-audit.md`.
User to review before authorizing Phase C.

### Phase B headline findings (from the production snapshot)

| # | Issue | Count |
|---|---|---|
| 1 | Items with no category | 30 / 231 |
| 2 | Items in `Uncategorized` / `Not Online` / `Slaps` | 1 / 231 |
| 3 | Items with empty / "test" / suspicious names | 3 / 231 |
| 4 | Items with no images | 34 / 231 |
| 5 | Items with `ecom_visibility` UNAVAILABLE/UNINDEXED | 2 / 231 |
| 6 | Items with `isArchived: true` | 2 / 231 |
| 7 | Placeholder pricing (VARIABLE_PRICING + no price) | 2 / 419 |
| 8 | Categories with zero items | 35 / 41 |
| 9 | Categories with weird casing | 1 / 41 |
| 10 | Duplicate or near-duplicate item names | 12 / 231 |
| 11 | Items missing artist info | 231 / 231 |
| 12 | Items with placeholder description text | 0 / 231 |
| 13 | IMAGE objects with broken URLs | 4 / 594 |
| 14 | Orphaned IMAGE objects (referenced by no item) | 396 / 594 |
| 15 | Orphaned ITEM_VARIATIONs (parent deleted) | 0 / 419 |
| 16 | Unused custom attribute definitions | 5 / 5 |
| 17 | `Media` / `Size` custom attrs conflicting with ITEM_OPTIONs | 2 / 5 |

The standout numbers: **only 6 of 41 categories actually contain items**
(189 of 201 items sit in "Acrylic Wall Art"); **396 of 594 IMAGE objects
are orphaned**; the entire Anime/Comics/Games sub-taxonomy is unpopulated.
30 items have no category at all, all of which look like artist-named
items (Bxnny.Arts, MercDaArtist, Saru, Noah, Juda, Zybhorn, …) that
predate the half-built `Artist` taxonomy.

### Files shipped in Phase B

- `scripts/square-cleanup/audit.ts` — the report generator
- `scripts/square-cleanup/probe.ts` — the one-shot API-shape probe used to
  document SDK gotchas before writing the audit (kept in-tree for future
  reference; not wired to package.json — invoke directly via `tsx`)
- `package.json` — added `sq:audit` script
- `docs/superpowers/specs/reference/square-production-audit.md` — the
  report itself

### Phase B SDK gotchas surfaced

The probe found new gotchas beyond the ones Phase A documented:

1. **Mixed casing in returned payloads.** Some fields are snake_case
   (`itemData.ecom_visibility`, `itemData.ecom_available`,
   `categoryData.location_overrides`, object-level `created_at`) while
   most are camelCase. The audit reads both casings via a helper
   (`readField`) so it doesn't matter which side the SDK returns.
2. **`customAttributeValues` is unset on every item.** All 5 custom
   attribute definitions in production are dead weight; 2 of them
   (`Media`, `Size`) duplicate existing ITEM_OPTION names.
3. **`reportingCategory` is barely used** — only 1 item of 231 sets it.
   Most use `categories[]` instead.
4. **`description` vs `descriptionHtml` vs `descriptionPlaintext`.** All
   three exist on any item with a description. `description` contains
   raw HTML; `descriptionHtml` contains double-encoded HTML (Square-side
   artifact); `descriptionPlaintext` is the canonical text. The audit
   reads `descriptionPlaintext` for text matching.
5. **`categoryType` is `REGULAR_CATEGORY` for all 41 categories** — no
   special types in this account.
6. **Money amounts are Numbers (not BigInts) in the snapshot**, because
   `snapshot.ts` casts BigInt → Number on write. Safe — all prices fit
   in the JS safe integer range.

### Phase B (audit report) — ORIGINAL SCOPE (kept here as reference)

**Status:** User reviewed Phase A and gave explicit go-ahead to start
Phase B (commit `75359ea` accepted on 2026-05-15).

**User's stated preferences (from the Phase A review):**

1. **The IMAGE skip is acceptable.** Sandbox has 0 images vs production's
   594; that's fine for cleanup rehearsal because cleanup operates on
   metadata, not pixels. The audit report should still flag image-related
   issues (broken URLs, orphans), but image *migration* itself is deferred
   to a Phase 4 task (catalog UX wants real images for /shop).
2. **Smoke-test the API before writing code.** Before the report
   generator runs against real data, write a small probe that fetches a
   sample of each object type from the sandbox and prints actual field
   shapes. Document gotchas alongside the report. This catches things
   like the BigInt/Number/ordinal quirks that bit Phase A.

The Phase B design sketch:

The audit report generator reads the snapshot and outputs a markdown report
flagging:

1. Items with no category
2. Items in "Uncategorized" / "Not Online" / "Slaps" categories
3. Items where name is empty / "test" / suspicious
4. Items with no images
5. Items where `ecomVisibility` is UNAVAILABLE / UNINDEXED
6. Items where `isArchived: true`
7. Items with placeholder pricing (VARIABLE_PRICING + no price set + name "Regular")
8. Categories with zero items
9. Categories with weird casing (`portrait`)
10. Duplicate or near-duplicate item names
11. Items missing artist info (we'd derive from name/description matching)
12. Items with placeholder description text
13. Image objects with broken URLs (HEAD-check each)
14. Orphaned IMAGE objects (referenced by no item)
15. Orphaned ITEM_VARIATIONs (parent deleted)
16. Unused custom attribute definitions
17. The `Media` and `Size` custom attribute definitions that conflict with
    the ITEM_OPTIONs of the same name

Output: `docs/superpowers/specs/reference/square-production-audit.md` —
read-only artifact. No writes.

### Phase B success criteria

Phase B is done when:

1. `pnpm sq:audit <snapshot.json>` runs in <30 seconds against the
   sandbox snapshot, emits a markdown report with one section per
   issue category (17 categories above), and exits 0.
2. The report's counts are independently verifiable (a column shows
   "found X of Y total items"; spot-check the numbers in psql or
   another script).
3. No writes to Square. The script never calls anything beyond
   `client.catalog.list`. The mirror script's hard production guard
   is preserved.
4. The report is committed to the repo under the path above and the
   handoff doc is updated to reflect Phase B completion.
5. Stop. Do NOT start Phase C — the user wants to read the report and
   decide cleanup rules together before any rules-YAML work begins.

### Phase B scope NON-goals

- No fixes applied. Just reporting.
- No image migration. Items missing images are flagged but not
  re-uploaded.
- No artist-attribute creation. That's Phase D.
- No "best-guess" data fixes. Decisions belong to the user in Phase C.
- No additional snapshots needed — re-use the latest production
  snapshot in `/tmp/`. If `/tmp/` is empty (machine rebooted),
  re-run `pnpm sq:snapshot production`.

## Next: Phase C (cleanup rules in YAML)

Phase C is intentionally NOT auto-started by Phase B. Stop after the audit
report ships; the user wants to read the report and decide cleanup rules
together before any rules-YAML work begins.

When you do start Phase C, the audit report is the canonical input.

## Why this is being handed off

The original session ran the brainstorm, wrote the design spec, planned
Phases 1-3, and started this cleanup workstream. Context was getting full.
Cleanup is a well-bounded operational workstream that fits cleanly in a
fresh context, so handing it off now preserves capacity for the bigger
architectural decisions ahead (Phase 4 catalog UX, Phase 5 GoAffPro, etc.).
