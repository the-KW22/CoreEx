// What every page under app/(app) shows the moment its link is clicked, while its data loads (loading.tsx).
// Next prefetches it with the link, so it needs no round trip to the server.
export function PageSkeleton() {
  const block = "animate-pulse rounded-[14px] bg-surface";
  return (
    <div role="status" className="mx-auto grid max-w-5xl gap-6">
      <span className="sr-only">Loading…</span>
      <div className={`${block} h-9 w-64 max-w-full`} />
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-12`} />
        ))}
      </div>
    </div>
  );
}
