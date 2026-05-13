# Animeniacs Shop — Design Spec

**Date:** 2025-05-13
**Status:** Approved for implementation planning
**Project:** Custom Next.js e-commerce replacement for `animeniacs.shop` (currently WordPress/WooCommerce)
**Scope:** v1 = functionality-first. Aesthetic styling is explicitly deferred — only the existing product mockup viewer aesthetic carries over.

---

## 0. Goals & Non-Goals

### Goals
- Replace the current WordPress/WooCommerce site with a custom Next.js application.
- **Square is the source of truth** for all products; staff manage the catalog in Square's dashboard.
- Auto-generate artist profile pages from **GoAffPro** affiliate data filtered by the `label:artist` field.
- Hosted-checkout payments via **Square Checkout API** (lowest maintenance, no PCI scope).
- Self-host **Logto** for authentication, **Plausible** for analytics, **Postgres** for app data, and the Next.js app on **Coolify**.
- Build the architectural "bones" so v1.1/v1.2 additions (Antigro custom-product builders, visual size pickers, TaxJar) are drop-in.

### Non-Goals (v1)
- Visual design / brand theming (will follow in v1 post-launch).
- Antigro Designer / Sticker Builder integration (deferred to v1.1; stub routes only in v1).
- Visual size picker (single 16x24 size in v1; architecture supports adding later).
- Multi-state sales tax calculation (TaxJar wired but disabled by default; admin can enable).
- Cancellation tracking on Square Checkout (Square Checkout API does not provide a `cancel_url`; we handle abandonment via webhook timeout).

---

## 1. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| **Framework** | Next.js 14 (App Router) | TypeScript, Server Components, Server Actions, ISR. |
| **Auth** | Logto (self-hosted on Coolify) | `@logto/next` SDK; RBAC for `/admin`; uses SMS verification via `sms-edge` (already deployed). |
| **Payments** | Square Checkout API | Hosted payment-link redirect. Order created server-side with full `line_items[]` + `discounts[]`. |
| **Catalog** | Square Catalog API | Source of truth. Custom attributes for filtering. Webhook-driven ISR. |
| **Affiliates** | GoAffPro Admin API | Artist profiles + conversion tracking + coupon codes. |
| **Custom Products (v1.1)** | Antigro Designer / Sticker Builder | Stub routes only in v1 — coming-soon page + email capture. |
| **Analytics** | Plausible (self-hosted on Coolify) | Postgres + ClickHouse. Served from `analytics.animeniacs.shop`. |
| **Newsletter / Transactional Email** | Resend | Free tier 3k/mo; managed DKIM/SPF/DMARC. |
| **Tax** | TaxJar (admin-configurable, off by default) | Free dev account; API key in admin panel. |
| **SMS Notifications** | `@itkujo/sms-core` library | Imported directly into Next.js; calls SMSGate; recipient list in admin. |
| **Database** | PostgreSQL 16 | Shared instance hosts: Logto DB, Plausible metadata DB, our app DB (site settings, wishlists, reviews, event-logo library, recently-viewed cache, abandoned-cart timer). |
| **Search** | Square Catalog `SearchCatalogItems` API | No external search engine needed in v1. |
| **Hosting** | Coolify (existing instance) | Caddy/Traefik in front; automatic TLS. |
| **CI/CD** | GitHub Actions → Coolify auto-deploy | Push to `main` → Coolify pulls and rebuilds. |

### Infrastructure topology on Coolify
```
coolify-host
├── animeniacs-app          (Next.js, animeniacs.shop)
├── animeniacs-postgres     (single Postgres for all services)
├── logto                   (auth.animeniacs.shop)
├── plausible-app + clickhouse (analytics.animeniacs.shop)
└── sms-edge                (already deployed, used by Logto)
```

---

## 2. Page Map

### Public routes

| Route | Type | Data Source | Render Strategy |
|-------|------|-------------|-----------------|
| `/` | Home | Static + featured products from Square + iCal events | ISR (1h revalidate + webhook trigger) |
| `/shop` | Product listing | Square `SearchCatalogItems` | ISR + on-demand revalidation |
| `/shop/search` | Search results | Square `SearchCatalogItems` (text query) | SSR |
| `/product/[id]` | Product detail | Square `RetrieveCatalogObject` + GoAffPro artist lookup | ISR |
| `/artist` | Artist gallery | GoAffPro `/admin/affiliates` filter `label=artist` | ISR |
| `/artist/[slug]` | Artist profile | GoAffPro + Square (products with `artist:{slug}` custom attribute) | ISR |
| `/events` | Convention schedule | iCal feed (admin-configured URL) + event-logo library | ISR (15m revalidate) |
| `/cart` | Cart | Client (localStorage) | Client |
| `/checkout` | Checkout handoff | Server Action → Square payment link → redirect | Server Action |
| `/checkout/success` | Order confirmation | Server reads `order_id` from query → Square Orders API | SSR |
| `/account` | My Account | Logto-protected → Square Customers → Orders | SSR |
| `/account/orders/[id]` | Order detail | Square Orders API | SSR |
| `/account/wishlist` | Wishlist | Postgres + Square | SSR |
| `/custom/acrylic` | Coming soon (Antigro v1.1 stub) | Static + email capture | Static |
| `/custom/stickers` | Coming soon (Antigro v1.1 stub) | Static + email capture | Static |
| `/qr1` | QR vCard landing | Static + .vcf download | Static |
| `/twitch` | Twitch link redirect | 302 → `twitch.tv/GeauxGamerLA` | Server redirect |

### Static content pages (migrated from current WordPress site)

| Route | Source |
|-------|--------|
| `/about-us` | `static-content-source/about-us.md` |
| `/faqs` | `static-content-source/faqs.md` |
| `/contact-us` | `static-content-source/contact-us.md` |
| `/how-to-display-our-art` | `static-content-source/how-to-display-our-art.md` |
| `/partner-with-us` | `static-content-source/partner-with-us.md` |
| `/become-an-artist` | `static-content-source/become-an-artist.md` (placeholder — keep as separate page from partner) |
| `/b2b` | `static-content-source/b2b.md` |
| `/careers` | `static-content-source/careers.md` |
| `/terms-of-service` | `static-content-source/terms-of-service.md` |
| `/privacy-policy` | `static-content-source/privacy-policy.md` (updated: Shopify → Square) |
| `/shipping-policy` | `static-content-source/shipping-policy.md` |
| `/refund-return-policy` | `static-content-source/refund-return-policy.md` |

