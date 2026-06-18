export default function Loading(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="h-9 w-1/2 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
      <div className="mt-10 h-32 w-full animate-pulse rounded-lg bg-wall-2 motion-reduce:animate-none" />
    </main>
  )
}
