import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function SuspendedPage() {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.isSuspendedMembership) {
    redirect(getSignedInLandingPath(state));
  }

  const displayName =
    state.profile?.full_name ?? state.user.user_metadata.full_name ?? state.user.email ?? "there";

  return (
    <main className="min-h-screen bg-[#f7f3e8] px-5 py-10 text-stone-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-red-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-9">
          <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-red-700">
            Access Suspended
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-stone-950">
            Your shop access has been suspended.
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            Hi {displayName}. The shop owner has temporarily suspended your staff access. You can&apos;t open the
            dashboard, billing, inventory, profile, or any other shop data until they reactivate your account.
          </p>
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-7 text-stone-700">
            If you were just reactivated, refresh this page or sign in again and we&apos;ll take you back into the
            shop automatically.
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Go to Home
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
              >
                Sign Out
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
