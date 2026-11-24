export function WorkspacePageLoading({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-950" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <div className="mx-auto min-h-screen w-full max-w-3xl bg-[#f7f8fb] lg:border-x lg:border-stone-200">
        <div className="flex h-20 items-center justify-between border-b border-stone-200 px-4">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="h-10 w-10 animate-pulse rounded-full bg-stone-200" aria-hidden="true" />
        </div>
        <div className="space-y-4 px-3 py-5 motion-reduce:[&_*]:animate-none" aria-hidden="true">
          <div className="h-11 animate-pulse rounded-xl bg-stone-200/70" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
              <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200/70" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-stone-100" />
              <div className="h-8 animate-pulse rounded-lg bg-stone-100" />
            </div>
          ))}
        </div>
        <p className="sr-only" role="status">Loading {title.toLowerCase()}…</p>
      </div>
    </main>
  );
}
