# Square catalog cleanup — work-in-progress hand-off

**Status:** Phase A (mirror production → sandbox) is **80% done**. The first
live `--apply` run failed on production-location-ID validation; the rewriter
has been patched but the patched version is **not yet tested**.

This doc tells the next session exactly what's done, what's pending, and the
specific failure mode to debug first.

---

## Goal of this workstream

Clean up the production Square catalog. To do that safely, we mirror prod →
sandbox first, run cleanup against sandbox (rehearsal), then apply the same
cleanup to production. The mirror script is the prerequisite.

Five phases total:

- **Phase A: Mirror prod → sandbox** ← we're here
- Phase B: Audit report (read-only, generates markdown showing problems)
- Phase C: Define cleanup rules in YAML (you and user sit down together)
- Phase D: Add `artist` custom attribute + assignments
- Phase E: Apply cleanup to sandbox first, verify, then promote to production

Phases B-E are designed but not yet plan-doc'd. Don't start them until A is
verified working end-to-end.

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

## What's broken (the next session's first task)

5. **Mirror's upsert step (live, not dry-run)** — first attempt failed with:

   ```
   INVALID_VALUE: Invalid location id: Object contains unknown location id: L182TWM8YVZSR.
   ```

   The production location `L182TWM8YVZSR` (Animeniacs Mobile, the main site)
   leaked through the rewriter into upsert payloads via `presentAtLocationIds`,
   `absentAtLocationIds`, `catalogV1Ids[].locationId`, and a few other paths.

   **A patch has been applied** to `scripts/square-cleanup/lib.ts` — the
   rewriter now strips `presentAtLocationIds`, `absentAtLocationIds`,
   `presentAtAllLocations`, `catalogV1Ids` at every level it appears, plus
   strips `categoryData.location_overrides` / `categoryData.locationOverrides`.

   **The patch has NOT been re-tested.** Re-run the mirror and watch what
   surfaces next:

   ```bash
   set -a && source .env.local && set +a
   SNAP=$(ls -t /tmp/animeniacs-square-snapshot-production-*.json | head -1)
   pnpm sq:mirror "$SNAP" --apply
   ```

   Likely next failures (in order of probability):
   - **More fields the rewriter doesn't know about.** Square's catalog
     payload has many optional fields; we discovered location IDs only
     after the first run. There may be more. The rewriter is conservative
     about stripping — add new strip rules as they surface, document them
     in the rewriter's docstring, re-run.
   - **Custom attribute definition shape mismatch.** Production has 5
     definitions, including 3 Square-system ones (`is_alcoholic`,
     `ecom_target_classic_site_id`, `ecom_gifting_enabled`). Sandbox may
     reject these because they're system-managed. If so, filter them out
     of the snapshot at upsert time (don't send if `app_visibility` starts
     with `APP_VISIBILITY_HIDDEN` and the key is one of Square's reserved
     keys).
   - **TAX validity in sandbox.** Production tax rates reference a real
     business address; sandbox may reject some configurations. If so, drop
     all TAX upserts and let sandbox auto-generate a default tax — items
     can be upserted without `taxIds` references.

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

## After Phase A works

Once `pnpm sq:mirror <snap> --apply` completes successfully (231 ITEMs in
sandbox), verify with:

```bash
pnpm sq:snapshot sandbox
# Compare counts to the production snapshot — should be identical or close.
```

Spot-check a few items in the Square sandbox dashboard:
https://app.squareupsandbox.com/dashboard/items/library

Then commit, tag the milestone, and surface for user review before
starting Phase B (audit report).

## Phase B preview

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

## Why this is being handed off

The original session ran the brainstorm, wrote the design spec, planned
Phases 1-3, and started this cleanup workstream. Context was getting full.
Cleanup is a well-bounded operational workstream that fits cleanly in a
fresh context, so handing it off now preserves capacity for the bigger
architectural decisions ahead (Phase 4 catalog UX, Phase 5 GoAffPro, etc.).
