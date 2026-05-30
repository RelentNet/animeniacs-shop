import 'server-only'
import { z } from 'zod'

/**
 * Coerce empty strings to undefined so `min(1).optional()` fields don't
 * fail when the env var is present in .env.local but unset (e.g.,
 * `SQUARE_WEBHOOK_SIGNATURE_KEY=` with no value). dotenv-style files
 * make it easy to leave a key with an empty value as a placeholder;
 * we want those treated identically to a fully-absent key.
 */
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  LOGTO_ENDPOINT: z.string().url().default('http://localhost:3001'),
  LOGTO_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LOGTO_APP_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  LOGTO_APP_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  LOGTO_COOKIE_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),

  // Square (Phase 3)
  // Sandbox keys are required for any dev where the SDK is touched.
  // Production keys arrive at Phase 17.
  SQUARE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SQUARE_LOCATION_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  // Plausible analytics — script URL on the central instance.
  // Public (NEXT_PUBLIC_*) because the values end up in the
  // rendered <script> tag. Domain defaults to animeniacs.shop.
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.preprocess(emptyToUndefined, z.string().min(1).optional())
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    // Phase 7.5 deploy diagnostic: print presence + length of every key
    // we examine so a crash-looping container reveals exactly which
    // env var is missing/malformed in the runtime environment. Remove
    // once dev.animeniacs.shop deploy is stable (see Phase 7.5 handoff).
    const diagKeys = [
      'NODE_ENV',
      'DATABASE_URL',
      'NEXT_PUBLIC_SITE_URL',
      'LOGTO_ENDPOINT',
      'LOGTO_APP_ID',
      'LOGTO_APP_SECRET',
      'LOGTO_COOKIE_SECRET',
      'SQUARE_ENV',
      'SQUARE_ACCESS_TOKEN',
      'SQUARE_LOCATION_ID',
      'SQUARE_WEBHOOK_SIGNATURE_KEY'
    ]
    console.error('[env] Invalid environment configuration; presence diagnostic:')
    for (const k of diagKeys) {
      const v = process.env[k]
      console.error(
        `[env]   ${k}: ${
          v === undefined ? 'MISSING' : v === '' ? 'present-but-empty' : `present (len=${v.length})`
        }`
      )
    }
    console.error('[env] Zod field errors:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

export const env = parseEnv()
