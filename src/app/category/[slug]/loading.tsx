export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 h-48 w-full animate-pulse rounded-lg bg-wall-2 motion-reduce:animate-none" />
      <div className="mb-8 h-4 w-1/2 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-[2/3] w-full animate-pulse rounded-lg bg-wall-2 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}
