# Square production catalog — survey findings

**Date:** 2026-05-14
**Production location used:** `L182TWM8YVZSR` ("Animeniacs Mobile" — main site)
**Other location:** `L9G64BGJWXNF4` ("Online Sales" — secondary, also active)
**Merchant ID:** `ML9YFWJCKY96D`

This doc captures what's actually live in your production Square account today,
based on direct API probes against `connect.squareup.com`. Recorded so the spec
and implementation plan can be re-aligned to reality before any sandbox-mirror
or new-attribute work begins.

## Catalog inventory (counts)

| Type | Count | Notes |
|---|---|---|
| ITEM | 231 | the products themselves |
| ITEM_VARIATION | 419 | ~1.8 variations per item average; many use ITEM_OPTION |
| IMAGE | 594 | ~2.6 images per item |
| CATEGORY | 41 | hierarchical, see below |
| CUSTOM_ATTRIBUTE_DEFINITION | 5 | mostly Square system attrs; details below |
| ITEM_OPTION | 2 | `Media`, `Size` — used for real variants |
| ITEM_OPTION_VAL | 11 | individual values for the two options |
| MODIFIER_LIST | 0 | none |
| TAX | 11 | tax rates already configured |
| DISCOUNT | 20 | promo codes already in production |

## Custom attribute definitions

Production has 5 definitions today. **None of the spec's planned attributes
(`artist`, `ip`, `product_type`, `sibling_group`) exist in production.** The 5
that do exist:

| Key | Name | Origin | Allowed object types | Items using it |
|---|---|---|---|---|
| `is_alcoholic` | Is Alcoholic | Square system | ITEM | 0 |
| `ecom_target_classic_site_id` | Ecom Storefront Classic Site ID | Square system | ITEM | 0 |
| `ecom_gifting_enabled` | Ecom Gifting Enabled | Square system | ITEM | 0 |
| `Media` | Media | Staff-created | ITEM, ITEM_VARIATION | 0 |
| `Size` | Size | Staff-created | ITEM, ITEM_VARIATION | 0 |

The staff-created `Media` and `Size` *custom attributes* are unused. Variant
behavior is happening via `ITEM_OPTION` instead (see next section). Likely
these definitions were created early in the Square setup before staff settled
on the ITEM_OPTION pattern. Safe to ignore for now.

## ITEM_OPTION usage — this is how variants actually work in production

| Option | Values |
|---|---|
| **Media** (id `EBTWIT22YB5Z45M5RLECBWG3`) | `Acrylic Wall Art`, `Vinyl Decal Prints` |
| **Size** (id `J5WKTOQQZKPFMPWQMPIDVWUW`) | `16X24`, `12X12`, `24X24` (+ more) |

**Implication for the spec.** The original design (§3) assumed each art piece
would be **two separate ITEMs** linked by a `sibling_group` custom attribute,
because the brainstorm assumed Square treated acrylic vs vinyl as separate
products. **Production reality is the opposite**: one ITEM, multiple
ITEM_VARIATIONs, each variation references ITEM_OPTION_VALs for Media and/or
Size. This is the canonical Square pattern and we should align to it.

What this changes:

- The `sibling_group` custom attribute concept goes away. It's solved natively.
- The PDP variant picker (Acrylic | Vinyl tabs) reads from `item_option_values`
  on each variation, not from a `product_type` custom attribute and a sibling
  lookup.
- Phase 3 Task 5 (`pnpm square:setup` creating 4 definitions) shrinks to **2
  definitions**: `artist` and `ip`. Those two are still meaningful — there's
  no native Square concept for "the IP this art is from" or "the artist who
  drew this" — so they remain custom attributes. `product_type` is replaced
  by reading the `Media` ITEM_OPTION_VAL on each variation. `sibling_group` is
  redundant because variations already share an ITEM.

## Categories

41 categories, hierarchical. Top-level (root parent) and first level of
nesting:

```
Poster
Acoustic Art Panels
Acrylic Wall Art
Vinyl Wall Art
  └─ Life Size Art
Video Games
  ├─ Mortal Kombat
  └─ Street Fighter
Anime
  ├─ Overlord
  ├─ Attack on Titan
  ├─ Black Clover
  ├─ Berserk
  ├─ Yu Gi Oh
  ├─ One Piece
  ├─ Dragon Ball
  ├─ Naruto
  ├─ Baki
  ├─ Jujutsu Kaisen
  ├─ Hunter X Hunter
  ├─ Bleach
  ├─ Demon Slayer
  ├─ Mashle
  ├─ Shangri-La Frontier
  ├─ Death Note
  ├─ My Hero Academia
  ├─ Solo Leveling
  └─ One Punch Man
Pokemon
Comics
  ├─ Marvel
  └─ DC
Movies
Uncategorized
Slaps
Ani-Customs
portrait                        (lowercase; likely intended to be a tag, not a category)
Artist
  └─ Merc Da Artist             (only one artist as a sub-category — others not yet migrated to this taxonomy)
Not Online
Lit Box Frame
```

**Observations:**

1. **The "Artist" category is half-built.** Only "Merc Da Artist" exists under
   it. Other artists (Bxnny, Saru, etc.) appear as top-level brands on the
   WordPress site but don't have Square category entries yet.
2. **"portrait" is lowercase and a top-level category.** Probably meant to be
   an attribute (orientation = portrait/landscape) but ended up as a category.
