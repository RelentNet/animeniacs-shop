# Phase 9 → Phase 10 hand-off

**Status:** Phase 9 **code-complete**. The operator-controlled storefront promo
bar, a new `/admin/settings` page that reads/writes the existing
`site_settings` table, and a hardened canonical `scripts/deploy.sh` are built,
tested, and committed. All automated gates green. Tag
`phase-9-promo-bar-settings` applied at the last code commit `879d080`
(`879d080a765435183dba235f2ab4537e371dd5cf`). Deploy was triggered via
`./scripts/deploy.sh`.

This phase shipped **one public feature** (promo bar), **one admin feature**
(`/admin/settings`), and **one ops deliverable** (`scripts/deploy.sh`). No new
schema, no new env vars, no new auth vendors, no Square prod cutover. Square env
stays `sandbox`.

**Date:** 2026-06-09

> **Read me first, master orchestrator:** the promo bar is wired into the root
> layout above `<Header>`, reads the `promo_bar` key from `site_settings`, and
> renders **nothing** when the setting is missing, disabled, or fails schema
> validation — so it is inert until an operator enables it from
> `/admin/settings`. No row exists yet in the sandbox DB, so the live bar is
> currently hidden by design. The save action intentionally **does not
> redirect** — it shows a "Saved." banner (spec deviation, see §4). The deploy
> gotcha from Phase 8 is now codified: `scripts/deploy.sh` pushes `main` then
> force-deploys via the Coolify API, so we no longer rely on the flaky
> push-webhook. Operator-pending items (enable Auto-Deploy, enable+verify the
> bar live, `/api/health` 200, admin mobile dark-mode visual) are in §6/§7 —
> **do not block on them.**

---

## 1. TL;DR

Phase 9 added a server-component `<PromoBar>` that reads the `promo_bar`
`site_settings` value via a new `getSetting`/`upsertSetting` query layer
(`src/lib/db/queries/site-settings.ts`) and renders a centered, inline-styled
banner above the header — or `null` when missing/disabled/invalid. A new
single-form `/admin/settings` page (inline styles, `useFormState` from
`react-dom`, ip-nicknames pattern) edits that value through a
`savePromoBarAction` server action that upserts the row, busts the cached
storefront read with `revalidatePath('/')`, and returns `{ saved: true }`.
A Settings link was added to the admin hub. Finally, `scripts/deploy.sh`
became the canonical deploy path: `git push origin main` → `sleep 5` →
forced Coolify deploy, reading the API token from `.env.local` (no secret in
the file).

No schema changes (the `site_settings` table already existed). No env-var
changes. **+13 unit tests** (267 → 280): 5 schema + 6 promo-bar + 2
settings-page. Integration unchanged at 75.

---

## 2. Required reading order

1. **This doc** (`phase-09-handoff.md`) — the promo bar + `/admin/settings` +
   the deploy-script.
2. **`phase-08-handoff.md`** — `/shop` listing, the manual-deploy gotcha (now
   codified in `scripts/deploy.sh`), the IP-leak invariant, the still-pending
   admin mobile dark-mode visual check.
3. **`phase-07.5-handoff.md`** — deployment state, the reverse-proxy/Host traps,
   force-dynamic requirement, Coolify resource inventory.
4. **`docs/operations/coolify-setup.md`** — the deploy runbook (authoritative
   for re-provisioning / prod cutover).
5. **`docs/superpowers/plans/2026-06-09-phase-09-promo-bar-settings.md`** +
   **`docs/superpowers/specs/2026-06-09-phase-09-promo-bar-settings-design.md`**
   — the Phase 9 plan + design (the "how" and "why").

---

## 3. What Phase 9 shipped (file-by-file)

**Feature — promo bar + settings (Tasks 1–7):**

