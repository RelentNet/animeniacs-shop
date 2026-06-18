# Overnight Polish — storefront elevation pass

**Goal:** bring every public surface up to the redesigned homepage's quality bar
(the "Street Gallery" standard in `src/app/page.tsx` + `globals.css`). Branch:
`overnight-polish` (never `main`). Presentation-only — no data/query/auth/money
logic changes. Started 2026-06-18.

> Final summary goes at the very top of this file when the pass completes.

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

### 5. Cart
- [ ] CartDrawer.tsx
- [ ] CartLine

### 6. Browse + product
- [ ] /shop (ShopFilters, Pagination)
- [ ] /category/[slug]
- [ ] /artist + /artist/[slug]
- [ ] product components (ProductCard, VariantPicker, ProductReviews, ReviewForm,
      StarRating, WishlistButton, MockupGallery, PdpPurchasePanel)
- [ ] /product/[id]

### 7. Admin (lowest priority — light theme-consistency only)
- [ ] /admin/* (skip if short on time)

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
