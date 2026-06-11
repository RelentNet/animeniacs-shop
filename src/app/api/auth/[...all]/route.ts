import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

// better-auth mounts its whole REST surface (sign-in/up/out, session, reset,
// etc.) under /api/auth/* via this catch-all. Reads cookies + DB at request
// time, so it must never be statically prerendered.
export const dynamic = 'force-dynamic'

export const { GET, POST } = toNextJsHandler(auth)
