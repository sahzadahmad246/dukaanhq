"use client";
import { adminButton } from "./_components/admin-ui";
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-lg font-semibold">Could not load this admin page</h2><p className="mt-2 text-sm text-stone-500">Try again. If the problem continues, check your service configuration and database access.</p><button onClick={reset} className={`${adminButton} mt-5`}>Try again</button></div>;
}
