/**
 * Site-wide hardcoded copy that an admin will eventually edit through
 * `/admin/settings` (deferred to Phase 7+). Constants live here so the
 * operator can tweak copy via a one-line code change in the meantime.
 */

export const PRODUCTION_TIME_TEXT = 'Ships in 3-10 days depending on convention schedule.'

/**
 * Shown on the cart drawer's disabled Checkout button while Phase 6
 * ships cart-only. Phase 7 enables the button and removes the tooltip.
 *
 * Phase 5's old `DISABLED_ADD_TO_CART_TOOLTIP` was renamed to this in
 * Phase 6 — the Add to Cart button is now live, and the disabled-with-
 * tooltip pattern moved to the Checkout button instead.
 */
export const DISABLED_CHECKOUT_TOOLTIP =
  'Checkout launching soon — follow us on Instagram for the launch.'

// Cart drawer trust badges (Decision 8). Three short copy lines shown
// in the drawer footer.
export const CART_BADGE_DELIVERY = 'Ships in 3-10 days depending on convention schedule.'
export const CART_BADGE_HANGING_STRIPS = 'Free hanging strips included with every order.'
export const CART_BADGE_SUPPORT_ARTIST = 'Every purchase supports an independent artist.'
