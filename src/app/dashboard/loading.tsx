import Image from "next/image";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#f4f5f7]">
      <div className="mx-auto flex min-h-screen w-full max-w-[645px] flex-col px-5 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[#f5c542]">
            <Image src="/logo.png" alt="DukaanHQ" width={44} height={44} className="h-11 w-11 object-cover" />
          </div>
          <div>
            <p className="text-[16px] font-black tracking-tight text-stone-950">DukaanHQ</p>
            <p className="text-[12px] text-stone-500">Loading your dashboard</p>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-3 h-3 w-28 animate-pulse rounded-full bg-stone-200" />
          <div className="h-8 w-48 animate-pulse rounded-full bg-stone-300" />
          <div className="mt-4 h-3 w-56 animate-pulse rounded-full bg-stone-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[24px] border border-stone-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="mb-4 h-3 w-20 animate-pulse rounded-full bg-stone-200" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-stone-300" />
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="mb-4 h-3 w-36 animate-pulse rounded-full bg-stone-200" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-2xl bg-stone-200" />
                  <div className="min-w-0">
                    <div className="h-3 w-28 animate-pulse rounded-full bg-stone-300" />
                    <div className="mt-2 h-3 w-20 animate-pulse rounded-full bg-stone-200" />
                  </div>
                </div>
                <div className="h-3 w-16 animate-pulse rounded-full bg-stone-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
