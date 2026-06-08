# Phase 8 master-terminal resumption handoff

**Status:** Master-orchestrator role transfer. **No phase work is in
progress.** Phase 7.5 is fully closed (deployed + smoked + tagged).
Phase 8 has NOT been started — no brainstorm, no spec, no plan yet.

**Date:** 2026-06-08
**Resuming agent should:** open a fresh master terminal, read this doc
end to end, read the required-reading docs, run baseline verification,
then begin Phase 8 brainstorming from a clean slate using
`superpowers:brainstorming`.

This document is the entire portable state needed to assume the
master-orchestrator role. It is modeled on
`phase-05-brainstorm-resumption.md` (which bootstrapped the terminal
that owned Phases 5 → 7.5). Treat decisions captured in the per-phase
handoff docs as authoritative — do not re-litigate them.

---

## Why this handoff exists

The current master terminal owned the project from "finish Phase 5
brainstorming" through "Phase 7.5 closed" — Phases 5, 6, 7, and 7.5,
plus two live-ops interventions (graveyard-SKU restore + acrylic
repricing during a convention). Its context has grown large enough
that the operator called the pause-and-spawn trigger:

> "context is getting long ... we need to look at a new hand off for
> our 3rd master orchestrator as context is getting large."

This is the **same trigger** that spawned the current master terminal
out of the one that owned Phases 1–4 + start-of-5. It is a natural
cycle, not a failure. Each new master terminal inherits the role
afresh with a smaller, more focused context.

This is the **3rd master orchestrator** of the project.

---

## The master-orchestrator role (what you are inheriting)

You own the project across all remaining phases. Your job is the
recurring cycle below; you NEVER execute implementation plans yourself.

### The phase cycle you own

For each phase N (starting with Phase 8):

1. **Bootstrap** — read the previous phase's handoff doc, run baseline
   verification.
2. **Brainstorm** — `superpowers:brainstorming`. Ask clarifying
   questions (multiple-choice; operator strongly prefers FEW questions
   — see "Operator working style" below). Present design sections,
   get approval. Output: a design spec at
   `docs/superpowers/specs/YYYY-MM-DD-phase-NN-<topic>-design.md`.
3. **Spec self-review** — placeholder/consistency/scope/ambiguity check.
4. **Operator reviews the written spec** — one gate.
5. **Plan** — `superpowers:writing-plans`. Output:
   `docs/superpowers/plans/YYYY-MM-DD-phase-NN-<topic>.md`.
6. **Write the execution-handoff prompt** — text the operator pastes
   into a SEPARATE execution terminal. **It MUST instruct the
   execution agent to write `docs/superpowers/specs/reference/phase-NN-handoff.md`
   at the end of the phase.** Without that doc, the chain breaks.
7. **STOP. Surface to operator. Do NOT run the plan.**
8. **Wait** — operator runs the execution terminal, which ships
   commits, tags `phase-N-<topic>`, writes its handoff doc.
9. **Operator returns** with "Phase N done, here's the handoff."
10. **Loop** — read the new handoff, begin Phase N+1.

### Hard rules for the master-orchestrator role (every phase)

- **Never run an implementation plan yourself.** Execution is always a
  separate terminal. If the operator asks you to run a plan directly,
  push back — that's what the execution terminal is for. The split is
  what keeps your context lean enough to last across phases.
- **Never re-litigate decisions** captured in any prior phase's handoff
  doc.
- **Always use multiple-choice format** for clarifying questions.
- **Always write the "produce phase-NN-handoff.md at the end"
  instruction** into every execution-handoff prompt.
- **Only invoke `superpowers:brainstorming` and
  `superpowers:writing-plans`.** Never `superpowers:executing-plans`
  or any implementation skill.
- **Commit only** spec docs, plan docs, and resumption/handoff doc
  tweaks. No code commits — EXCEPT live-ops interventions (see below).

### The one documented exception: live-ops interventions

The previous master made two **direct production interventions** when
the operator was live at a convention and needed an urgent fix:

1. Restored 30 archived artist in-person-sales SKUs (`MercDaArtist
   Acrylic`, etc.) that a Phase 4 cleanup script had wrongly archived.
   Wrote + ran `scripts/square-cleanup/unarchive-graveyard-skus.ts`.
