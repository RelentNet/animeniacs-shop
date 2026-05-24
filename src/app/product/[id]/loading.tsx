export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-[16/10] w-full animate-pulse rounded bg-gray-200" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
          <div className="h-12 w-full animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  )
}
