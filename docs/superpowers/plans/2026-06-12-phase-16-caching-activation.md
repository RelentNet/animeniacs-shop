# Phase 16 — Rendering/Caching Pass + Feature Activation — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-12-phase-16-caching-activation-design.md`
**Method:** strict TDD per task (failing test → confirm fail → implement →
confirm pass → commit per task), same as Phases 11–15.
**Hard constraints:** §11 of the spec. Deploy ONLY via `./scripts/deploy.sh`.
`SQUARE_ENV=sandbox`. goaffpro canary 0. Use `corepack pnpm` for everything
(the bare-`pnpm` prebuild is bypassed — Phase 10+ convention). Repo-wide
`pnpm lint` is red on pre-existing CRLF files — lint by scoping
`biome check` to the files you touched. The workstation cannot reach the
dev DB; anything DB-live happens via the deployed app.

## Baseline verification

```sh
git checkout main && git pull && git rev-parse HEAD   # expect aa0c6e9 or later
corepack pnpm install && corepack pnpm content:build
corepack pnpm typecheck                                # clean
corepack pnpm test                                     # 519 passed (checkout happy-path may flake under load; passes in isolation)
```

## Task 1: Build-phase guard in `getSetting`

`src/lib/db/queries/site-settings.ts`: during
`NEXT_PHASE === 'phase-production-build'`, `getSetting` returns `null`
without constructing the cache or touching `db` (mirror the guard idiom in
`src/lib/auth.ts:28`). Test: set/unset `NEXT_PHASE` (save+restore in the
test), spy/mock the db client, assert no query + `null` result at build,
and the normal cached path otherwise.

## Task 2: Drop the root `force-dynamic`; make the unreachable-DB build green

1. Remove `export const dynamic = 'force-dynamic'` (and its now-false
   comment) from `src/app/layout.tsx`; replace with a short comment pointing
   at the spec §4 (build tolerance lives in the data layer).
2. Run the canon gate:
   `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
   — triage every page that now fails the static-generation pass:
   decorative data → build guard (Task 1 pattern); genuinely per-request →
   explicit `export const dynamic = 'force-dynamic'` on that page with a
   one-line reason. `/orders/lookup`: check why it carries `force-dynamic`
   (spec §3) — drop it if the page reads nothing per-request.
3. Windows quirk: the build exits 1 on an `EPERM: symlink` AFTER a clean
   compile — judge by "Compiled successfully" + "Generating static pages"
   + 0 ENOTFOUND/ECONNREFUSED, not exit code.
4. Add the segment-config regression tests (spec §12) for the routes touched
   so far.

## Task 3: ISR on artist + category pages

- `src/app/artist/page.tsx`: replace its `force-dynamic` with
  `export const revalidate = 300`; build-guard its data read (empty state at
  build — spec §4).
- `src/app/artist/[slug]/page.tsx` + `src/app/category/[slug]/page.tsx`:
  add `export const revalidate = 300`. NO `generateStaticParams` (on-demand
  ISR; keeps the builder away from the DB).
- `/shop` and `/product/[id]` are intentionally untouched (spec §3 — do not
  "fix" them).
- Extend the segment-config tests; re-run the unreachable-DB build.

## Task 4: Promo propagation — `revalidatePath('/', 'layout')`

`src/app/(admin)/admin/settings/actions.ts`: the `revalidatePath('/')` call
becomes `revalidatePath('/', 'layout')` (spec §5). Update/extend its test to
pin the `'layout'` argument.

## Task 5: Admin nav back-link

`(admin)/layout.tsx` renders a slim admin header with an "← Admin home" link
to `/admin` on every admin page (spec §6). Component test first. Keep it
boring — no dashboard work.

## Task 6: Wire the abandoned-cart cron trigger

Spec §7. `CRON_SECRET` is already set in the Coolify runtime env and in
`.env.local`. Create a Coolify scheduled task (every 15 min) running the
in-container `node -e "fetch(...)"` command against
`http://localhost:3000/api/cron/abandoned-carts`. Try the Coolify API first
(token: `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` in `.env.local`, base
`https://empower.relentnet.com`, app uuid `h4400cg04wg8www84ggks4sg`); if
this Coolify version doesn't expose scheduled-task CRUD, write the exact UI
steps into the handoff for the operator and flag it. No GitHub Actions —
none exist in this repo and we are not adding CI as a side effect.

## Task 7: Final gates + deploy

```sh
corepack pnpm typecheck
corepack pnpm test
grep -rni "logto" src/ tests/                    # 0
grep -rn "goaffpro\|GoAffPro" src/ tests/        # 0
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
./scripts/deploy.sh
```

Post-deploy (read-only probes from the workstation):
`/api/health` 200; `/` 200 and promo bar appears within ~60 s of a settings
save; `/artist` curled twice (regeneration warm-up, spec §4); `/admin` +
`/account` 307 anon; sign-in still works (operator).

## Task 8: Live verification matrix (with the operator)

Run spec §8 V1–V7 in order. Resend-dependent legs (receipt, lifecycle,
abandoned-cart emails) are recorded as **partial: blocked on Resend** if the
operator hasn't set `RESEND_API_KEY`/`RESEND_FROM_EMAIL` yet — do not skip
the non-email half of those rows (order row, webhook, `processed` count).
Manual cron trigger for V6:
`curl -X POST -H "x-cron-secret: <CRON_SECRET from .env.local>" https://dev.animeniacs.shop/api/cron/abandoned-carts`.

## Task 9: Handoff + tag

Write `docs/superpowers/specs/reference/phase-16-handoff.md` (same skeleton
as phase-15: TL;DR, file-by-file, verification state incl. the V1–V7 matrix
results, plan deviations, operator-pending, Phase 17 candidates). Tag
`phase-16-caching-activation`. Report back to the Master session.

## Constraints (must hold throughout)

- Never edit `SQUARE_ENV`, goaffpro values, or deploy outside `deploy.sh`.
- `(account)`/`(admin)` keep `force-dynamic`; IDOR + admin-gate tests green.
- No new env var may be required at build time.
- Commit per task; conventional-commit style matching the existing log.
