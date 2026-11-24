export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto min-h-screen w-full max-w-3xl bg-[#f7f8fb] shadow-[0_18px_80px_rgba(15,23,42,0.08)] lg:border-x lg:border-stone-200">
        {/* Header skeleton */}
        <header className="border-b border-stone-200 bg-[#f7f8fb]/95 px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
            <div className="h-11 w-11 animate-pulse rounded-2xl bg-stone-200" />
            <div className="h-4 w-28 animate-pulse rounded-full bg-stone-200" />
            <div className="h-11 w-11 animate-pulse rounded-full bg-stone-200" />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-28">
          {/* Low stock alert skeleton */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              background: "#fef3c7",
              borderBottom: "1.5px solid #fcd34d",
              margin: "-8px -12px 0",
            }}
          >
            <div className="h-4 w-4 animate-pulse rounded bg-amber-300" />
            <div className="h-3 w-52 animate-pulse rounded-full bg-amber-200" />
          </div>

          {/* Greeting skeleton */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "18px 2px 18px" }}>
            <div className="h-4 w-28 animate-pulse rounded-full bg-stone-200" />
            <div className="h-4 w-20 animate-pulse rounded-full bg-stone-300" />
          </div>

          {/* Stat cards skeleton — 2x3 grid */}
          <div className="grid grid-cols-2 gap-2 mb-5" style={{ marginLeft: -4, marginRight: -4 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-[20px] border bg-white p-4"
                style={{
                  borderColor: ["#bbf7d0","#ddd6fe","#bfdbfe","#a7f3d0","#fed7aa","#fbcfe8"][i],
                  background: ["#f0fdf4","#f5f3ff","#eff6ff","#ecfdf5","#fff7ed","#fdf2f8"][i],
                  minHeight: 86,
                }}
              >
                <div className="h-2.5 w-20 animate-pulse rounded-full" style={{ background: `${["#bbf7d0","#ddd6fe","#bfdbfe","#a7f3d0","#fed7aa","#fbcfe8"][i]}` }} />
                <div className="mt-3 h-6 w-16 animate-pulse rounded-full" style={{ background: `${["#bbf7d0","#ddd6fe","#bfdbfe","#a7f3d0","#fed7aa","#fbcfe8"][i]}` }} />
              </div>
            ))}
          </div>

          {/* Quick actions skeleton */}
          <div className="mb-4" style={{ paddingLeft: 2 }}>
            <div className="h-3 w-24 animate-pulse rounded-full bg-stone-300 mb-3" />
            <div className="flex gap-2">
              <div className="h-10 w-28 animate-pulse rounded-full bg-stone-900" />
              <div className="h-10 w-28 animate-pulse rounded-full bg-white border border-stone-200" />
              <div className="h-10 w-24 animate-pulse rounded-full bg-white border border-stone-200" />
            </div>
          </div>

          {/* Today's summary skeleton */}
          <div className="mb-5 overflow-hidden rounded-[20px] border border-stone-200 bg-white" style={{ marginLeft: -4, marginRight: -4 }}>
            <div className="px-4 pt-4 pb-2">
              <div className="h-2.5 w-28 animate-pulse rounded-full bg-stone-200" />
            </div>
            <div className="grid grid-cols-2">
              <div className="flex flex-col items-center py-4 border-r border-stone-100">
                <div className="h-2.5 w-14 animate-pulse rounded-full bg-stone-200 mb-2" />
                <div className="h-6 w-10 animate-pulse rounded-full bg-stone-300" />
              </div>
              <div className="flex flex-col items-center py-4">
                <div className="h-2.5 w-10 animate-pulse rounded-full bg-stone-200 mb-2" />
                <div className="h-6 w-6 animate-pulse rounded-full bg-stone-300" />
              </div>
            </div>
          </div>

          {/* Recent bills section skeleton */}
          <div style={{ paddingLeft: 2 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-3 w-20 animate-pulse rounded-full bg-stone-300" />
              <div className="h-3 w-16 animate-pulse rounded-full bg-stone-200" />
            </div>

            <div className="space-y-2" style={{ marginLeft: -6, marginRight: -6 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-[20px] border border-stone-200 bg-white px-4 py-4"
                >
                  {/* Accent bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3.5px] rounded-sm"
                    style={{ background: ["#f97316","#3b82f6","#10b981"][i % 3] }}
                  />
                  {/* Row 1: Avatar + name + date */}
                  <div className="flex items-center justify-between mb-3 pl-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 animate-pulse rounded-full bg-stone-100" />
                      <div>
                        <div className="h-3.5 w-24 animate-pulse rounded-full bg-stone-300" />
                        <div className="mt-1.5 h-2.5 w-28 animate-pulse rounded-full bg-stone-200" />
                      </div>
                    </div>
                    <div className="h-2.5 w-16 animate-pulse rounded-full bg-stone-200" />
                  </div>
                  {/* Row 2: Item + amount */}
                  <div className="flex items-center justify-between pl-2">
                    <div>
                      <div className="h-2.5 w-28 animate-pulse rounded-full bg-stone-200" />
                      <div className="mt-1.5 h-2.5 w-12 animate-pulse rounded-full bg-stone-200" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-stone-300" />
                  </div>
                  {/* Row 3: Action icons */}
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <div className="h-6 w-6 animate-pulse rounded-full bg-stone-100" />
                    <div className="h-6 w-6 animate-pulse rounded-full bg-stone-100" />
                    <div className="h-6 w-6 animate-pulse rounded-full bg-stone-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom nav skeleton */}
        <nav className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-around border-t border-stone-200 bg-white/96 px-3 py-3 backdrop-blur">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex min-w-16 flex-col items-center gap-1">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${i === 0 ? "bg-stone-900" : "bg-stone-100"}`}>
                  <div className={`h-4 w-4 rounded ${i === 0 ? "bg-stone-700" : "bg-stone-300"}`} />
                </div>
                <div className="h-2 w-8 rounded-full bg-stone-200" />
              </div>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