### Admin routes (Logto `admin` role required)

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard (recent orders, abandonment count, pending events without logos) |
| `/admin/settings` | Site variables: Discord link, social URLs, iCal feed URL, production-time text, contact email/phone, etc. |
| `/admin/event-logos` | Event logo library (hashtag → image mapping). |
| `/admin/sms-recipients` | Phone numbers that receive order alerts. |
| `/admin/admins` | Assign/revoke Logto `admin` role (delegated to Logto's UI; this is a link). |
| `/admin/taxjar` | TaxJar API key + enable/disable toggle. |
| `/admin/diagnostics` | Webhook health, Square / GoAffPro / Resend status checks. |

### API routes (Next.js Route Handlers)

| Route | Purpose |
|-------|---------|
| `POST /api/checkout` | Create Square payment link from cart. Apply GoAffPro discounts. Store abandoned-cart timer. |
| `POST /api/webhooks/square` | Receives `catalog.version.updated`, `order.created`, `order.updated`, `order.fulfillment.updated`, `payment.created`. Triggers ISR revalidation + GoAffPro conversion tracking + SMS/Discord notifications. |
| `POST /api/webhooks/goaffpro` | Affiliate changes → revalidate artist pages. |
| `POST /api/track/visit` | Proxy to GoAffPro `/sdk/track/visit` (passes through visitor IP/UA). |
| `POST /api/newsletter` | Newsletter signup → Square Customers + Resend audience. |
| `POST /api/coupons/validate` | Validate code → look up in GoAffPro → return discount + affiliate ID. |
| `POST /api/wishlist/[product_id]` | Add/remove from wishlist (Postgres). |
| `POST /api/reviews` | Submit review (gated to verified purchasers via Square order history). |
| `GET /api/sitemap.xml` | Generated sitemap (all products, artists, static pages). |
| `GET /api/robots.txt` | Robots policy. |

---

## 3. Product Catalog Model

Square is the source of truth. Staff manage everything through the Square dashboard.

### Square Categories (browsable taxonomy)
Used for hierarchical product browsing on `/shop`. Examples (carry from current site):
- Anime
- Video Games
- Marvel
- DC
- Comics
- Movies
- Trading Card Games
- Acrylic Wall Art
- Acoustic Art Panels
- Lit Box Frame
- Vinyl Decal

A product can belong to multiple categories.

### Square Custom Attributes (filterable metadata)

Created via API at deploy time (one-time setup script). Once defined, these fields **appear inside the Square product editor** for staff to fill in. **Max 10 seller-visible definitions allowed by Square** — we use 4.

| Key | Schema | Purpose |
|-----|--------|---------|
| `artist` | String | Artist slug (e.g., `bxnny`, `saru`, `merc`). Joins to GoAffPro artist on slug. Used by `/artist/[slug]`. |
| `ip` | String | Franchise / fandom (e.g., `naruto`, `dragon-ball`, `one-piece`). Used for IP filtering on `/shop`. |
| `product_type` | Selection | `acrylic` / `vinyl` / `lit-box` / `acoustic-panel` / `accessory` / `custom`. Drives PDP layout and category filtering. |
| `sibling_group` | String (optional) | Pairs two items as Acrylic/Vinyl variants of the same artwork (see §3 Variant Pattern). Leave blank if no sibling exists. |

### Staff workflow when uploading a product
1. In Square Dashboard → Items → "Create Item".
2. Fill standard fields: name, price, description, image(s).
3. Assign one or more **Categories**.
4. Scroll to the "Custom Attributes" section at the bottom of the item editor:
   - **Artist**: type the artist's slug (e.g., `bxnny`).
   - **IP**: type the franchise slug (e.g., `naruto`).
   - **Product Type**: pick from dropdown.
   - **Sibling Group** (optional): if this product has an Acrylic/Vinyl counterpart (or you're about to create one), set both items' Sibling Group to the same string (e.g., `naruto-by-bxnny-001`). Leave blank if this is a standalone product.
5. Save. Square fires the `catalog.version.updated` webhook → Next.js revalidates affected pages within seconds.

### Variant pattern (Acrylic + Vinyl as separate items)
Each piece of art exists as **two separate Square catalog items** (not variants):
- `"{Art Name} - Acrylic Wall Art"` with `product_type=acrylic`
- `"{Art Name} - Vinyl Decal"` with `product_type=vinyl`

Both share the same `artist` and `ip` custom-attribute values. **Sibling linking:** rather than fragile name-string matching, we add a fourth (optional) custom attribute `sibling_group` — a free-form ID (e.g., `naruto-by-bxnny-001`). When two products share a `sibling_group` value but differ in `product_type`, they are presented as type-selector siblings on the PDP. Staff sets the same `sibling_group` value on both items when uploading. If a product has no `sibling_group` (or no other item shares it), no type-selector is shown.

This pattern fits within Square's 10-definition custom-attribute limit (we'd use 4 of 10: `artist`, `ip`, `product_type`, `sibling_group`).

### Image handling
- Square stores images as `CatalogImage` objects; product carries `image_ids[]`.
- First `image_ids[0]` = primary image.
- We **denormalize** at fetch time: when we read a product, we also fetch its images and cache image URLs in our Postgres `product_cache` table (TTL 1h, refreshed on webhook).
- All image URLs proxied through Next.js Image component with Square's CDN domain whitelisted in `next.config.js`.

---

## 4. Artist System

### Data source
**GoAffPro Admin API** is the source of truth for artist profiles.

- `GET /admin/affiliates` (with auth header) returns all affiliates.
- We filter to those whose `label` field equals `"artist"`. Anyone with a different label or no label is treated as a non-displayed affiliate.
- For each `label=artist` affiliate we use: name, bio, profile image URL, social links (Instagram, etc.). The `how-they-want-to-be-paid` field is ignored at render time — it's internal.

### Slug derivation
Each affiliate has a unique referral code or name; we derive their public slug from a `slug` custom field in GoAffPro if available, else from a normalized name. Staff must ensure the slug matches the value set in the Square `artist` custom attribute on each of their products.

> **Open item:** GoAffPro's exact response schema for bio/socials/profile-image isn't documented in the public Swagger. **Implementation must verify field names against a live GoAffPro API call** before final coding. Adapt the data mapper accordingly.

### `/artist` (gallery)
Grid of all `label=artist` affiliates. Each card: profile picture + name → links to `/artist/[slug]`.

### `/artist/[slug]` (profile)
- Header: profile image, name, bio, social-link icons.
- Below: grid of all Square products with `artist={slug}` custom attribute, paginated.
- Sort controls: same as `/shop` (Popularity / Latest / Price asc / Price desc).
- If the artist has no products in Square yet → "{Name} doesn't have any drops yet — follow them on [Instagram link]".

### Update propagation
GoAffPro webhook (if available — verify during impl) → POST to `/api/webhooks/goaffpro` → revalidate `/artist` and the specific `/artist/[slug]`. If no webhook is offered, fall back to ISR (every 15 minutes).

---

## 5. Product Detail Page (PDP)

### Layout (top to bottom)

1. **Breadcrumbs**: `Home / Shop / {Category} / {Product Name}` (improvement over current site, which has no breadcrumbs on PDPs).
2. **Product Mockup Gallery** (the one aesthetic carried over from the current site — see §5.1 for spec).
3. **Title** (H1).
4. **Meta line**: SKU + Category links + **Artist link** ("Designed by [Artist]" → `/artist/[slug]`).
5. **Price**.
6. **Production time badge**: rendered from admin-configurable text. Default: *"Ships in 3-10 days depending on convention schedule."* — single text field in admin (see §11). One value site-wide.
7. **Type selector** (only if sibling Acrylic/Vinyl item exists): Acrylic | Vinyl tabs. Selecting one swaps product context and updates `/product/[id]` URL via `router.replace` to keep state shareable.
8. **PDP add-on upsells** (see §5.2).
9. **Quantity stepper** + **Add to Cart** button. Add to Cart opens the **cart drawer** (not a separate page).
10. **Wishlist heart icon** (toggles Postgres `wishlist` entry; localStorage for guests, see §6).
11. **Four product pillars** (icon + text, identical on every product):
    - Easy to Clean
    - Easy to Mount
    - Premium Quality
    - Long Lasting
12. **Product description** (rendered from Square's `description_html` field).
13. **Reviews section** (see §7).
14. **Recently Viewed** (this page automatically pushes to the user's recently-viewed list; rendered from §8 cache).
15. **Related Products** (carousel): 6 products from the same `ip` or `artist`, fetched via Square SearchCatalogItems.

### 5.1 Product Mockup Gallery (preserved from current site)

This is the **only** aesthetic we explicitly preserve from the current site. The current implementation lives on `https://animeniacs.shop/product/*` and renders the product image overlaid onto 4 background scenes (gallery wall, angled wall, classic display, premium showcase) with thumbnails to switch between them.

**Re-implementation as a React component:**

```tsx
// src/components/product/MockupGallery.tsx (sketch)
interface MockupScene {
  id: string
  name: string
  backgroundImage: string  // CDN URL
  aspectRatio?: number     // detected on image load
  productPosition: {
    top: string
    left: string
    width: string
    height: string
    transform: string      // CSS transform, e.g. perspective + rotate3d
  }
}

interface MockupGalleryProps {
  productImageUrl: string
  scenes: MockupScene[]   // from admin settings (admin can edit the scene list & positions)
}
```

**Behavior (matches current site):**
- Thumbnails on left (or top on mobile), main display on right.
- Click thumbnail → fades active background to 0 opacity, fades target to 1 over 400ms, repositions product overlay using `productPosition` from the scene definition.
- Each scene has its own product positioning (top/left/width/height/transform) so the product appears framed correctly per scene.
- Aspect ratio of display container updates to match the loaded background image's natural aspect ratio.
- Resizing the window debounces and re-applies positioning.
- Product image source is the Square primary image for the product.

**Scene library:**
- Stored as JSON in `site_settings` (admin-editable in `/admin/settings`). v1 seeds the same 4 scenes the current site uses.
- Admin can add new scenes (upload background image, set product position JSON via a coordinate-picker UI — stretch goal in v1, manual JSON entry acceptable for launch).
- One global scene library; same scenes apply to all products.

**Accessibility:**
- Thumbnails are real `<button>` elements with `aria-label` and `aria-pressed`.
- Keyboard left/right arrows cycle scenes when gallery is focused.
- Reduced-motion users get instant scene swap (no fade) via `prefers-reduced-motion` media query.

### 5.2 PDP add-on upsells

Inline checkbox add-ons rendered above the Add to Cart button. Adds an additional line item to the cart on add-to-cart.

**Configuration:** Per-product, an admin can flag specific Square items as "PDP upsells" via a custom attribute (`is_pdp_upsell=true`) or a Postgres-side mapping. v1 simplest: a single admin setting that lists product IDs of "universal upsells" (e.g., Litbox LED Frame, Hanging Strips) shown on every PDP. Per-product upsell overrides deferred to v1.1.

Each upsell renders as: checkbox + name + price + "(?)" tooltip with short blurb. Selected upsells are added to cart as separate line items.

---

## 6. Cart & Wishlist

### 6.1 Cart (client-side, localStorage)
- Cart stored in browser `localStorage` keyed by `animeniacs_cart_v1`.
- Cart entry shape: `{ catalog_item_id, variation_id?, name, price, image_url, quantity, upsell_of_item_id? }`.
- Cart drawer (slide-out from right) is the primary cart UI — no separate `/cart` page (route exists as fallback for direct link / SEO but redirects to opening the drawer on the previous page).
- Drawer shows: line items, quantity stepper per row, remove button, subtotal, **promo progress bar** (see §6.3), trust badges (delivery time + free hanging strips + "Every purchase supports an artist"), **Checkout** button.
- No coupon-code input in the drawer — promo codes are entered later on Square's hosted checkout page or auto-applied via the affiliate URL param.

### 6.2 Wishlist
- Guests: stored in localStorage `animeniacs_wishlist_v1`.
- Logged-in users: stored in Postgres `wishlists` table, keyed by Logto user ID. When a guest logs in, the localStorage wishlist merges into the Postgres record.
- Wishlist drawer: same UX as cart drawer (separate icon in header).
- Shows: product image, name, current price, "Move to cart" button, "Remove" button.
- Wishlist accessible at `/account/wishlist` as a full page for logged-in users.

### 6.3 Promo progress indicator (header bar)

Sticky thin bar at the top of every page. Content depends on cart state and active promotions configured in admin:

**Default v1 message:** *"BUY 3 OR MORE & SAVE 20% — Add {N} more to unlock."*

Where `N = max(0, threshold - cart_count)`. When threshold is met, message changes to: *"✓ 20% off unlocked at checkout."*

The discount itself is **auto-applied at checkout** as a Square `order.discounts[]` entry when the cart count threshold is met. No coupon code typing required.

Admin controls (in `/admin/settings`):
- `promo_enabled` (bool)
- `promo_threshold` (int, default 3)
- `promo_discount_percent` (int, default 20)
- `promo_message_template` (string with `{n}` placeholder)
- `promo_unlocked_message` (string)

---

## 7. Reviews System

### Data model
Postgres table `reviews`:
- `id` (uuid)
- `product_id` (Square catalog ID)
- `user_id` (Logto user ID — nullable for legacy imports)
- `order_id` (Square order ID — used to verify purchase)
- `rating` (1-5 int)
- `title` (string, optional)
- `body` (text)
- `photo_urls` (string[], stored in Coolify volume `/data/reviews/`, served via Next.js Image)
- `created_at`, `updated_at`
- `is_published` (bool, default false; admin moderates before publishing)
- `is_verified_purchase` (bool, true if `order_id` matches an order containing `product_id` by this user)

### Submission flow
- User can write a review only if logged in AND has an order containing this product.
- Form: rating stars + title + body + up to 5 photo uploads.
- On submit: row inserted with `is_published=false`. Admin notification (Discord webhook). Admin reviews in `/admin` → publishes.
- Published reviews appear on the PDP, sorted newest first by default. Photo reviews surfaced above text-only.

### PDP display
- Summary: average rating (1 decimal) + total count.
- Filter by star rating, sort by newest / highest / lowest / most helpful (helpful = users marking "this was helpful" — stretch goal).
- Each review: name (first name + last initial), star count, verified-purchase badge, photos (lightbox on click), body.

### Anti-abuse
- One review per (user, product) — enforced unique constraint.
- Photos validated: max 5 per review, max 10MB each, PNG/JPEG/WebP only.
- Server-side EXIF stripped on upload (privacy).

---

## 8. Recently Viewed Products

- Client-side, stored in localStorage `animeniacs_recently_viewed_v1` as an array of up to 10 product IDs with timestamps.
- On every PDP view, the current product ID is pushed (deduped, most-recent-first).
- Rendered on PDP (below reviews) and on `/account` if logged in.
- A small server-side enrichment endpoint takes a list of IDs and returns hydrated product cards (name, price, primary image) so the localStorage entries don't go stale.

---

## 9. Checkout Flow

### Pre-made products (v1)

```
[User] Cart drawer → "Checkout"
   │
   ▼
[Next.js] POST /api/checkout
   │
   ├─ Reads cart from request body (sent by client)
   ├─ Looks up each cart item via Square Catalog API (validates price hasn't changed)
   ├─ Resolves affiliate cookie/ref param → GoAffPro affiliate ID
   ├─ If promo threshold met → adds 20% order-level discount
   ├─ If GoAffPro coupon code present → adds that discount
   ├─ Builds Square Order:
   │    order: {
   │      location_id: SQUARE_LOCATION_ID,
   │      line_items: [...cart items],
   │      discounts: [...applied discounts],
   │      reference_id: <short ID, ≤40 chars>,
   │      metadata: {
   │        affiliate_id: "...",
   │        promo_applied: "...",
   │        cart_id: "<uuid we generate>"
   │      }
   │    }
   ├─ POST /v2/online-checkout/payment-links with the Order
   ├─ Stores abandonment record in Postgres:
   │    abandoned_carts: { cart_id, order_id, created_at, status='pending' }
   │    (30-min timer fires reminder if still pending)
   └─ Returns: { checkout_url } to client
   │
   ▼
[Client] window.location = checkout_url
   │
   ▼
[Square] Hosted checkout page
   │   - Customer enters email, shipping address, payment method
   │   - Square handles PCI compliance
   │   - Square calculates tax (if TaxJar admin-enabled, we pre-computed and added taxes to order)
   │   - Customer pays
   │
   ▼
[Square] Redirects to /checkout/success?orderId=<square_order_id>
   │   - Also fires order.created + payment.created webhooks
   │
   ▼
[Next.js] /checkout/success page
   │   - Fetches order details from Square Orders API
   │   - Marks abandoned_carts.status='completed'
   │   - Fires Plausible Purchase event CLIENT-SIDE
   │     (must be client-side to preserve visitor IP/UA for Plausible bot filter)
   │   - Fires GoAffPro /sdk/track/conversion with order details + affiliate ID
   │   - Renders order summary + tracking info placeholder + "View in My Account"
   │
   ▼
[Next.js webhook handler] POST /api/webhooks/square (async, parallel to above)
   │   - On payment.created:
   │     • Sends Discord webhook to admin channel
   │     • Sends SMS via @itkujo/sms-core to each phone in admin SMS recipient list
   │   - On order.fulfillment.updated:
   │     • Revalidates /account if user is logged in
```

### Cancellation handling
Square Checkout API provides **no `cancel_url`**. If the buyer closes the tab on Square's page:
- We never receive a cancellation signal.
- The `abandoned_carts` row sits at `status=pending`.
- A scheduled job (every 5 min) checks for rows older than 30 min still in `pending` and marks them `status=abandoned`.
- Optionally fires a reminder email via Resend (if buyer email is known via cart capture form or prior session).

### Custom products (v1.1 — stub only in v1)
`/custom/acrylic` and `/custom/stickers` exist as static "coming soon" pages with email signup. Architecture (`/api/checkout` design, abandonment tracking, GoAffPro conversion call) is built to accept Antigro design IDs and prices via the same payment-link creation path. Adding Antigro later is a feature flag flip + Antigro widget embed.

---

## 10. Authentication (Logto)

### Setup
- **Self-hosted Logto** on Coolify at `auth.animeniacs.shop`.
- Logto uses our shared Postgres instance for its DB.
- SMS verification uses the existing **sms-edge** deployment (already connected to Logto for Smile NOLA / Court Command etc.).

### Next.js integration
- `@logto/next` with App Router pattern.
- Config: `logtoConfig` in `src/lib/logto.ts` with `appId`, `appSecret`, `endpoint`, `baseUrl`, `cookieSecret` (≥32 chars), and scopes including `UserScope.Email` so we can read the user's email server-side.
- Sign-in: route handler at `app/sign-in/route.ts`.
- Callback: `app/callback/route.ts` calls `handleSignIn` then redirects to `/account`.

### RBAC for `/admin`
- Logto role `admin` defined in the Logto console.
- Roles included in the ID token claims.
- `app/admin/layout.tsx` is a server component that calls `getLogtoContext(logtoConfig)` and:
  - If not authenticated → `redirect('/sign-in')`.
  - If authenticated but `!claims.roles?.includes('admin')` → `redirect('/')` with a flash.
  - Else render admin layout.

### My Account flow
- `/account` requires authentication (Logto middleware).
- Reads logged-in user's email from Logto ID token claims.
- Calls Square `SearchCustomers` with email filter → resolves `customer_id`.
- Calls Square `SearchOrders` with `customer_filter.customer_ids=[customer_id]` → list of past orders.
- Caches the email→customer_id mapping in Postgres `customer_link` table (TTL 1 day).

---

## 11. Admin Panel & Site Settings

### Storage
Postgres tables:

```sql
-- Single-row key-value store for global site settings
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT  -- Logto user ID
);

-- Event logo library (hashtag → image)
CREATE TABLE event_logos (
  hashtag TEXT PRIMARY KEY,           -- e.g. "anime-expo" (no leading #)
  image_url TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scraped', 'manual_upload', 'manual_override')),
  source_event_url TEXT,              -- URL we scraped from (if auto-scraped)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- SMS recipients
CREATE TABLE sms_recipients (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,         -- E.164 format
  label TEXT,                          -- "Owner", "Manager", etc.
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Settings managed via `/admin/settings`

| Key | Type | Default |
|-----|------|---------|
| `discord_invite_url` | string | `https://discord.gg/VAwd8sJp` |
| `discord_webhook_url` | string (secret) | (set in env or via admin) |
| `social_instagram_url` | string | `https://instagram.com/animeniacs.shop` |
| `social_facebook_url` | string | `https://facebook.com/Animeniacs.shop` |
| `social_twitch_url` | string | `https://twitch.tv/GeauxGamerLA` |
| `social_tiktok_url` | string | "" |
| `contact_email` | string | `Biz@Animeniacs.Shop` |
| `contact_phone` | string | `858-859-1851` |
| `ical_feed_url` | string | "" |
| `ical_provider_note` | string | "iCal feed URL from Google Calendar, Outlook, or Apple Calendar" |
| `production_time_text` | string | `Ships in 3-10 days depending on convention schedule.` |
| `mockup_scenes` | JSONB array of `MockupScene` objects | Seed with 4 scenes from current site |
| `pdp_universal_upsells` | string[] (Square catalog IDs) | `[]` |
| `promo_enabled` | bool | true |
| `promo_threshold` | int | 3 |
| `promo_discount_percent` | int | 20 |
| `promo_message_template` | string | `BUY 3 OR MORE & SAVE 20% — Add {n} more to unlock.` |
| `promo_unlocked_message` | string | `✓ 20% off unlocked at checkout.` |
| `taxjar_enabled` | bool | false |
| `taxjar_api_key` | string (secret) | "" |
| `taxjar_from_address` | JSONB | "" |
| `resend_api_key` | string (secret) | (env) |
| `resend_audience_id` | string | "" |
| `cart_abandonment_minutes` | int | 30 |
| `cart_abandonment_email_enabled` | bool | false |

### `/admin/event-logos`
- Table view of all rows in `event_logos`.
- Columns: hashtag, image preview, source badge, "last updated".
- "Add new" button: upload an image + assign a hashtag → inserts row with `source='manual_upload'`.
- "Replace" button per row: upload a new image → updates row, sets `source='manual_override'`.
- "Delete" button per row.

### `/admin/diagnostics`
- Live checks: Square API auth, GoAffPro API auth, Resend API auth, Plausible reachability, Postgres reachability, last webhook received (with timestamp).
- "Test SMS" button → sends a test message to all SMS recipients.
- "Test Discord" button → posts a test message to the webhook.

---

## 12. Convention Schedule (Events)

### Source
Single iCal/ICS feed URL configured in admin (`ical_feed_url`). Works with Google Calendar, Outlook, Apple Calendar — all export the same .ics format.

### Parsing
- Server-side fetch the .ics file every 15 minutes (ISR revalidation).
- Parse using `ical.js` or similar.
- For each event, extract: title, start, end, location, URL (DESCRIPTION or URL field), and **the first hashtag** found in the event body (regex `/#([\w-]+)/`).

### Logo resolution (per event)

```
For each parsed event:
  hashtag = extractFirstHashtag(event.description)

  if hashtag is null:
    logo = "/icons/event-generic.svg"
    log a warning to /admin/diagnostics ("Event '{title}' has no hashtag")

  else:
    row = SELECT * FROM event_logos WHERE hashtag = ?

    if row exists:
      logo = row.image_url
    else:
      // Auto-scrape
      logo = scrapeOgImageOrFavicon(event.url)
      if logo is null:
        logo = "/icons/event-generic.svg"
      else:
        // Download and store in our own asset volume so we don't depend on source host
        local_path = downloadToVolume(logo)
        INSERT INTO event_logos (hashtag, image_url, source, source_event_url)
                          VALUES (?, ?, 'scraped', ?)
        logo = local_path

      // If the scrape was wrong, admin can override later via /admin/event-logos
```

### Display
- `/events` page: chronological list of upcoming events, each card shows: logo, title, date range, location, "View event details" external link.
- Homepage: most recent 3 upcoming events surfaced in a "Con-Tour" section (mimics current site's structure).

### Edge cases
- Event with no URL → can't scrape → uses generic icon.
- Scrape returns 404 / no OG image / no favicon → uses generic icon, no row inserted (next time can retry).
- Scraped image host goes down later → we have the local copy in our volume, no dependency on source.

---

## 13. Affiliate Tracking (GoAffPro)

### Visit tracking
- `?ref=<code>` URL parameter on inbound links from affiliate sites → middleware reads it, sets `affiliate_ref` cookie (HTTP-only, 30 days), then strips the param from the URL on the redirect.
- On every page load with the cookie present, server-side fires `POST /sdk/track/visit` to GoAffPro with the affiliate code + visitor metadata.

### Conversion tracking
On Square `payment.created` webhook:
1. Read the linked order from Square (via `order_id` in the payment).
2. Extract `metadata.affiliate_id` from the order.
3. POST to GoAffPro `/sdk/track/conversion` with:
   - `order_id` (Square order ID)
   - `order_number` (our `reference_id`)
   - `order_amount` (Square `order.total_money`)
   - `customer_email` (from the buyer's `Payment.buyer_email_address`)
   - `ref_code` (from order metadata or cookie value)

> **Implementation note:** Verify the exact `/sdk/track/conversion` parameter names against GoAffPro's live API or their CDN-hosted JS SDK. The Swagger summary lists the endpoint but not the field names. Build a small test harness early.

### Coupon code sync (GoAffPro → Square)

GoAffPro generates per-affiliate coupon codes (e.g., `BXNNY10` for 10% off). Square doesn't know about them. Flow:

1. **At cart drawer:** User does NOT type a code; promo is auto-applied via `?ref=` URL param if present.
2. **At Square hosted checkout:** Buyer can optionally type a code into Square's checkout UI. BUT Square only recognizes its own Square Marketing coupons there, not GoAffPro codes.
3. **Therefore:** We pre-bake the discount before creating the payment link.
   - On `/checkout`, if `affiliate_ref` cookie is set:
     - Server calls `GET /admin/coupons?code={cookie_value}` to validate + get discount %.
     - Server adds an `order.discounts[]` entry with the resolved discount.
     - Stores affiliate ID in `order.metadata.affiliate_id` for the conversion tracking step.

This means **buyers never type codes** — they just click the affiliate's link and the discount is applied automatically. Cleaner UX, no friction.

### Coupon validation endpoint (`POST /api/coupons/validate`)
Used when a buyer pastes a code into a "Have a code?" field on the cart drawer (optional UX). Validates against GoAffPro, returns `{ valid: bool, discount_percent: int, affiliate_id: string }` or `{ valid: false, reason: string }`.

---

## 14. Newsletter (Resend + Square Customers)

### Why not Listmonk
Listmonk handles campaign building but requires an SMTP relay (SES/Postmark/etc.) for actual delivery. Resend bundles delivery + DKIM/SPF/DMARC setup + free tier (3k emails/mo) → simpler for low volume.

### Why dual-write to Square Customers AND Resend
- Square Customers list is useful for future Square Marketing campaigns and as a unified customer database.
- Resend audience drives the actual newsletter sends.
- Both are kept in sync — signups go to both.

### Signup flow
1. Footer signup form (email field + "Subscribe").
2. `POST /api/newsletter` with `{ email, source }`.
3. Server:
   - Validates email format.
   - Calls Square `POST /v2/customers` with `{ email_address, given_name: "Newsletter Subscriber" }` — idempotent if customer already exists.
   - Calls Resend `POST /audiences/{audience_id}/contacts` to add to mailing list.
   - Fires Plausible event `Newsletter Signup`.
   - Returns 200.
4. Resend sends a one-time welcome/confirmation email (configured in Resend dashboard).

### Promo discount delivery
The FAQ promises "subscribe for exclusive discounts." Implementation:
- Welcome email contains a one-time-use Square Marketing coupon code (`WELCOME10` or similar — pre-created in Square dashboard).
- Square Marketing coupons are dashboard-only; we can't generate per-subscriber codes via API.
- v1 accepts that all new subscribers use the same code (cap usage in Square dashboard to prevent abuse).

### Compliance
- One-click unsubscribe URL in every email (Resend handles this).
- `email_unsubscribed` on Square's side is read-only via API; honored on Resend side directly. Buyers using Square's checkout can opt out of marketing there; we respect that on send.

---

## 15. Order Notifications

When `payment.created` webhook fires for a successful payment, fire both notifications in parallel (don't block on either).

### Discord webhook
- POST to `discord_webhook_url` (admin-configured).
- Message: "🎨 New order #{reference_id} — ${total} — {item_count} items — by {buyer_email}". Embed with order link.

### SMS via `@itkujo/sms-core`
- Package: `"@itkujo/sms-core": "github:itkujo/sms-core#v0.1.0"` in `package.json`.
- Initialize once per process: `new SmsClient({ baseUrl: 'https://sms.relentnet.dev', username, password })` with credentials in env.
- For each `enabled=true` row in `sms_recipients`:
  ```ts
  await sms.send({
    to: row.phone,
    type: 'OrderAlert',
    payload: {
      orderId: order.reference_id,
      total: order.total_money.amount,
      itemCount: order.line_items.length
    }
  })
  ```
- All sends fire in parallel via `Promise.allSettled` — one failure doesn't block others.
- Failures logged + surfaced in `/admin/diagnostics`.

---

## 16. SEO

### Sitemap
`/api/sitemap.xml` generated on demand (5-min cache):
- All public static routes.
- All `/product/[id]` URLs from Square catalog.
- All `/artist/[slug]` URLs from GoAffPro.
- All `/shop` category pages.

### robots.txt
`/api/robots.txt`:
```
User-agent: *
Disallow: /admin
Disallow: /account
Disallow: /api/
Disallow: /checkout
Allow: /

Sitemap: https://animeniacs.shop/sitemap.xml
```

### Per-page metadata
Next.js `generateMetadata()` for every dynamic route:
- `/product/[id]`: title = `{Product Name} | Animeniacs`, description = first 160 chars of product description, OG image = primary product image.
- `/artist/[slug]`: title = `{Artist Name} | Animeniacs`, OG image = artist profile picture.
- `/`: site default OG image (Animeniacs logo on branded background).

### JSON-LD structured data
- On `/product/[id]`: `Product` schema with name, image, description, brand (Animeniacs), offers (price, currency, availability=InStock since print-on-demand).
- On `/artist/[slug]`: `Person` schema.
- Site-wide: `Organization` schema in root layout.

### Open Graph + Twitter Cards
Standard `og:*` and `twitter:*` meta tags on every page.

---

## 17. Search

### Implementation
- Search bar in header (icon → expands to input on click) + dedicated `/shop/search` results page.
- On query submit: `POST /v2/catalog/search-catalog-items` with:
  ```json
  {
    "text_filter": "<query>",
    "product_types": ["REGULAR"],
    "custom_attribute_filters": [optional filters from URL params]
  }
  ```
- Results page supports same sort options as `/shop`.
- URL pattern: `/shop/search?q=naruto&sort=latest&artist=bxnny&ip=naruto`.

### Filters on `/shop` and `/shop/search`
URL-driven facets (shareable, SEO-friendly):
- `?artist=<slug>` — filter by Square `artist` custom attribute.
- `?ip=<slug>` — filter by Square `ip` custom attribute.
- `?type=<slug>` — filter by Square `product_type` custom attribute.
- `?sort=popularity|rating|latest|price-asc|price-desc|relevance` — sort order.
- `?page=<n>` — pagination (24 per page, standardized across shop + categories).

Filter sidebar (collapsible on mobile) shows:
- Artist (multi-select)
- IP (multi-select)
- Product type (radio)
- Sort dropdown

---

## 18. Webhooks & Data Freshness

### Square webhooks
Endpoint: `POST /api/webhooks/square`. Subscriptions managed in Square Developer Dashboard:

| Event | Action |
|-------|--------|
| `catalog.version.updated` | Trigger `revalidateTag('square-catalog')` → all product/shop pages refresh. Run a delta sync to update `product_cache` table. |
| `order.created` | Log to Postgres `order_log`. Update `abandoned_carts.status='in_checkout'`. |
| `order.updated` | Refresh `/account/orders/[id]` for the relevant user. |
| `order.fulfillment.updated` | If now `SHIPPED`/`COMPLETED`, refresh `/account/orders/[id]`. |
| `payment.created` | Fire Discord + SMS notifications. Fire GoAffPro conversion. Mark `abandoned_carts.status='completed'`. |

### GoAffPro webhooks
Endpoint: `POST /api/webhooks/goaffpro`. If GoAffPro provides webhook subscriptions (verify during impl), subscribe to affiliate creation/update events → revalidate `/artist` and the specific `/artist/[slug]`.

If no webhooks available, fallback: ISR revalidation every 15 minutes on all artist routes.

### Signature verification
- Square: HMAC-SHA256 with the webhook signing key — verified in middleware before processing.
- GoAffPro: HMAC if their webhook system supplies a signing secret (verify at integration time). If no signature is provided, restrict the webhook endpoint to known GoAffPro IP ranges and validate the payload shape against the affiliate ID claimed in the request.

---

## 19. Plausible Analytics

### Deployment
Plausible Community Edition on Coolify. Required containers:
- `plausible-app` (the main app)
- `plausible-postgres` (our shared Postgres instance, separate database)
- `plausible-clickhouse` (separate, dedicated to analytics events)

Plausible served at `analytics.animeniacs.shop`. Min 2GB RAM on host.

### Script
Loaded from our own domain to avoid ad-blocker detection:
```html
<script defer data-domain="animeniacs.shop" src="https://analytics.animeniacs.shop/js/script.js"></script>
```

### Custom events (fired client-side via `plausible()` function)

| Event | Props | Where |
|-------|-------|-------|
| `View Product` | `{ productId, artist, ip, productType }` | PDP mount |
| `Add to Cart` | `{ productId, productType, source }` (source = pdp/wishlist/recently-viewed) | On add |
| `Remove from Cart` | `{ productId }` | On remove |
| `Add to Wishlist` | `{ productId }` | On add |
| `Begin Checkout` | `{ itemCount, total }` | On `/checkout` click |
| `Purchase` | `{ orderId, total, itemCount }` + `revenue: { currency: 'USD', amount: total }` | On `/checkout/success` mount |
| `Newsletter Signup` | `{ source }` | On signup |
| `Search` | `{ query, resultCount }` | On search submit |

### Why client-side for Purchase event
Plausible's server-side event API requires real visitor IP + UA. Firing from a webhook = server-IP = Plausible silently drops as bot. Firing from `/checkout/success` page = real visitor context = counted correctly.

---

## 20. Tax Handling (TaxJar — admin-configurable)

### Default state
TaxJar disabled. No tax applied on orders. (Legal if under nexus thresholds; up to business owner.)

### When admin enables TaxJar
1. Admin enters TaxJar API key in `/admin/taxjar` + enables toggle.
2. Admin sets `from_address` (warehouse / fulfillment address).
3. On every checkout:
   - Server calls TaxJar `taxForOrder` API with cart items + buyer's shipping address.
   - Server adds resulting `taxes[]` entry to the Square Order before creating the payment link.
   - Square charges the buyer including the tax.

### Test mode
TaxJar offers a free dev API. Admin can wire up the dev key to validate the integration before flipping to a paid plan.

---

## 21. API Keys & Environment Variables

| Variable | Source | Where used |
|----------|--------|------------|
| `SQUARE_ACCESS_TOKEN` | Square Developer Dashboard | All Square API calls |
| `SQUARE_LOCATION_ID` | Square Dashboard | All Square API calls |
| `SQUARE_APPLICATION_ID` | Square Developer Dashboard | (For future Web Payments SDK if needed in v2) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square Developer Dashboard | Webhook verification |
| `SQUARE_ENV` | (set to `sandbox` or `production`) | Switches API base URLs |
| `GOAFFPRO_ADMIN_API_KEY` | GoAffPro admin panel | Server-side affiliate fetches |
| `GOAFFPRO_PUBLIC_TOKEN` | GoAffPro admin panel | Conversion/visit tracking |
| `LOGTO_APP_ID` | Logto console | Auth |
| `LOGTO_APP_SECRET` | Logto console | Auth |
| `LOGTO_ENDPOINT` | `https://auth.animeniacs.shop` | Auth |
| `LOGTO_COOKIE_SECRET` | Generate `openssl rand -base64 48` | Cookie signing (≥32 chars) |
| `LOGTO_BASE_URL` | `https://animeniacs.shop` | Auth redirects |
| `PLAUSIBLE_API_KEY` | Plausible self-hosted | (Optional — for server-side events if we ever need them) |
| `RESEND_API_KEY` | Resend dashboard | Newsletter + transactional |
| `RESEND_AUDIENCE_ID` | Resend dashboard | Newsletter audience |
| `SMSGATE_USER` | sms-edge admin | SMS sends |
| `SMSGATE_PASS` | sms-edge admin | SMS sends |
| `SMSGATE_BASE_URL` | `https://sms.relentnet.dev` | SMS sends |
| `DISCORD_ORDER_WEBHOOK_URL` | Discord channel webhook | Order alerts (alt: admin-configurable) |
| `DATABASE_URL` | Coolify Postgres | App DB connection |
| `NEXTAUTH_SECRET` / equivalent | Generate | Session security |
| `COOLIFY_API_TOKEN` | Coolify dashboard | CI/CD deploy hooks |
| `COOLIFY_URL` | Coolify dashboard | CI/CD deploy hooks |
| (Optional, v1.1) `ANTIGRO_API_SECRET_KEY` | Antigro onboarding | Custom product flow |
| (Optional, admin-configurable) `TAXJAR_API_KEY` | TaxJar dashboard | Tax calculation |

Two environments: dev uses Square sandbox; production uses live keys. All secrets in Coolify env-var UI, never committed.

---

## 22. Navigation & Footer

### Top navigation (every page)
`Home | Shop | Artists | Custom Acrylic | Custom Stickers | Search 🔍 | Wishlist ♡ | Cart 🛒 | Account 👤`

- Wishlist & Cart show item count badges.
- Account icon shows "Sign in" if not logged in.
- Search icon expands to inline search input.

### Footer (4 columns + bottom strip)

**Need Help**
- How to Display Your Art
- FAQs
- Contact Us

**Follow Us**
- Instagram (from `social_instagram_url` admin setting)
- Facebook (from `social_facebook_url`)
- Twitch (from `social_twitch_url`)
- TikTok (from `social_tiktok_url`, hidden if empty)
- Discord (from `discord_invite_url`)

**Partner with Us**
- Partner with Us
- Become an Artist (→ `affiliates.animeniacs.shop`)
- B2B
- Artist Agreement (→ `affiliates.animeniacs.shop/program-legal/terms`)
- Careers

**Info**
- About Us
- Terms of Service
- Privacy Policy
- Shipping Policy
- Refund & Return Policy

**Bottom strip:**
- Newsletter signup form (email + Subscribe button)
- Payment-method icons (Visa, Mastercard, Amex, Apple Pay, Google Pay) — informational, not interactive
- "© {year} Animeniacs"

### Phone number policy
Per user direction: `858-859-1851` lives only on `/contact-us`, not in the footer.

---

## 23. Migration Notes

### From WordPress
- **Products**: Already in Square — no migration needed for catalog itself. We must, however, run the **one-time custom-attribute-definition setup script** that creates `artist`, `ip`, and `product_type` definitions. Staff then fills these in for existing products via the Square dashboard.
- **Static content**: Migrated from current WP pages into `static-content-source/*.md` files committed to the repo. Privacy Policy updated: every mention of "Shopify" → "Square".
- **Artists**: Already in GoAffPro — no migration. Staff must ensure each artist has `label=artist` in their GoAffPro profile + a `slug` field that matches their `artist` custom attribute value in Square products.
- **Orders**: New site starts with empty order history. Old WP orders remain accessible in WordPress admin (decision: leave WP running in read-only mode for staff reference, or do a one-off CSV export).

### Going live
- Phase 1: Build + deploy to a staging subdomain (`staging.animeniacs.shop`) with Square sandbox keys.
- Phase 2: Internal testing — staff places test orders, validates the entire flow.
- Phase 3: Switch DNS for `animeniacs.shop` from current host to Coolify. Update Square keys to production. WordPress site decommissioned.
- Phase 4: Monitor `/admin/diagnostics` for 48 hours; verify Plausible events flowing, webhook deliveries succeeding, no errors in Discord notification channel.

### Decommission checklist (post-launch)
- Decommission WordPress hosting (or keep read-only for 30 days as a safety net).
- Cancel WordPress plugin subscriptions (SliceWP, WooCommerce extensions, Divi if applicable).
- Verify all redirects: old `/wp-content/...` image URLs continue to work or are 301'd (Square hosts the new images on its CDN; old WP image URLs may not be referenced anywhere on the new site).
- Verify `affiliates.animeniacs.shop` external link still works (no changes there; GoAffPro is unchanged).

---

## 24. Open Items (to verify during implementation)

These items have **medium-confidence assumptions** that should be validated early:

1. **GoAffPro affiliate response schema** — exact field names for bio, profile_image, social links. Verify with a live API call. Adapt data mapper.
2. **GoAffPro `/sdk/track/conversion` parameter names** — read the public CDN JS SDK or hit the endpoint to confirm.
3. **GoAffPro webhook availability** — verify whether they offer subscription endpoints for affiliate changes. If not, fall back to 15-minute ISR.
4. **Square Custom Attribute UI visibility** — confirm that after we create the definitions via API, they actually appear in the merchant Square dashboard as editable fields. (Square docs say yes; verify in production.)
5. **Antigro integration docs** — request from Antigro before v1.1 work begins. No impact on v1.
6. **TaxJar dev account** — sign up + verify the dev API key works with `taxForOrder` against a US address.
7. **Logto SMS verification** — confirm sms-edge is already routing for our Animeniacs Logto tenant; if not, add the tenant.

---

## 25. Future Considerations (v1.1+ — designed for, not built)

- **Antigro custom-product flow** (v1.1). Architecture ready: stub routes exist, `/api/checkout` already supports arbitrary line items + metadata.
- **Visual size picker** (v1.2 when multiple sizes per product exist).
- **Per-product upsell overrides** (currently global universal-upsells only).
- **Multi-state TaxJar nexus tracking** (currently single from-address only).
- **Per-affiliate WELCOME-style discount codes** (currently one global welcome code).
- **AR / wall-scale visualizer** (none of the competitors have this; differentiation opportunity).
- **Loyalty program** (Square has Loyalty product if needed).
- **Mobile app** (PWA-first design enables this naturally).

---

## End of spec.

**Approvals & sign-off:**
- Design phase: APPROVED by user on 2025-05-13.
- Static content sources: Pulled from live site on 2025-05-13.
- Ready for: spec self-review → user review → writing-plans skill.
