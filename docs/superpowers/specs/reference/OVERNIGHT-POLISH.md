# Overnight Polish — storefront elevation pass

**Goal:** bring every public surface up to the redesigned homepage's quality bar
(the "Street Gallery" standard in `src/app/page.tsx` + `globals.css`). Branch:
`overnight-polish` (never `main`). Presentation-only — no data/query/auth/money
logic changes. Started 2026-06-18.

## ✅ FINAL SUMMARY — pass complete (2026-06-18)

All 7 surfaces audited, polished, and verified. Branch `overnight-polish` pushed
(7 commits). **Gate green: typecheck clean · 596/596 tests · unreachable-DB build
exit 0 · canaries logto=0 goaffpro=0.** No deploy. No data/query/auth/server-action/
env/money changes — presentation only. `(account)`/`(admin)` kept `force-dynamic`;
`SQUARE_ENV=sandbox`; art-protection preserved/extended; IP-never-public respected.

**What changed, per surface:**
1. **Content/policy (12 pages)** — were rendering essentially *unstyled* (`prose`
   class with no typography plugin). Added a themed `.prose` to globals.css (display
   titles + neon rule, neon list markers, themed links, blockquote/hr) + reflowed
   `MarkdownPage`. Verified desktop + mobile.
2. **Auth (4 pages)** — were fully light-mode. Rebuilt on the dark standard (centered
   card, display headings, themed fields, neon CTAs). Added reusable form utilities
   to globals.css: `.field-*`, `.alert`/`.alert-error`/`.alert-ok`/`.alert-warn`,
   `.panel`, `.btn-neon:disabled`. Verified desktop + mobile.
3. **Order entry** — `checkout/success` (page+loading+error) was light-mode → themed
   (neon total, order-summary panel, themed skeleton/error); `/orders/lookup` form
   migrated to shared utilities. Verified.
4. **Account** — already on-standard; audit-only + one art-protection fix (wishlist
   thumbnails). Auth-gated → code-verified.
5. **Cart** — *hidden* light-mode surface (literal white drawer + light `CartLine`);
   re-themed the CSS module + line to dark (neon checkout, art-protected thumbs).
   Open drawer is client-only → code-verified.
6. **Browse + product** — `/shop` + `/product` already excellent (left as-is).
   Themed the holdouts: `/artist` + `/artist/[slug]` (incl. a white empty-state box),
   shop/category/product `loading.tsx`+`error.tsx`, `ReviewForm`, `StarRatingInput`.
   Verified `/artist` desktop+mobile; `/shop`+`/product` by screenshot.
7. **Admin** — intentionally a separate light inline-style idiom (CLAUDE.md);
   internally consistent. Left as-is by design (not converted to dark).

**Needs your eyes / flagged (none blocking):**
- **Local headless Chrome can't run client JS or render auth/dynamic routes** (the
  memory's "CDP is partly broken here"). So these were verified by *code review*, not
  pixels: account pages, cart drawer open state, ReviewForm (auth-gated), checkout
  full line-item view (needs a live order), error/loading (transient), `/category/[slug]`
  (no public links — categories are IP names, never linked per IP-never-public). All
  reuse tokens/utilities already pixel-verified on other surfaces; risk is low. A
  human spot-check of the cart drawer + a signed-in account page is worthwhile before
  prod cutover.
- Nothing required a logic change, so nothing was skipped for scope reasons.
- New globals.css utilities introduced (all presentation): `.panel`, `.field-*`,
  `.alert*`, `.btn-neon:disabled`, themed `.prose`.

---

> (Original placeholder — superseded by the summary above.)

## The standard (reference: homepage)

- **Tokens** (`globals.css`): surfaces `ink/ink-2/wall/wall-2`; brand
  `purple/purple-bright/purple-deep/purple-soft`; accent `neon/neon-soft`; text
  `bone/muted/faint`; hairlines `line/line-strong`.