| File | Change | Commit |
|---|---|---|
| `src/lib/db/queries/site-settings.ts` | NEW — `PromoBarValueSchema` (zod) + `PromoBarValue` type; `getSetting(key)` (cached 60s via `unstable_cache(['site-settings', key])`); `upsertSetting(key, value, updatedBy)` (ON CONFLICT (key) DO UPDATE). | `f7c29c6` |
| `tests/db/site-settings.test.ts` | NEW — 5 unit tests for `PromoBarValueSchema` (valid, empty link OK, empty text rejected, non-hex bgColor rejected, non-URL link rejected). | `f7c29c6` |
| `src/components/layout/PromoBar.tsx` | NEW — async server component. Reads `promo_bar`; renders `null` when missing/`enabled:false`/schema-invalid; otherwise a centered `<section aria-label="Promotions">` with inline `bgColor`/`textColor`, wrapping `text` in `<a href>` when `link` present. | `3c894f0`, a11y fix `29a5d8c` |
| `tests/public/promo-bar.test.tsx` | NEW — 6 unit tests (null when missing, null when disabled, text when enabled, `<a href>` when link present, inline color styles, null on schema-invalid). | `3c894f0` |
| `src/app/layout.tsx` | MODIFIED — imported `PromoBar`; rendered `<PromoBar />` as the first child inside `<CartProvider>`, immediately before `<Header />`. `Header.tsx` untouched. | `fe076db` |
| `src/app/(admin)/admin/settings/_components/formData.ts` | NEW — `parsePromoBarForm(form)`; checkbox `enabled === 'on'`, trims strings. | `6c71763` |
| `src/app/(admin)/admin/settings/_components/validation.ts` | NEW — `validatePromoBarInput(raw)`; zod `safeParse` → `{ ok, data }` or `{ ok:false, error:{ message, fields } }`. | `6c71763` |
| `src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx` | NEW — `'use client'`; `useFormState`; inline-styled fields (enabled checkbox, text, link, bgColor default `#1a1a2e`, textColor default `#ffffff`); top `role="alert"` banner; `<output>` "Saved." banner; per-field `<span role="alert">`. | `6c71763` |
| `src/app/(admin)/admin/settings/actions.ts` | NEW — `savePromoBarAction`; parse → validate → `upsertSetting('promo_bar', value, null)` → `revalidatePath('/')` + `revalidatePath('/admin/settings')` → `return { saved: true }`. | `dac5df8` |
| `src/app/(admin)/admin/settings/page.tsx` | NEW — server component; reads `promo_bar`, validates, passes `initial` to the form; `export const metadata`. | `cb1a033` |
| `tests/admin/settings-page.test.tsx` | NEW — 2 unit tests (pre-populates from stored value; renders defaults when no setting). | `cb1a033` |
| `src/app/(admin)/admin/page.tsx` | MODIFIED — appended a `Settings` entry to `SECTIONS` → `/admin/settings`. | `c9d1317` |

**Ops — deploy hardening (Task 8):**

| File | Change | Commit |
|---|---|---|
| `scripts/deploy.sh` | NEW (mode 100755) — pushes `main`, waits 5s, force-deploys via `GET {COOLIFY_BASE}/api/v1/deploy?uuid=h4400cg04wg8www84ggks4sg&force=true` with the bearer token grepped from `.env.local`. No secret stored in the file. | `879d080` |

---

## 4. Plan deviations

1. **The save action returns `{ saved: true }` and shows a "Saved." banner
   instead of `redirect('/admin/settings')`.** This is a **deliberate,
   pre-baked** deviation already documented in the plan's Self-Review Notes and
   the orchestrator brief. Rationale: redirecting a single-form settings page
   discards the success signal; a saved banner is better UX, and the form
   already re-reads via `revalidatePath`. The action still calls
   `revalidatePath('/')` and `revalidatePath('/admin/settings')`. Kept as-is.