2. Bumped all 14 acrylic SKUs to $60 in production Square via a
   one-shot script.

These violated the "no code commits / never run things yourself" rule
**deliberately**, because the operator was under live time pressure and
the work was operational (Square catalog data), not feature
development. If you face the same situation — operator live, urgent,
operational not feature — use the same judgment: act, audit-log
everything, commit the tooling, tell the operator exactly what you did.
Otherwise, stay in the orchestrator lane.

### When to spawn the NEXT (4th) master terminal

Watch for the same signal that triggered this handoff:
- **Felt-experience:** more energy goes into re-reading prior context
  than thinking about the current question.
- **Operator-directed:** the operator says "context is getting big."
- **Length:** many phase cycles accumulated.

When it fires: write a fresh `phase-NN-master-resumption.md` modeled on
THIS doc, commit it, surface a bootstrap prompt for the next master,
stop. Don't push through.

---

## Operator working style (important — learned over Phases 5–7.5)

The operator gave explicit, repeated direction that shapes how you
should run the cycle:

- **Minimize questions.** Direct quote: "I want to answer the least
  amount of question and have you do what you think is best. and tell
  me what the phase agents should do. let them do more so your context
  doesnt get crazy." Bundle clarifying questions; self-lock everything
  that isn't genuinely operator-territory (business rules, scope,
  brand, money, credentials). Lean on the execution agent — the plan
  doesn't have to micromanage; capable execution agents resolve
  in-the-moment ambiguity.
- **Surface ONE consolidated scope question** at the start of a phase
  rather than many small ones, then proceed on best judgment.
- **The operator sometimes works against a live deadline** (conventions,
  shows). When they say "going because we are live at a show" or
  similar, drop ceremony, act fast, explain tersely.
- **The operator runs execution in separate terminals** and returns
  with a pasted handoff summary. That's the loop.

---

## Required reading order (resuming agent)

1. **This document, front to back.**
2. `docs/superpowers/specs/reference/phase-07.5-handoff.md` — the most
   recent phase. Deploy state + the 14 deviations + Phase 8 candidates.
   **Most load-bearing doc for Phase 8.**
3. `docs/superpowers/specs/reference/phase-07-handoff.md` — the
   checkout feature set, schema, hard constraints. Its "Sandbox smoke
   status" now reads PASSED (2026-06-08).
4. `docs/superpowers/specs/reference/phase-06-handoff.md` — cart.
5. `docs/superpowers/specs/reference/phase-05-handoff.md` — PDP +
   ip_nicknames + /category.
6. `docs/superpowers/specs/reference/phase-04-handoff.md` — artist
   system + the original hard-constraint set (GoAffPro retirement,
   IP-never-public, sandbox-first).
7. `docs/operations/coolify-setup.md` — the deploy runbook (authoritative
   for re-provisioning or prod cutover).
8. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — the
   master design doc. Many sections carry deprecation banners; the
   per-phase handoffs are the current truth where they conflict.
   **Specifically: design spec §15's `OrderAlert` SMS envelope is WRONG
   — see Phase 7.5 deviation 13. The real sms-edge contract is
   `{ to, type: 'Generic', payload: { text } }`.**

You inherit NO obligation to re-read Phases 1–3 history; it's in commit
history + the design-spec banners. The handoff chain is sufficient.

---

## Baseline verification (run before starting Phase 8)

```sh
cd ~/code/animeniacs-shop
git fetch --tags
git describe --tags --abbrev=0       # → phase-7.5-first-deploy
git rev-parse --short HEAD           # → d1963a2 or descendant
git status --short                   # → clean
pnpm install
pnpm lint                            # biome clean (178 files)
pnpm typecheck                       # tsc clean
pnpm test                            # 255 unit passing
pnpm test:integration                # 75 integration passing
grep -rn "goaffpro\|GoAffPro" src/ tests/   # → zero

# Live deploy is up:
curl -s https://dev.animeniacs.shop/api/health        # → 200 {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://dev.animeniacs.shop/api/webhooks/square -d '{}'   # → 401
```

If any fail, stop and investigate before Phase 8 work. If
`/api/webhooks/square` returns 500 not 401, the
`SQUARE_WEBHOOK_SIGNATURE_KEY` is missing on Coolify — see Phase 7.5
handoff §11.

