export default function AdminLoading() {
  return <div role="status" aria-label="Loading admin page" className="space-y-5 motion-reduce:[&_*]:animate-none"><div className="h-8 w-48 animate-pulse rounded-lg bg-stone-200" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(value => <div key={value} className="h-28 animate-pulse rounded-2xl border border-stone-200 bg-white" />)}</div><div className="h-80 animate-pulse rounded-2xl border border-stone-200 bg-white" /><span className="sr-only">Loading admin page…</span></div>;
}
