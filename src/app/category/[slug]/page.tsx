import { getProductsForIpNickname } from '@/lib/categories'
import { getIpNicknameBySlug } from '@/lib/db/queries/ip-nicknames'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PageProps) {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) return { title: 'Not found | Animeniacs' }
  return {
    title: `${nickname.nickname} | Animeniacs`,
    description:
      nickname.description?.slice(0, 160) ?? `Drops featuring ${nickname.nickname}.`
  }
}

export default async function CategoryPage({ params }: PageProps): Promise<JSX.Element> {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) notFound()

  const products = await getProductsForIpNickname(nickname)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header
        className="mb-8 flex h-48 items-center justify-center rounded-lg"
        style={{
          // Brand-neutral CSS gradient until per-IP cover image uploads land.
          background: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)'
        }}
      >
        <h1 className="text-4xl font-bold text-white">{nickname.nickname}</h1>
      </header>

      {nickname.description && (
        <p data-testid="ip-description" className="mb-8 text-gray-700">
          {nickname.description}
        </p>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg bg-gray-50 p-8 text-center">
          <p>No drops featuring {nickname.nickname} just yet.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Drops</h2>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/product/${p.id}` as Route}
                  className="block rounded-lg transition hover:opacity-90"
                >
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      width={600}
                      height={900}
                      className="aspect-[2/3] w-full rounded-md object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-gray-200 text-sm text-gray-500"
                    >
                      No image
                    </div>
                  )}
                  <div className="mt-2 text-sm font-medium">{p.name}</div>
                  {p.priceCents !== null && (
                    <div className="text-sm text-gray-600">
                      ${(p.priceCents / 100).toFixed(2)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
