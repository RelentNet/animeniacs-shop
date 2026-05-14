import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  LOGTO_ENDPOINT: z.string().url().default('http://localhost:3001'),
  LOGTO_APP_ID: z.string().min(1).optional(),
  LOGTO_APP_SECRET: z.string().min(1).optional(),
  LOGTO_COOKIE_SECRET: z.string().min(32).optional(),

  // Square (Phase 3)
  // Sandbox keys are required for any dev where the SDK is touched.
  // Production keys arrive at Phase 17.
  SQUARE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_ACCESS_TOKEN: z.string().min(1).optional(),
  SQUARE_LOCATION_ID: z.string().min(1).optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional()
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

export const env = parseEnv()
