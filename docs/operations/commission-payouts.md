# Monthly commission payouts — operator workflow

This is the manual monthly process for paying out artist commissions.
Phase 4 explicitly chose no commission-engine code; everything below
is point-and-click in Square + a multiplication step.

## Cadence

Recommended: **last Friday of the month**, paying out the previous
calendar month's sales. Operator's call — adjust as needed.

## What you need open

1. **Square Dashboard** → `https://app.squareup.com`
2. **Postgres** access (or `pnpm db:studio`) so you can read the
   `artists` table for the per-artist `commission_rate`. You can also
   read commission rates from `/admin/artists` once Logto is wired up.
3. **A scratch spreadsheet** (Numbers / Google Sheets / a .csv file
   on your laptop). One row per artist; columns: artist name, gross
   sales, discounts applied, net pre-tax, commission rate, commission
   owed, payment method, payment email, paid-on date.

## Step-by-step

### 1. Pull Sales by Category from Square

1. Square Dashboard → **Reports** → **Item sales** → **By
   category** (or **Sales by Category** in some dashboard versions).
2. Set the date range to the month you're paying out (e.g.
   `2026-04-01` through `2026-04-30`).
3. Set the location filter to **all locations** (or whatever subset
   you want to pay against — be consistent across artists).
4. Filter the category list to children of **Artist > \***. The
   report should now show one row per artist sub-category with gross
   sales for that period.
5. Export to CSV.

### 2. Subtract discounts (net-of-discount, pre-tax)

The discount handling follows the rule captured in
`docs/superpowers/specs/reference/goaffpro-api-probes.md §10`:

- **Site-wide promo discounts (e.g. an Anime Expo 10%-off coupon):**
  subtract the discounted portion before applying commission. The
  artist eats their pro-rata share of the discount.
- **Per-customer manual discounts (rare):** same treatment — net of
  discount, pre-tax.
- **Military / first-responder / convention discounts that you've
  decided to absorb:** these come off **your** margin, not the
  artist's. Don't subtract before commission.

If you need a per-discount breakdown, run **Reports → Discounts**
for the same date range and reconcile.

### 3. Multiply by each artist's commission rate

For each row in the Sales-by-Category report:

```
commission_owed = (gross_sales - artist_borne_discounts) * commission_rate
```

`commission_rate` lives in the `artists` table. Look it up via
`/admin/artists` or:

```sql
SELECT slug, display_name, commission_rate
  FROM artists
  WHERE status = 'active'
  ORDER BY display_name;
```

Rates are stored as decimals (e.g. `0.2000` = 20%).

### 4. Pay

For each artist:

1. Read `payment_method` and `payment_email` from the `artists`
   table (or admin UI).
2. Send the payment via that method (PayPal, Venmo, Zelle, check).
3. Record the payment date in your scratch spreadsheet.

### 5. Note the payout

Record what you paid where so disputes are auditable. Two options
that are good enough:

- **Append a line to the artist's `notes` field** via
  `/admin/artists/[id]`:

  ```
  2026-05-30: paid $187.42 for April sales via Venmo @bxnny-arts. Tx ref: 123-abc
  ```

  The `notes` field has a 4000-char limit; multiple months fit fine.

- **Maintain an external ledger** (spreadsheet, accounting software)
  if you'd rather not put payment refs in the DB. Either works.

## Edge cases

### An artist sub-category has $0 sales

Skip them. No payout, no entry needed. The `artists` row stays
`active` so they show up on `/artist`.

### An artist was archived mid-month

If you flipped status to `inactive` mid-month, they earned commission
on sales before that date. Treat the same way as an active artist
for that month — the status field is forward-looking, not retroactive.

### A product is in two artist sub-categories (collab piece)

Sales-by-Category will count the sale under **both** categories,
which would double-pay. Square doesn't natively split this. Three
options:

1. Decide at category-assignment time that collabs go under just one
   primary artist's category and the other artist gets paid via a
   manual side-channel (your call as operator).
2. Pay both artists per the report and treat the doubled cost as the
   collab premium.
3. Manually adjust the rows: subtract half from each artist's gross
   before multiplying.

Most months will have zero collabs; pick whichever rule and stay
consistent.

### A discount was applied to a multi-artist cart

The Sales-by-Category report already pro-rates discounts across
categories. You typically don't need to adjust manually unless the
discount was huge.

### An artist's commission rate changed mid-month

Edit `commission_rate` via `/admin/artists/[id]`. For the partial
month, either:

- Pro-rate the change (do the math by hand).
- Use the new rate for the full month (small bias, simpler).

Be consistent and document your choice in the artist's `notes` field.

## Why no code does this

Phase 4 explicitly chose a manual workflow over building a commission
engine. Reasoning (captured in `goaffpro-api-probes.md §11` and the
Phase 4 plan's `Decisions captured`):

1. Square already provides the report. Adding code is duplicating
   what Square does.
2. Edge cases (split discounts, collab attribution, partial-month
   rate changes) need human judgment.
3. Volume is low enough (currently ~14 artists, monthly cadence)
   that the 30 min of clicking + multiplication isn't worth
   automating.

If volume ever justifies it, future workstreams could build:
- An `/admin/payouts` page that pulls Sales-by-Category via Square's
  Orders API and pre-fills the multiplication.
- A `commission_payouts` table to log payouts.
- A monthly cron that emails the operator a draft payout sheet.

None of that is Phase 4. Don't build it speculatively.