3. **Anime franchises ARE categorized** (Naruto, Dragon Ball, etc. as
   sub-categories of Anime). This is the IP information we'd otherwise put in
   the `ip` custom attribute. **Possible alternative design:** drop the `ip`
   custom attribute too, derive IP from the category tree.

## Item options vs custom attributes — recommended design

Given what production actually does, here's the simpler model:

| Concept | Mechanism in Square |
|---|---|
| **What's the art / which medium / which size** | `ITEM_OPTION` (`Media`, `Size`) on `ITEM_VARIATION`s — already in place |
| **Which IP/franchise** | `CATEGORY` (already populated for anime; needs cleanup for Comics/Marvel/DC and adding a few more) |
| **Which artist** | NEW custom attribute `artist` OR a "Brand"-style category. Decision below. |
| **Which orientation (portrait/landscape)** | TBD — currently the "portrait" top-level category is doing this poorly. Could be cleaned up to either a custom attribute or a proper category. |

**Recommended:** keep `artist` as a custom attribute (string) because:
- Categories are hierarchical and we'd be adding ~14+ artist sub-categories to
  the "Artist" category, which clutters the seller's category browser.
- Custom attributes give us a clean string to match against GoAffPro affiliate
  slugs without needing to query category lookups.
- One field per item, easily filterable in the dashboard, easy to leave blank
  for non-artist items (Lit Box Frame, accessories).

Drop `ip`, `product_type`, and `sibling_group` from the planned spec. Use
existing categories for IP, ITEM_OPTION for product_type, and ITEM_VARIATIONs
for sibling-grouping.

## Sample item: "Custom UV Printed Decals" (id `5EZTE7ZNS2XSHW65RA5GREQ3`)

3 variations, all share the same Media (Vinyl Decal Prints), differ only by Size:

- `12X12`  → $7.00
- `24X24`  → $0.00 (sold out)
- (and a 3rd not shown in the truncation)

This is a clean example of the production pattern.

## Sample item: "10 for 10 Slaps" (id `6XSRYR2HPWKWRP5CNVUHA55A`)

1 variation only (no Media or Size option used). Category: Slaps. This is the
"simple product" case — no variants. Most items will fall into either this
case or the Custom UV Printed Decals case.

## Tax IDs attached to items

Every item has 11 tax IDs attached. These are pre-configured tax rates in
Square (sales tax for various jurisdictions). **Out of scope for Phase 3** —
Square Checkout will apply the correct tax based on the buyer's address
automatically. Just noting they exist so we don't accidentally strip them when
mirroring.

## Channels

Items reference two channel IDs:
- `CH_hSatXj1lOCG50Q9YUQQzSmkNsykvubv3k4pfYRlQuYC`
- `CH_VC7kd54IOW5q1ZMVzhHfyuP1KEUV72BuBrZ3EUR29945o`

These are Square's "sales channels" feature (point-of-sale, online ordering,
etc.). **Out of scope for Phase 3** — we read items as-is and don't manage
channels.

## Discounts

20 discount objects exist (presumably promo codes like the artist commission
codes). **Out of scope for Phase 3 / 4** — these become relevant in Phase 5
(GoAffPro affiliate coupons) and Phase 8 (Square Checkout).

---

## Decisions this survey forces on the spec

1. **Drop `sibling_group` custom attribute.** Variants are handled by
   ITEM_OPTION + ITEM_VARIATION natively.
2. **Drop `product_type` custom attribute.** Read from the `Media` ITEM_OPTION
   value on each variation instead.
3. **Drop `ip` custom attribute** *if* we use the existing category tree to
   represent franchises (Naruto, Dragon Ball, etc. already categorized). If
   the category tree turns out to be inconsistent for Comics/Marvel/DC, we'd
   add `ip` back as a custom attribute. **Default position: drop it for v1,
   add later if needed.**
4. **Keep `artist` as a custom attribute (string).** This is the only new
   attribute we actually need to add to production.
5. **The `CachedProduct` shape changes.** Variations now carry their own
   ITEM_OPTION values (Media, Size). Add an `itemOptions` field to
   CachedVariation. Image references stay item-level (since Square attaches
   images to the ITEM, not the ITEM_VARIATION).
6. **The mirror script** (production → sandbox) becomes the canonical way to
   populate sandbox for development. We do NOT create test items by hand.

## What this means for the existing Phase 3 plan

The plan as written assumed all 4 attributes existed. Now that we know
production reality:

- **Task 5** (custom attribute setup script) shrinks: only creates `artist`.
- **Task 6** (catalog reads + denormalizer) needs to handle ITEM_OPTION and
  ITEM_OPTION_VAL — the variation picker reads from these.
- **Task 2** (TypeScript types) needs an update: drop `PRODUCT_TYPES`, add
  `CachedItemOption` and `CachedItemOptionValue` types, add `itemOptions` to
  `CachedVariation`. (Task 2 already shipped with the old shape — needs a
  follow-up commit to revise.)
- **NEW Task 4b** (production→sandbox mirror script) is added between Tasks 4
  and 5, replacing the manual "create a test item by hand" step in Task 8.

This is enough of a shift to justify a small spec patch + a Phase 3 plan
amendment before the next subagent dispatch. Spec change is targeted (§3
"Variant pattern" subsection); plan amendment is bigger (revises Task 2,
revises Task 5, adds Task 4b).
