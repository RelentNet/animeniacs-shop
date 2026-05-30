export default function Loading(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="h-8 w-1/2 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="mt-8 h-4 w-full animate-pulse rounded bg-gray-200" />
    </main>
  )
}