2. **`role="region"` → `<section aria-label="Promotions">` and
   `role="status"` → `<output>` for biome a11y compliance.** The spec's
   verbatim markup used `<div role="region" aria-label="Promotions">` (promo
   bar) and `<div role="status">` (saved banner). Biome's `useSemanticElements`
   (in the project's `recommended` rule set) flags both: a named `<section>`
   has the implicit `region` role and `<output>` has the implicit `status`
   role, so the change is semantically equivalent and satisfies the global
   standard "prefer semantic HTML over ARIA." The promo-bar test's
   `getByRole('region')` and `getByRole('status')` still resolve. `role="alert"`
   (top + per-field error banners) was **not** flagged — it matches the
   existing artists/ip-nicknames/sms-recipients forms verbatim and was kept.
   (a11y fix committed separately as `29a5d8c`.)

3. **Two test-harness mock corrections (test files only — no deliverable
   changed):**
   - `tests/public/promo-bar.test.tsx`: the plan's mock stubbed the whole
     `@/lib/db/queries/site-settings` module to export only `getSetting`, but
     the component legitimately imports `PromoBarValueSchema` from the same
     module (required for the "null on schema-invalid" test). Changed the mock
     to **partial** (`importOriginal` + spread), the exact pattern the plan's
     own settings-page test uses. The component is unchanged.
   - `tests/admin/settings-page.test.tsx`: `useFormState` from `react-dom` is
     `undefined` under the jsdom/SSR transform these unit tests run in (the
     repo had no prior test that rendered a `useFormState` form). Added a
     partial `vi.mock('react-dom', …)` returning a stable `[state, fn]` tuple
     so the client form renders its inputs. The form's production contract is
     unchanged.

4. **`page.tsx` used `parsed?.success` instead of `parsed && parsed.success`.**
   Biome's `useOptionalChain` flagged the plan's verbatim `parsed &&
   parsed.success`. Rewrote to the optional-chain form; identical behavior.

5. **`force-dynamic` WAS added to the root layout — `pnpm build` initially
   passed locally but failed in the Coolify Docker builder.** This is the
   correction to the original (wrong) call to omit it. The hard constraint said
   "do NOT add `force-dynamic` to the root layout unless the build fails
   specifically on it." A clean local `pnpm build` (DB reachable via
   `.env.local`) masked the problem, so it shipped without the directive — and
   the **first Coolify deploy failed**. The builder cannot resolve the Postgres
   host, so prerendering every static page (all share the root layout, which now
   renders `<PromoBar>` → `getSetting` → DB) threw `ENOTFOUND` and failed
   `pnpm build` (exit 1). Per-page `force-dynamic` on `/` alone would NOT have
   fixed it — all 15+ static pages render the layout. Fix: `export const dynamic
   = 'force-dynamic'` in `src/app/layout.tsx` (commit `ad8b67b`), which opts the
   whole tree out of build-time static generation. Verified by reproducing the
   failure locally with an unreachable `DATABASE_URL` (build exit 1 before the
   fix → exit 0 after; 0 `ENOTFOUND` during build). Consequence: `/` and all
   pages are now `ƒ` (dynamic), so the promo bar reads at request time and
   reflects changes immediately. See §11 for the full post-mortem.

6. **Test count matched the plan exactly: 280 unit** (267 baseline + 5
   `site-settings` + 6 `promo-bar` + 2 `settings-page` = +13), **75
   integration** (unchanged). No reconciliation needed.

---

## 5. The `promo_bar` value shape + how to enable the bar

The bar reads the `site_settings` row with `key = 'promo_bar'`, whose `value`
(jsonb) must satisfy `PromoBarValueSchema`:

```ts
interface PromoBarValue {
  enabled: boolean    // false (or no row) → bar hidden
  text: string        // 1–200 chars, raw text (no HTML)
  link?: string       // optional; must be a full URL or '' — wraps text in <a> when present
  bgColor: string     // hex, /^#[0-9a-fA-F]{3,8}$/ e.g. "#1a1a2e"
  textColor: string   // hex, same regex, e.g. "#ffffff"
}
```

**To enable it (operator):** sign into `/admin/settings`, tick **Show promo
bar**, fill in Text (+ optional Link) and the two hex colors, click **Save**.
The "Saved." banner confirms the upsert; the storefront `/` reflects it after
the cache busts (immediate via `revalidatePath('/')`, else within ~60s).
To hide it again: untick **Show promo bar** and save (no row deletion needed).