---

## Project state snapshot (as of 2026-06-08)

### What's shipped, phase by phase

- **Phase 1** — foundation (Next.js, Docker, Postgres, Logto, Plausible).
- **Phase 2** — schema (`event_logos`, `sms_recipients`, `wishlists`,
  `reviews`, `abandoned_carts`, `customer_link`, `product_cache`,
  `order_log`, `site_settings`).
- **Phase 3** — Square catalog SDK integration (partial; some tasks
  deferred and later picked up in Phase 5).
- **Phase 4** — artist system (replaced the planned GoAffPro
  integration with an in-house `artists` table). `/admin/artists`,
  `/artist`, `/artist/[slug]`, `<ArtistMetaLine>`. 15 artists seeded.
- **Phase 5** — Product Detail Page. `/product/[id]`, `/category/[slug]`,
  `/admin/ip-nicknames`, `ip_nicknames` table, `getProductById`
  read-through cache, `<MockupGallery>`, `<VariantPicker>`.
- **Phase 6** — cart. `<CartProvider>` + localStorage, `<CartDrawer>`
  (radix-dialog), `<CartButton>`, `/api/cart/hydrate`. Drawer Checkout
  button rendered disabled. Also a styling baseline (color-scheme:
  light, header/footer readable) added by the master terminal.
- **Phase 7** — checkout. `/api/checkout` (Square Order + Payment Link),
  `/checkout/success`, `/api/webhooks/square` (HMAC + idempotent
  Discord/SMS fan-out), `/admin/sms-recipients` CRUD. Square SDK v44
  collapsed order+paymentLink into one atomic call.
- **Phase 7.5** — FIRST DEPLOY. `dev.animeniacs.shop` live on Coolify
  (Square sandbox). Deferred Phase 7 smoke ran green. Four
  deploy-surfaced bugs fixed (Logto reverse-proxy callback, rotated
  Logto secret, missing Square webhook sub created via API, sms-edge
  body contract). `/admin` index hub added. Tag `phase-7.5-first-deploy`
  at `d1963a2`.

### Verification state (Phase 7.5 handoff)

- lint clean (178 files), typecheck clean
- 255 unit + 75 integration passing
- 36 route files, goaffpro canary 0
- Live: `https://dev.animeniacs.shop` `running:healthy`, Square sandbox
- Local DB: 15 active artists, 0 ip_nicknames, 0 sms_recipients (local);
  the LIVE deploy's Postgres has real smoke data (63 `order_log`
  payment.created rows, completed `abandoned_carts`).

### Live deploy resource inventory (Coolify)

- Server `animaniacs-shared-host` UUID `z0sg4ogw4ossg4880080ws8k`,
  project `website`, env `production`.
- App `animeniacs-shop-dev` UUID `h4400cg04wg8www84ggks4sg`
  (dockercompose, `/compose.yml`, git `itkujo/animeniacs-shop` branch
  `main`, auto-deploy on, domain `https://dev.animeniacs.shop`,
  expose 3000).
- Postgres `animeniacs-shop-postgres` UUID `j4o0k0840c40w4k088gws04c`
  (postgres:16-alpine).
- Logto: REUSED Phase 4 "Animeniacs Admin" Traditional Web app, App ID
  `u7ujmvfji0ecq3cqjp7nx`, endpoint `https://auth.animeniacs.shop`.
  **Live secret is `PPBbYgSujGjpSO2ElistafZwabYE9ktb` (rotated; old
  `xU0yUgaQ…` is dead — scrub from any notes).**
- Square sandbox: location `L1T00JYXSKVM3`, webhook subscription
  `wbhk_ffebd0a703d14b3b8e0c227c107853f8`, signature key
  `cTde1ADACNS3Va-dM82lNA`.
- **Operator has NO SSH to the Coolify host.** All log/DB access via
  the Coolify UI (Postgres resource has a psql terminal).

---

## Hard constraints (still in force from Phase 4 — NEVER violate)

1. **No GoAffPro / affiliate / commission code at runtime.**
   `grep -rn "goaffpro\|GoAffPro" src/ tests/` must stay zero. The
   probe script under `scripts/goaffpro/` is historical reference only.
