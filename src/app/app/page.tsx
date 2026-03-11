import Link from "next/link";
import { redirect } from "next/navigation";

import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AppPage() {
  const supabase = await createSupabaseServerClient();
  const { user, profile, profileSyncReady } = await syncAuthenticatedUserProfile(supabase);

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f172a,_#172554_26%,_#eff6ff_26%,_#f8fafc_100%)] px-4 py-6 text-stone-950">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_30px_120px_rgba(15,23,42,0.18)] backdrop-blur md:max-w-md lg:max-w-lg">
        <section className="rounded-[1.75rem] bg-[linear-gradient(135deg,_#111827,_#1d4ed8_60%,_#60a5fa)] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-100/80">
                DukaanHQ workspace
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Welcome, {profile?.full_name ?? user.user_metadata.full_name ?? "there"}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-blue-50/90">
                Your account is authenticated and ready for tenant setup. Next we
                connect your shop, onboarding flow, and staff roles.
              </p>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              {profile?.role ?? "customer"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="text-lg font-semibold">01</div>
              <div className="mt-1 text-blue-100/80">Auth live</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="text-lg font-semibold">02</div>
              <div className="mt-1 text-blue-100/80">Profile sync</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="text-lg font-semibold">03</div>
              <div className="mt-1 text-blue-100/80">Onboarding next</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-stone-500">
                Account snapshot
              </p>
              <h2 className="mt-1 text-xl font-semibold">Current session</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              Session active
            </span>
          </div>

          <dl className="grid gap-3 text-sm text-stone-700">
            <div className="rounded-2xl bg-stone-50 p-4">
              <dt className="text-stone-500">Full name</dt>
              <dd className="mt-1 font-medium text-stone-950">
                {profile?.full_name ?? user.user_metadata.full_name ?? "No name from Google"}
              </dd>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <dt className="text-stone-500">Email</dt>
              <dd className="mt-1 font-medium text-stone-950">{profile?.email ?? user.email}</dd>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <dt className="text-stone-500">Default role</dt>
              <dd className="mt-1 font-medium text-stone-950">{profile?.role ?? "customer"}</dd>
            </div>
          </dl>

          {!profileSyncReady ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Profile sync is waiting for the `profiles` table. Run the SQL in
              `db/001_profiles.sql` in Supabase SQL Editor, then sign in again.
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/onboarding"
            className="flex h-12 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            Start Onboarding
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
            >
              Sign Out
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
