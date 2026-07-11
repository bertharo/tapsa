export function SummarySkeleton() {
  return (
    <div className="mt-4 space-y-2" aria-hidden="true">
      <div className="h-4 w-full animate-pulse rounded bg-ink/8" />
      <div className="h-4 w-[92%] animate-pulse rounded bg-ink/6" />
      <div className="h-4 w-[78%] animate-pulse rounded bg-ink/5" />
    </div>
  );
}

export function ConnectionGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-ink/10 bg-white p-4 shadow-node"
        >
          <div className="h-4 w-3/4 animate-pulse rounded bg-ink/8" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-ink/5" />
          <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-ink/5" />
        </div>
      ))}
    </div>
  );
}

export function TopicPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse">
      <div className="rounded-3xl border border-ink/10 bg-white px-6 py-7 shadow-node sm:px-9 sm:py-9">
        <div className="h-3 w-20 rounded bg-ink/8" />
        <div className="mt-4 h-9 w-2/3 rounded bg-ink/10" />
        <SummarySkeleton />
      </div>
      <div className="mt-6">
        <div className="mb-3 h-3 w-24 rounded bg-ink/8" />
        <ConnectionGridSkeleton count={4} />
      </div>
    </div>
  );
}
