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

  // better-auth (Phase 15). SECRET signs sessions / hashes reset tokens. It is
  // OPTIONAL *in this schema* so the production build — which imports this module
  // while collecting page data — does NOT fail when the secret is a runtime-only
  // var in the deploy env (a build must not depend on runtime secrets; cf. the
  // Phase 9 force-dynamic post-mortem). Runtime presence is REQUIRED and enforced
  // in src/lib/auth.ts. URL is the app's public base; falls back to NEXT_PUBLIC_SITE_URL.
  BETTER_AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  // Comma-separated email allowlist granted admin regardless of the user-row
  // `role` column. Provisions admin WITHOUT direct DB access (the Postgres is
  // internal to Coolify). Empty/absent = disabled; the role column still works.
  ADMIN_EMAILS: z.preprocess(emptyToUndefined, z.string().optional()),

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