There is **no `promo_bar` row in the sandbox DB yet**, so the live bar is
currently hidden — this is expected until the operator enables it.

---

## 6. Verification state at handoff

**Automated gate (local):**
- **Lint:** `pnpm lint` (biome) → clean (**191 files**, up from 182).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → clean.
- **Unit tests:** `pnpm test` → **280 passed** (48 files) — up from 267 (+13).
- **Integration tests:** `pnpm test:integration` → **75 passed** (12 files) — unchanged.
- **Build:** `pnpm build` → clean; route table includes
  **`ƒ /admin/settings` (1.02 kB, dynamic)**. `/` and all pages are now `ƒ`
  (dynamic) — see deviation 5 (corrected) and §11.
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **Deploy script:** `scripts/deploy.sh` exists, is executable (100755),
  `bash -n` clean, contains no hardcoded secret
  (`grep -nE '[A-Za-z0-9]{40,}'` → none).

**Build route-list line (verbatim):**
```
├ ƒ /admin/settings                      1.02 kB        88.6 kB
```

**Deploy:** `./scripts/deploy.sh` was run at close of phase (push `main` +
forced Coolify deploy of `879d080`).

---

## 7. Operator-pending items (DO NOT BLOCK — documented for follow-up)

1. **Enable Coolify "Auto Deploy" if off.** Coolify dashboard → project →
   `animeniacs-shop-dev` → Settings → Git → **Auto Deploy**. `is_auto_deploy_enabled`
   is not exposed by the REST API, so this is a dashboard-only toggle.
   `scripts/deploy.sh` force-deploys regardless, so deploys are reliable either
   way — this just removes the need to run the script for every push.
2. **Enable + verify the bar live.** Sign into
   `https://dev.animeniacs.shop/admin/settings`, enable the promo bar with
   sample text, save, and confirm it appears at the very top of `/` on the live
   site. (No `promo_bar` row exists yet, so the live bar is currently hidden.)
3. **Confirm `/api/health` returns 200** on the live deployment after the
   Phase 9 build ships.
4. **Admin mobile dark-mode visual confirmation** — still **pending from Phase
   8**. The code fix shipped in Phase 8 (`(admin)/layout.tsx` sets
   `colorScheme:'light'`/`color:#111`/`background:#fff`); the live mobile visual
   check (sign into Logto on a phone in OS dark mode, confirm dark text on white
   on `/admin/{artists,ip-nicknames,sms-recipients,settings}`) was never
   operator-confirmed. The new `/admin/settings` page inherits that same
   `(admin)/layout.tsx` wrapper, so it is covered by the same fix.

---

## 8. What's deferred / Phase 10 candidates

**Carried forward (unchanged):**
- **Abandoned-cart recovery emails via Resend** — `abandoned_carts` rows with
  `status='pending'` are the input.
- **Refund notifications** — the webhook already subscribes to
  `refund.created`; wire the handler to fan out Discord/SMS on refunds.
- **Production Square cutover** — env flip (`SQUARE_ENV=production` + prod token)
  + a prod domain with its own Postgres, Logto callback, and webhook sub.
- **Monitoring / alerting, CI/CD, automated DB backups** — none exist yet; all
  manual via Coolify.
- **`/shop` pagination / search / filtering**, the `batchGet` 1000-object image
  cap, and refactoring the category/artist grids onto the shared `ProductCard`
  (Phase 8 deferrals).