2. **No `artist` Square custom attribute definition.** Artists resolve
   via the local `artists` table joined by `squareCategoryId`.
3. **No new auth vendors.** Reuse Logto + the `(admin)` route group.
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission
   tracking.** (Phase 7 added one nullable column `order_log.event_id`;
   that's the ceiling for order-tracking schema growth without a
   strong reason.)
6. **Sandbox-first for any production write.** Everything is
   `SQUARE_ENV=sandbox` until the operator explicitly flips to prod.
   Prod cutover is its own deferred work.
7. **IP categories never public via their literal Square name.** Two
   regression tests enforce this:
   `tests/public/product-detail-page.test.tsx` (breadcrumb has no IP
   segment) and `tests/public/category-page.test.tsx` (DOM never
   contains the literal Square category name). Both must stay green.

---

## Phase 8 starting point (NOT locked — brainstorm decides)

The Phase 7.5 handoff §9 lists three feature candidates. Now that a
live deploy exists, each can include a real "deploy smoke" acceptance
step instead of deferring verification.

1. **Promo bar + `/admin/settings`** — site-settings-driven
   announcement bar (the `site_settings` table from Phase 2 is unused
   and ready). Smallest-to-medium. Unblocks the long-deferred 20% promo.
2. **Abandoned-cart recovery emails via Resend** — input is
   `abandoned_carts` rows with `status='pending'`. Revenue lever.
   Needs Resend signup (`RESEND_API_KEY` + `RESEND_AUDIENCE_ID` slots
   exist in `.env.example`, unset), an email template, an unsubscribe
   path, and a cron mechanism (Coolify job or external scheduler).
   Largest of the three.
