import 'server-only'
import { z } from 'zod'
import { getSetting, upsertSetting } from './site-settings'

/**
 * Operator-editable shipping configuration, stored under the `shipping`
 * site_settings key (jsonb). Read at runtime in the rate/checkout path; the
 * admin Shipping tab writes it. Reuses the site-settings get/upsert + its
 * build-phase guard (getSetting returns null during `next build`, so we fall
 * back to DEFAULTS — no DB at build time).
 */

export const SHIPPING_SETTINGS_KEY = 'shipping'

/** Ship-from / origin address used as the Shippo rating origin. */
export const ShipFromSchema = z.object({
  name: z.string().min(1).max(120),
  street1: z.string().min(1).max(200),
  street2: z.string().max(200).optional().default(''),
  city: z.string().min(1).max(120),
  // Some destinations have no state/province; allow blank.
  state: z.string().max(120).optional().default(''),
  zip: z.string().min(1).max(20),
  country: z.string().length(2).default('US'),
  phone: z.string().max(40).optional().default(''),
  email: z.string().email().or(z.literal('')).optional().default('')
})

export type ShipFrom = z.infer<typeof ShipFromSchema>

/**
 * Default ship-from / rating origin (the Animeniacs studio). The operator can
 * override it in the admin Shipping tab (e.g. to add a phone for carriers that
 * require one). Live rate quotes rate from here.
 */
export const DEFAULT_SHIP_FROM: ShipFrom = {
  name: 'Animeniacs',
  street1: '2048 Black Oak Drive',
  street2: '',
  city: 'Marrero',
  state: 'LA',
  zip: '70072',
  country: 'US',
  phone: '',
  email: ''
}

export const ShippingSettingsSchema = z.object({
  shipFrom: ShipFromSchema.default(DEFAULT_SHIP_FROM),
  /** Flat shipping for decals / stickers / posters / misc (not box-rated). */
  decalFlatCents: z.number().int().nonnegative().max(1_000_000).default(500),
  /** Fallback flat fee when live rating fails or returns nothing. */
  fallbackFlatCents: z.number().int().nonnegative().max(1_000_000).default(1000),
  /** Percentage markup applied on top of carrier rates (0 = none). */
  markupPercent: z.number().min(0).max(100).default(0)
})

export type ShippingSettings = z.infer<typeof ShippingSettingsSchema>

/** All-defaults settings (also used as the runtime fallback). */
export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = ShippingSettingsSchema.parse({})

export async function getShippingSettings(): Promise<ShippingSettings> {
  const raw = await getSetting(SHIPPING_SETTINGS_KEY)
  const parsed = ShippingSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : DEFAULT_SHIPPING_SETTINGS
}

export async function saveShippingSettings(
  value: ShippingSettings,
  updatedBy: string | null
): Promise<void> {
  await upsertSetting(SHIPPING_SETTINGS_KEY, value, updatedBy)
}