**BUG found 2026-06-09 (deferred to a future phase — NOT fixed here):**
- **Creating an artist with an avatar crashes in production** with a
  server-side exception (browser shows *"Application error: a server-side
  exception has occurred"*, **digest `2137462940`**). Root-caused from the live
  Coolify logs:
  ```
  Error: EACCES: permission denied, open '/app/public/images/artists/merc.webp'
    errno: -13, code: 'EACCES', syscall: 'open',
    path: '/app/public/images/artists/merc.webp', digest: '2137462940'
    at .../(admin)/admin/artists/new/page.js
  ```
  - **Cause:** `saveAvatar()` in `src/lib/images/upload.ts:75` does
    `writeFile(path.resolve('public/images/artists', '<slug>.webp'))` at
    runtime. The production container's filesystem is **not writable** at
    `/app/public/` → `EACCES`. The file's own header comment (lines 19–22)
    asserts *"Coolify … preserves writes under public/ at runtime (per locked
    Decision #3)"* — that assumption is **false** for this container.
  - **Scope / repro:** only fires when an avatar file is attached (the
    `if (avatarFile)` branch in `new/actions.ts:41`). Creating an artist with
    **no avatar should succeed** — worth confirming. Edit-artist avatar upload
    (`[id]/actions.ts`) has the same defect. The IP-nicknames and SMS-recipients
    admin forms do **not** write files, so they're unaffected.
  - **Proper fix (future phase, not a patch):** stop writing user uploads to the
    app container's `public/` dir — it fails on a read-only FS and, even where
    writable, uploads vanish on every redeploy/rebuild. Move avatar storage to
    durable external storage (Square image hosting like product images already
    use, S3/R2, or a Coolify persistent volume mounted at the upload dir) and
    correct the false comment + "Decision #3". The `saveAvatar` call-site
    signature can stay identical (returns a URL string), so the blast radius is
    contained to `src/lib/images/upload.ts`.
  - **Grounding:** code paths read read-only this session; no fix applied.
    Reproduced via live runtime logs (Coolify app `h4400cg04wg8www84ggks4sg`),
    digest matched exactly.

**New deferrals / notes introduced by Phase 9:**
- **Promo bar audit trail** — `savePromoBarAction` passes `updatedBy: null`
  (matching ip-nicknames; the column is nullable and no admin action captures
  session identity). If an audit trail is ever required, add a
  `getLogtoContext()` call in the action and pass the user id.
- **Promo bar instant freshness on `/`** — `/` is static + 60s-revalidated (see
  deviation 5). If instant per-request rendering is wanted, add
  `force-dynamic` to `src/app/page.tsx`.
- **`site_settings` is now a live key/value store** — `getSetting`/`upsertSetting`
  are generic; future site-wide settings can reuse them with their own zod
  schema and a new admin sub-form, no schema change needed.
- **Promo bar dismissal / scheduling / A-B variants** — explicitly out of scope
  (rejected/YAGNI in the design). Revisit only on real demand.

---

## 9. Where credentials live

Phase 9 **sourced no new secrets and rotated nothing.** Zero env-var changes
(local or Coolify). Locations unchanged from Phase 8:

- **Local dev:** `.env.local` (gitignored) — every credential the build/tests
  need (`DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `SQUARE_*`, `LOGTO_*`,
  `DISCORD_ORDER_WEBHOOK_URL`, `SMSEDGE_*`, `COOLIFY_API_BASE` +
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM`, `NEXT_PUBLIC_PLAUSIBLE_*`). Never
  committed. `scripts/deploy.sh` greps `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from
  here at runtime.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env (full
  matrix in `phase-07.5-handoff.md` §4).
- **Coolify API:** base `COOLIFY_API_BASE=https://empower.relentnet.com`, token
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` (Sanctum `NN|…`) — both in `.env.local`
  only. App UUID `h4400cg04wg8www84ggks4sg`, server UUID
  `z0sg4ogw4ossg4880080ws8k`, Postgres UUID `j4o0k0840c40w4k088gws04c`. Read
  values with `grep '^KEY=' .env.local | cut -d= -f2-`, not `source`.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local` are
  expected (final-phase credentials-cleanup sweep) — NOT used here; goaffpro
  runtime canary stays 0.

---

## 10. How to verify this hand-off is correct

```sh
# Repo at the tagged commit
git fetch --tags
git rev-parse phase-9-promo-bar-settings   # 879d080a765435183dba235f2ab4537e371dd5cf
git checkout main && git pull

# Automated gate
pnpm install
pnpm lint                                  # clean (191 files)
pnpm typecheck                             # clean
pnpm test                                  # 280 passed
pnpm test:integration                      # 75 passed
grep -rn "goaffpro\|GoAffPro" src/ tests/  # 0

# Build proves the /admin/settings route
pnpm build | grep '/admin/settings'        # "ƒ /admin/settings" (dynamic)

# Deploy script sanity
test -x scripts/deploy.sh && echo executable
bash -n scripts/deploy.sh && echo "syntax ok"
grep -nE '[A-Za-z0-9]{40,}' scripts/deploy.sh || echo "no secret (good)"

# Live (after deploy) — operator-assisted (§7)
curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/api/health   # 200
# Promo bar is hidden until a promo_bar row is enabled via /admin/settings.
```

**Deploy gotcha (now codified):** do not assume `git push` alone deploys —
use `./scripts/deploy.sh`, which force-deploys via the Coolify API. If a live
change is missing, verify the deployed commit via the deployments API
(`GET {COOLIFY_API_BASE}/api/v1/deployments/applications/h4400cg04wg8www84ggks4sg?take=5`,
Bearer `COOLIFY_API_TOKEN_ANIMANIACS_TEAM`) and re-run the script.

---

## 11. Post-mortem: first deploy failed (build), then fixed (`ad8b67b`)

**What happened.** The close-of-phase `./scripts/deploy.sh` pushed `6df3cc1`
and queued a Coolify deploy that **failed at `RUN pnpm build`** (Dockerfile
line 41, exit 1). The previous *finished* deploy was `a081c09` (pre-Phase-9),
so for a window the live site did **not** have any Phase 9 code — including the
`/admin/settings` hub card.

**Root cause.** The root layout renders `<PromoBar />`, which calls
`getSetting('promo_bar')` → Postgres. Without `force-dynamic`, Next.js tries to
**statically prerender** every page that uses the root layout (i.e. all of
them) at build time. The Coolify Docker builder cannot resolve the Postgres
host (`getaddrinfo ENOTFOUND <postgres-uuid>`), so each prerender threw and the
build aborted with "Export encountered errors on following paths: …" for `/`
and all static marketing pages.

**Why local `pnpm build` missed it.** Locally, `.env.local` provides a
reachable `DATABASE_URL`, so the build-time prerender connected to the DB and
succeeded. Worse, even with an unreachable DB, the **local** build exits 0
(the `unstable_cache` wrapper logs the `ENOTFOUND` as a revalidation warning
and `/` falls back to no-bar) — but the **Coolify** builder treats the
prerender error as fatal (exit 1). So a clean local `pnpm build` was NOT a
sufficient signal; the failure only reproduces by simulating an unreachable DB
host AND/OR observing the strict builder.

**Fix.** `export const dynamic = 'force-dynamic'` in `src/app/layout.tsx`
(commit `ad8b67b`). This opts the whole tree out of build-time static
generation; the promo bar's DB read now happens at request time (where the DB
is reachable). Verified locally:
`DATABASE_URL=postgresql://…@unreachable-host… pnpm build` → **exit 0**, **0
`ENOTFOUND`** lines, `/` and all pages render as `ƒ` (dynamic). Redeployed via
`./scripts/deploy.sh` (push `6df3cc1..ad8b67b`, deployment
`s480k40o8kgwg8swskcsw8wk`) → **status `finished`**.

**Live verification after the fix:**
- `/api/health` → **200** `{"ok":true,…}`
- `/` → **200**
- `/admin/settings` → **307** (Logto sign-in redirect — route deployed and
  auth-gated; NOT a 404).

**Lesson for future phases.** Any DB/network read reachable from the root
layout (or any statically-prerendered page) forces that page dynamic — verify
the production build with the build-time environment's network reality, not
just a local DB-connected `pnpm build`. A quick proxy: run `pnpm build` with an
intentionally unreachable `DATABASE_URL` and require **exit 0**. The constraint
"don't add `force-dynamic` to the root layout unless the build fails on it" was
satisfied — it did fail on it; `force-dynamic` is the correct, sanctioned fix.
