import 'server-only'
import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'

export const PromoBarValueSchema = z.object({
  enabled: z.boolean(),
  text: z.string().min(1).max(200),
  link: z.string().url().optional().or(z.literal('')),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/)
})

export type PromoBarValue = z.infer<typeof PromoBarValueSchema>

/**
 * Uncached read of a single setting's jsonb value. Returns null if the
 * key is absent. Callers validate the shape with the appropriate schema.
 */
async function readSetting(key: string): Promise<unknown | null> {
  try {
    const rows = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1)
    return rows[0]?.value ?? null
  } catch {
    // A transient DB outage must not 500 the whole storefront over an optional
    // cosmetic setting (e.g. the promo bar). Degrade to "unset" — callers
    // already treat null as "render nothing". Also lets pages that only depend
    // on settings render standalone when the DB is down (e.g. local previews).
    return null
  }
}

/**
 * Cached read (60s) used by the storefront. revalidatePath('/') in the
 * admin save action busts it on change.
 *
 * Build-phase guard (spec §4): during `next build` the Docker builder can't
 * resolve the DB host, and PromoBar (which reads this on every prerendered
 * page) would throw ENOTFOUND. Return null immediately — no cache, no db.
 * PromoBar already renders nothing for null; the first ISR regeneration fills
 * it in at runtime. Mirrors the NEXT_PHASE idiom in src/lib/auth.ts.
 */
export function getSetting(key: string): Promise<unknown | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return Promise.resolve(null)
  }
  const cached = unstable_cache(() => readSetting(key), ['site-settings', key], {
    revalidate: 60
  })
  return cached()
}

/**
 * Upsert a setting value (jsonb). ON CONFLICT (key) DO UPDATE.
 */
export async function upsertSetting(
  key: string,
  value: unknown,
  updatedBy: string | null
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedBy, updatedAt: new Date() }
    })
}