- **Type**: `font-display` (Bebas, uppercase condensed) for headings; `font-sans`
  (Space Grotesk) body; `font-mono` (Space Mono) for `.eyebrow` HUD labels.
- **Utilities**: `.btn-neon` / `.btn-ghost`, `.card-street`, `.hud`, `.sticker`,
  `.glow-purple` / `.glow-neon`, `.link-neon` (+`.is-active`), `.speed-lines`,
  `.scanlines`, `.rule-neon`, `.eyebrow`, `.neon-text` / `.purple-text`,
  `.reveal` (via `<Reveal>`), `.enter` / `.enter-pop`, `.marquee`, `.float-slow`,
  `.aurora`. All motion gated behind `prefers-reduced-motion`.
- **Section rhythm**: `mx-auto max-w-7xl px-4 py-16 md:py-20`; eyebrow + display
  `h2 text-4xl md:text-5xl text-bone`; alternating section bg `bg-ink-2`/`bg-wall`
  with `border-y border-line`.
- **A11y**: neon `:focus-visible` ring (global), WCAG AA contrast, heading order,
  alt text, reduced-motion.

## Verification

- Dev server: `NODE_OPTIONS=--experimental-require-module PORT=3100 corepack pnpm dev`
  (DB on :5544, Square sandbox creds wired locally for real catalog).
- Screenshots desktop (1440×900) + mobile-truth via CDP `Runtime.evaluate`
  (macOS Chrome clamps window width ~500px — verify mobile by JS, not pixels).
- Gate before every commit: `typecheck` clean · `test` green · unreachable-DB
  `next build` exit 0 · canaries (`logto`, `goaffpro`) both 0.

## Surface checklist

### 1. Static content + wrapper ✅
- [x] `MarkdownPage.tsx` wrapper — themed `.prose` added to globals.css
- [x] /about-us
- [x] /faqs
- [x] /contact-us
- [x] /careers
- [x] /b2b
- [x] /become-an-artist
- [x] /partner-with-us
- [x] /twitch — N/A: it's a redirect route handler (`twitch.tv/GeauxGamerLA`), no UI
- [x] /privacy-policy
- [x] /terms-of-service
- [x] /shipping-policy
- [x] /refund-return-policy
- [x] /how-to-display-our-art

### 2. Auth ✅
- [x] /sign-in
- [x] /sign-up
- [x] /forgot-password
- [x] /reset-password

### 3. Order entry points ✅
- [x] /orders/lookup — was already themed; migrated form to shared field utilities + panel
- [x] /checkout/success (+ loading.tsx, error.tsx)

### 4. Account ✅ (already on-standard; light fix only)
- [x] /account — already themed (eyebrow, display, bg-wall panels, btn-neon)
- [x] /account/orders — already themed (empty state + neon row hovers)
- [x] /account/orders/[id] — already themed (IDOR guard intact, back-link)
- [x] /account/wishlist (+ _components) — added art-protection to thumbnails
- [x] `OrderDetailView.tsx` — already themed (neon total, items list)

