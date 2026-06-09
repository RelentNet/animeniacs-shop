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
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1)
  return rows[0]?.value ?? null
}

/**
 * Cached read (60s) used by the storefront. revalidatePath('/') in the
 * admin save action busts it on change.
 */
export function getSetting(key: string): Promise<unknown | null> {
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
