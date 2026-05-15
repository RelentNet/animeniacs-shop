# GoAffPro probe & artist-linkage design — hand-off

**Status:** GoAffPro API tokens received and stored in `.env.local`. A 30-second
auth-header probe was run; the rest of the probe + the design discussion are
scoped for a fresh subagent context (this workstream is well-bounded and the
parent session was getting heavy).

## Goal of this workstream

Two outcomes:

1. **A probe doc** capturing the actual response shapes from GoAffPro's
   admin API (per the standing rule: probe every external API before
   writing code that depends on it).
2. **A recommendation memo** on how to link Square products to GoAffPro
   artists, presented to the user with the trade-offs laid out so they
   can pick one of three branches.

The user already has the question framed in their head:

> *"Maybe we also get on GoAffPro API see what we have there and see
>  how we will link products to artist, and see if we will [need]
>  another field for every item."*

The output is **not** an implementation. No code that hits GoAffPro at
runtime in the actual Next.js app. That's Phase 5 of the main project.
This workstream just produces the data + the design decision so Phase 5
can be planned cleanly later.

## What's already known (don't redo)

### Auth header confirmed

A live curl against `https://api.goaffpro.com/v1/admin/affiliates` confirmed:

- ✅ `x-goaffpro-access-token: <admin token>` works → 200 OK
- ❌ `Authorization: Bearer <admin token>` returns 403 with error message:
  *"x-goaffpro-access-token missing from the headers. Kindly generate
   and use the token from Settings -> Advanced Settings tab -> API
   Keys section"*

So the admin endpoints use the custom `x-goaffpro-access-token` header,
not standard Bearer.

The public/storefront token uses `x-goaffpro-public-token` per the
OpenAPI swagger summary captured during the original brainstorm. The
probe should confirm this once for completeness.

### Tokens are in .env.local

```
GOAFFPRO_ADMIN_API_KEY     (62-byte hex)
GOAFFPRO_PUBLIC_TOKEN      (62-byte hex)
```

Both gitignored. Never commit them, never echo them in logs.

### Affiliate count

The first probe response had at least 62 empty-object preview entries in
the `affiliates[]` array — but they showed as `{}` because the response
was truncated to 200 bytes in the probe. **The actual data is in there;
the truncation hid it.** The full probe should:

- Fetch `/v1/admin/affiliates` in full
- Pretty-print one complete affiliate object so we know every field
- Tally counts: total affiliates, distinct labels/types, profile-image
  presence, social-link presence, custom-field usage
- Probe one specific affiliate via `/v1/admin/affiliates/{id}` to see
  if the per-affiliate response carries different fields than the list

## Concrete deliverables

1. **`scripts/goaffpro/probe.ts`** — a standalone TypeScript probe script
   (mirrors the existing `scripts/square-cleanup/probe.ts` pattern). Read-
   only. Hits the admin API with `x-goaffpro-access-token`. Writes a
   JSON dump to `/tmp/goaffpro-snapshot-<ts>.json` for archival.

2. **`docs/superpowers/specs/reference/goaffpro-api-probes.md`** — the
   capture-as-markdown reference doc. Sections:
   - Auth (confirmed already; just write it down)
   - Endpoints exercised + response shapes
   - Affiliate object schema (every field, with examples)
   - Counts (total affiliates, label distribution, etc.)
   - Anything weird / surprising / undocumented

3. **A short recommendation memo at the end of `goaffpro-api-probes.md`**
   covering the three artist-linkage branches:

   - **Branch A** — Square custom attribute `artist` (slug) on every
     ITEM. Site reads the slug, joins to GoAffPro at render time for
     the artist profile (bio/image/socials). This was the original spec
     design.
   - **Branch B** — Square's existing `Artist` category tree. Each
     artist gets a Square sub-category under `Artist`; items are
     assigned. Site reads the category, queries GoAffPro by name to
     find the profile.
   - **Branch C** — Combined: `artist` custom attribute *and* category
     assignment. Redundant but lets the seller see artist in two places
     in the Square dashboard.

   For each branch, the memo should answer:
   - How many places does staff need to remember to set the artist when
     uploading a new product?
   - What breaks if a GoAffPro affiliate's name/slug changes?
   - How does this integrate with the cleanup work already done?
     (Cleanup removed 396 orphan images and patched the custom-attr-
     def script; we still have the 30 artist-named "graveyard" SKUs to
     deal with separately.)
   - One-line bottom-line recommendation.

   Don't *make the decision* — the user wants to see the data and pick.
   But do offer a ranked preference with rationale.

## Strict non-goals

- ❌ Don't add the `artist` custom attribute definition to either
  Square environment. That's the user's call after reading the memo.
- ❌ Don't migrate any production GoAffPro affiliate data anywhere.
- ❌ Don't touch the existing Square cleanup workstream. It's done at
  commit `b5715dd`.
- ❌ Don't start Phase 5 (the actual app-side GoAffPro integration).
  That requires the design decision first, then a full plan doc.

## Context the next session needs (recent history)

Recent commits in the repo:

```
b5715dd Phase C apply: production cleanup landed (396/398 ops succeeded)
8160b04 Phase C first iteration — automatic-win cleanup, sandbox-rehearsed
c9abf17 Phase B complete — production catalog audit report
95e9154 Handoff doc: mark Phase A complete, scope Phase B for next session
75359ea Phase A complete — production catalog mirrored to sandbox
```

The cleanup workstream is paused mid-stride: 396 production images
gone, 2 LitCommerce-owned custom-attribute defs still in production
(user can delete them via Square dashboard if they want; not a
blocker). The GoAffPro design decision is a prerequisite for resuming
the cleanup workstream's "Pattern 3" (the 30 artist-named graveyard
SKUs) — we can't decide what to do with the Bxnny/Saru/Merc
placeholder items until we know how the artist linkage works.

So the order of operations after this hand-off completes:

1. User reads the probe doc + memo
2. User picks a branch (A / B / C)
3. Either continue cleanup ("now we know what to do with the 30
   graveyard SKUs") OR pivot to Phase 5 planning ("write the
   implementation plan for the GoAffPro integration")

## Quality bar

- `pnpm lint` clean
- `pnpm typecheck` clean
- `scripts/goaffpro/probe.ts` uses the existing `scripts/**` biome
  override (permissive: `noExplicitAny`, `noNonNullAssertion`, etc.)
- The probe script is read-only — `--dry-run` semantics aren't even
  meaningful because there are no writes to gate. Just a single
  command: `pnpm goaffpro:probe`
- Commit it under a clear message: `GoAffPro API probe + artist
  linkage design memo`

## When done

Surface a short summary covering:

- Confirmed auth header(s)
- Affiliate count + label distribution (artist vs affiliate vs other)
- The 3 branches with one-line trade-off each
- Your ranked recommendation
- Commit hash
- Explicit "stopping here, ready for user decision" message

Do NOT start Phase 5 planning. Do NOT touch Square. Do NOT touch
production GoAffPro data. Stop after the probe + memo + commit.