### 5. Cart ✅
- [x] CartDrawer (CartDrawer.module.css) — was fully light-mode (white drawer!)
- [x] CartLine — was light inline styles (#eee/#666)

### 6. Browse + product ✅
- [x] /shop (ShopFilters, Pagination) — already themed (verified by screenshot)
- [x] /category/[slug] — themed already (0 light-hits); themed its loading/error
- [x] /artist + /artist/[slug] — were light-mode; themed (verified desktop+mobile)
- [x] product components — ReviewForm + StarRatingInput themed; rest already on-standard
- [x] /product/[id] — already themed (verified by screenshot)
- [x] shop/category/product loading.tsx + error.tsx — themed (were light-mode)

### 7. Admin ✅ (audited — intentionally separate idiom, no changes)
- [x] /admin/* — deliberate light inline-style idiom (CLAUDE.md); internally
      consistent (no storefront dark classes leak in, 21/23 files inline-styled,
      light shell handles legibility). Left as-is by design; not converted to dark.

## Log

- **2026-06-18** — Iteration 1 setup: branch `overnight-polish` created from
  `main`; dev server up on :3100; Square sandbox catalog keys wired locally;
  progress doc created. Audited the homepage standard + tokens. Finding:
  content/policy pages use a `prose` class with **no** typography plugin and
  **no** `.prose` rules in `globals.css` → they render essentially unstyled
  (bone text, browser-default sizing, no link styling). Surface 1 starts here.
- **2026-06-18 — Surface 1 DONE.** Added a themed `.prose` block to
  `globals.css` (h1 = big display title + neon underline rule; h2/h3 display/sans
  hierarchy; muted body w/ AA contrast; neon diamond bullets for `ul`; neon mono
  markers for `ol`; purple→neon links; blockquote/hr styles). Re-flowed
  `MarkdownPage.tsx` to `max-w-3xl px-4 py-16 md:py-20` + a CSS-only `.enter`
  entrance (no JS dependency, so legal text is always visible). All 12
  MarkdownPage routes inherit it. Verified desktop (about/faqs/terms/how-to/
  become-an-artist) + true 390px mobile (headless honors phone widths — the
  ~500px clamp is headed-window only, so screenshots work for mobile too).
  Gate green (typecheck/596 tests/build exit 0/canaries 0). No logic touched.
- **2026-06-18 — Surface 2 (auth) DONE.** All four pages were fully light-mode
  (`text-gray-*`, `bg-gray-900`, `border-gray-300`) — never themed. Rebuilt on the
  Street Gallery standard: centered card layout, mono eyebrow + display h1, themed
  fields, neon full-width CTA. Added reusable form utilities to `globals.css`
  (`.field-label/.field-input/.field-textarea/.field-select`, `.alert/.alert-error/
  .alert-ok`, `.panel` static surface, `.btn-neon:disabled`) — these will carry the
  next surfaces (order lookup, account, reviews). Logic untouched (handlers, state,
  authClient calls, Suspense/token guard, anti-enumeration all byte-identical).
  Verified desktop + accurate 500px mobile (overflow audit 0 on all four).
  **Workflow note:** macOS Chrome lays out at a ~500px min even in old headless,
  so 390px screenshots are 500px layouts cropped to 390 (false right-edge "cut").
  Capture mobile at **width 500** (accurate, no crop) and confirm overflow with
  `node /tmp/measure.mjs <url> 500`.
- **2026-06-18 — Surface 3 DONE.** `/checkout/success` (page + loading + error)
  was fully light-mode (`text-gray-*`, `bg-gray-200` skeletons, `bg-gray-900`
  button) → themed: eyebrow + display heading, order-summary `.panel`, neon total,
  "keep shopping" CTA, themed skeleton (motion-reduce-safe) and error states. The
  Square `orders.get` fetch + `markCartCompleted` + Plausible Script + CartClearer
  are untouched. `/orders/lookup` was already themed; migrated `LookupForm` to the
  shared `.field-*`/`.alert`/`.panel` utilities for consistency (form-action wiring
  unchanged). Verified desktop + 500px mobile (overflow 0). Full line-item success
  view needs a live Square order to screenshot — markup themed + reviewed. Gate green.
- **2026-06-18 — Surface 4 (account) DONE — already on-standard.** Audited all of
  /account, /account/orders, /account/orders/[id], /account/wishlist, AccountNav,
  SavedAddresses, OrderDetailView: all already use the Street Gallery tokens/
  utilities (eyebrow + display headings, `bg-wall` panels, neon active tabs, themed
  forms, empty states, neon total). Per "don't rewrite already-good pages," made
  ONE fix: added `draggable={false}` + `select-none` to wishlist thumbnails for
  art-protection parity with the homepage `FramedArt`. Force-dynamic + IDOR guard
  untouched.
  ⚠️ **Screenshot caveat (env limitation, logged not blocking):** auth-gated pages
  could not be pixel-captured. The working `--headless --screenshot` path needs a
  warm DEFAULT profile; auth needs a cookie, which requires a custom profile, and
  on this machine a fresh/custom profile + `headless=new` + CDP navigation will not
  apply the dev `<link>` stylesheet (renders unstyled even after 28s) — matches the
  memory's "CDP is partly broken here." Verified instead by (a) code review against
  the standard, (b) CDP render confirming correct content/auth/structure, (c) shared
  `layout.css` + identical classes already proven styled on 6 other surfaces. The
  one change is a zero-visual art-protection attr. Helpers left at /tmp/authshot.mjs
  + /tmp/setcookie.mjs if a warm-profile path is found later.
- **2026-06-18 — Surface 5 (cart) DONE — was a hidden light-mode surface.** The
  earlier triage grep missed it: `CartDrawer.module.css` was a literal `background:
  white` drawer (#eee borders, #666 text, #111 checkout) and `CartLine.tsx` used
  light inline styles (#eee skeletons, #666 text). Re-themed both to dark: drawer =
  `ink-2` panel w/ neon left border + purple shadow, display-font title, themed
  footer/subtotal, neon ✦ badges, a `.btn-neon`-mirrored checkout, themed error +
  neon close; CartLine = bone/muted text, neon-hover qty stepper, dark
  motion-reduce skeleton, art-protected thumbnail. CSS module references the global
  `@theme` `var(--color-*)`/`var(--font-display)` (confirmed resolvable: body bg
  already computes to `--color-ink`). CartButton was already themed (neon badge).
  Cart logic/checkout handler/Radix wiring untouched.
  ⚠️ **Screenshot caveat (env, logged not blocking):** the drawer only renders on a
  client click, and **client JS does not hydrate in this headless/CDP context**
  (`window.next` undefined, no React fibers, even after 6s — though CSS loads fine).
  So the open drawer can't be pixel-captured here (same root cause as the auth-page
  block — local CDP can't run the client bundle). Verified by code review + proven
  token resolution. Helper at /tmp/drawershot.mjs (works for static/SSR captures).
- **2026-06-18 — workflow note:** CDP screenshots (`/tmp/drawershot.mjs`) render
  STYLED when launched **directly** at a public URL (body bg poll confirms), but
  cannot drive interactions (no hydration) and fail on navigated/dynamic routes.
  Static SSR pixel verification = old `--headless --screenshot` (warm default
  profile, launch at URL). Interaction/auth verification here = code review.
- **2026-06-18 — Surface 6 (browse + product) DONE.** AUDIT: /shop and /product/[id]
  were already excellent (themed filter bar, HUD product cards, neon prices, PDP) —
  verified by screenshot, NOT rewritten. Same for ProductCard, VariantPicker,
  ProductReviews, WishlistButton, MockupGallery, PdpPurchasePanel, ShopFilters,
  Pagination, /category/[slug] (all 0 light-hits). FIXED the light-mode offenders:
  • /artist + /artist/[slug] — default-font headings, text-gray-700, bg-gray-200
    avatars, and a white bg-gray-50 empty-state box → themed (eyebrow + display
    heading, dark avatar placeholders w/ neon-hover, link-neon socials, .panel empty
    states, art-protected avatars). Verified desktop + 500px mobile (overflow 0).
  • shop/category/product loading.tsx → dark bg-wall-2 skeletons + motion-reduce.
  • shop/category/product error.tsx → eyebrow + display + .btn-ghost + themed details.
  • ReviewForm.tsx (14 light hits) → shared .field-*/.alert utilities, neon file
    button, .btn-neon submit; added .alert-warn (amber) for the duplicate notice.
  • StarRatingInput legend → .field-label.
  No data/query/server-action changes. Could not pixel-verify (noted, not blocking):
  error/loading (transient — code-verified, mirror the verified checkout error),
  ReviewForm (auth-gated), /category/[slug] (no public links — IP-never-public).
  Gate green (typecheck/596 tests/build exit 0/canaries 0).