3. **Refund notifications** — the webhook already subscribes to
   `refund.created` (events land in `order_log` but don't fan out).
   Smallest: add a Discord/SMS message variant for refunds. Touches
   `handle-event.ts`, `notifications/discord.ts`, `notifications/sms.ts`.

**Strong recommendation to fold into whichever feature is chosen
(quick wins, low risk):**

- **Remove diagnostic env-logging** in `src/lib/env.ts` +
  `src/instrumentation.ts` (Phase 7.5 deviation 7) now the deploy is
  stable.
- **Fix admin mobile dark-mode** — `/admin/{artists,ip-nicknames,
  sms-recipients}` render blank text in mobile dark mode. The `/admin`
  hub is already fixed; the rest need an admin-shell pass setting
  explicit colors. (This is the same class of bug as the Phase 6
  white-on-white the operator already flagged once — they care about
  being able to SEE and test the admin UI.)

**Also genuinely worth considering as its own candidate:**

- **`/shop` listing page** — the header `/shop` link currently 404s.
  PDPs only reachable via direct `/product/<id>` URL. `/artist` returns
  200 but shows "No artists yet" because the LOCAL dev DB is empty
  (the live deploy's DB and the operator's local DB are different
  Postgres instances). A `/shop` listing closes a visible gap for any
  real visitor.

**Production cutover** is a separate track the operator may prioritize
over any feature — the handoff explicitly offers "(b) prioritize
production cutover" as an option. If chosen, `docs/operations/
coolify-setup.md` is the runbook; it's a domain + prod Postgres + prod
Square token + prod Logto callback + prod webhook sub, then flip
`SQUARE_ENV=production`.

The FIRST thing to do in Phase 8 brainstorming is surface ONE
consolidated scope question to the operator: which candidate (1/2/3),
or production cutover, or `/shop` — and whether to fold in the two
quick-win cleanups. Then self-lock the rest.

---

## Known traps / lessons the previous master learned the hard way

- **Reverse-proxy `Host` header (Traefik/Coolify):** never gate runtime
  behavior on `request.url` / `request.url.hostname` / the incoming
  `Host` header. Behind Traefik the app sees an internal container
  host, not the public domain. This bit the Logto callback (Phase 7.5
  deviation 9). Use `logtoConfig.baseUrl` / `NEXT_PUBLIC_SITE_URL` /
  `X-Forwarded-*`. This is also documented in the global AGENTS.md.
- **Coolify build cache staleness:** if a deploy ships stale code, use
  "Force rebuild without cache," not just "Deploy."
- **Next.js static prerender + secrets:** routes that read auth
  cookies / DB / secret env at request time must
  `export const dynamic = 'force-dynamic'`, or the build-time prerender
  crashes because secret env vars aren't present at build (only
  `is_buildtime=true` vars are). Bit four routes in Phase 7.5.
- **Square SDK v44 checkout:** order + payment link is ONE atomic call
  (`checkout.paymentLinks.create` with an inline order body), not two.
  Phase 7 plan assumed two; reality is one.
- **vitest mocks:** use `vi.hoisted()` for `vi.mock()` factory deps, or
  you get "Cannot access 'mockX' before initialization."
- **sms-edge contract:** `{ to, type: 'Generic', payload: { text } }`
  to `POST {SMSEDGE_BASE_URL}/sms` with `Authorization: Bearer
  {SMSEDGE_TOKEN}`. Design spec §15 is WRONG. Source of truth is
  `@itkujo/sms-core` `src/templates/render.ts`.
- **The `tsx`/Node env-file gotcha:** the square-cleanup scripts need
  `--env-file=.env.local` (Node 26 + tsx 4.21 don't auto-load it). The
  `sq:unarchive-graveyard` npm script already has the flag; if you add
  new scripts, include it.

---

## What the resuming agent should NOT do

- Do not start writing Phase 8 code, scaffolding, or migrations. You
  brainstorm + spec + plan, then hand off.
- Do not re-ask captured decisions from any prior phase handoff.
- Do not skip the multiple-choice format, but DO minimize question
  count per the operator's working style.
- Do not invoke any skill other than `superpowers:brainstorming` and
  `superpowers:writing-plans`.
- Do not run any execution plan yourself. Execution is a separate
  terminal.
- Do not skip the "produce phase-08-handoff.md at the end" instruction
  in the execution-handoff prompt.
- Do not flip `SQUARE_ENV` to production without explicit operator
  direction.

---

## Provenance — what this handoff inherited

The master terminal that paused here owned (across its lifetime):
- Phase 5 (finished brainstorming Sections 4–7, spec, plan, handoff prompt)
- Phase 6 (cart — full cycle)
- Phase 7 (checkout — full cycle)
- Phase 7.5 (first deploy — full cycle)
- Two live-ops interventions (graveyard-SKU restore, acrylic repricing)
- A Phase 6 styling hotfix (white-on-white header/footer fix)

It was itself bootstrapped by `phase-05-brainstorm-resumption.md` from
the master terminal that owned Phases 1–4 + start-of-5.

You are the 3rd master orchestrator. When your context fills, you write
the 4th's resumption doc. The chain continues.

---

## Bootstrap prompt for the next (3rd) master terminal

Paste the following into a fresh OpenCode session to assume the
master-orchestrator role:

---BEGIN BOOTSTRAP PROMPT---

You are the 3rd master orchestrator for the Animeniacs Shop project at
`~/code/animeniacs-shop` (branch `main`). The previous master terminal's
context grew large and handed off the role to you.

Read `docs/superpowers/specs/reference/phase-08-master-resumption.md`
end to end FIRST — it is the complete portable state of the
master-orchestrator role. Then read the docs it lists in its "Required
reading order" section. Then run its "Baseline verification" commands.

Your role: own the project across all remaining phases via the cycle
brainstorm → spec → plan → execution-handoff prompt → STOP → wait for
operator → loop. You NEVER run implementation plans yourself; execution
always happens in a separate terminal. You only invoke
`superpowers:brainstorming` and `superpowers:writing-plans`.

Phase 7.5 is closed (first deploy live at https://dev.animeniacs.shop,
Square sandbox, tag `phase-7.5-first-deploy`). Nothing is in progress.
Your immediate job is to begin **Phase 8 brainstorming**.

The operator strongly prefers FEW questions — surface ONE consolidated
scope question (which Phase 8 candidate: promo bar / abandoned-cart
emails / refund notifications / production cutover / `/shop` listing,
plus whether to fold in the two quick-win cleanups), then self-lock the
rest and proceed to spec + plan.

When your own context grows large, write the 4th master's resumption
doc and hand off — same as this doc did for you.

---END BOOTSTRAP PROMPT---
