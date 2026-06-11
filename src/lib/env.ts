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

  // better-auth (Phase 15). SECRET signs sessions / hashes reset tokens — must
  // be a strong random value (openssl rand -hex 32) and is REQUIRED. URL is the
  // app's public base; falls back to NEXT_PUBLIC_SITE_URL when unset.
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

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
    console.error('[env] Invalid environment configuration:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

export const env = parseEnv()
