import { getProductById } from '@/lib/products/cache'
import type { CachedProduct } from '@/lib/square/types'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const RequestSchema = z.object({
  ids: z.array(z.string().min(1)).max(50)
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const uniqueIds = Array.from(new Set(parsed.data.ids))

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        return [id, await getProductById(id)] as const
      } catch {
        return [id, null] as const
      }
    })
  )

  const products: Record<string, CachedProduct | null> = {}
  for (const [id, product] of results) {
    products[id] = product
  }

  return NextResponse.json({ products })
}
