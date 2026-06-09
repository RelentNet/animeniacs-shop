export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="aspect-[2/3] w-full animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    </div>
  )
}
