import Link from "next/link";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

export default async function DashboardPage() {
  const { user, profile, profileSyncReady, shop } = await getWorkspaceData();

  return (
    <WorkspaceShell
      title="Dashboard"
      activeNav="dashboard"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={profile?.role ?? "customer"}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <div className="flex flex-col gap-4 px-1 py-1 md:px-2">
        <section className="grid gap-4 border-b border-white/10 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Dashboard</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
                {shop?.name ?? "Set up your first shop"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {shop
                  ? `Logged in as ${profile?.full_name ?? user.user_metadata.full_name ?? "owner"}. Your shop is active and ready for the next dashboard modules.`
                  : "You are signed in. Complete onboarding to create your shop and unlock the owner workspace."}
              </p>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700">
              {profile?.role ?? "customer"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
              <div className="text-lg font-semibold text-stone-950">{shop ? "01" : "--"}</div>
              <div className="mt-1 text-xs text-stone-600">{shop ? "Shop ready" : "No shop yet"}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
              <div className="text-lg font-semibold text-stone-950">{profile?.role === "owner" ? "02" : "--"}</div>
              <div className="mt-1 text-xs text-stone-600">{profile?.role === "owner" ? "Owner access" : "Customer role"}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-3">
              <div className="text-lg font-semibold text-stone-950">03</div>
              <div className="mt-1 text-xs text-stone-600">Dashboard next</div>
            </div>
          </div>
        </section>

        <section className="-mt-4 grid gap-3 md:-mt-5">
          {shop ? (
            <>
              <div className="rounded-2xl border border-blue-100 bg-white/96 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Shop name</div>
                <div className="mt-1 text-base font-semibold text-stone-950">{shop.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-blue-100 bg-white/92 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Slug</div>
                  <div className="mt-1 text-sm font-medium text-stone-950">{shop.slug}</div>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white/92 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Status</div>
                  <div className="mt-1 text-sm font-medium capitalize text-stone-950">{shop.status}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white/92 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Location</div>
                <div className="mt-1 text-sm font-medium text-stone-950">
                  {[shop.city, shop.state].filter(Boolean).join(", ") || "-"}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              No shop is linked to this account yet. Start onboarding to create your first shop.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-100 bg-white/92 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Full name</div>
              <div className="mt-1 text-sm font-medium text-stone-950">
                {profile?.full_name ?? user.user_metadata.full_name ?? "No name from Google"}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white/92 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Email</div>
              <div className="mt-1 break-all text-sm font-medium text-stone-950">{profile?.email ?? user.email}</div>
            </div>
          </div>

          {!profileSyncReady ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Profile sync is waiting for the `profiles` table. Run `db/001_profiles.sql` in Supabase SQL Editor, then sign in again.
            </div>
          ) : null}
        </section>

        <section className="mt-auto grid gap-3 sm:grid-cols-2">
          {shop ? (
            <div className="flex h-12 items-center justify-center rounded-full border border-blue-100 bg-white/92 px-5 text-sm font-semibold text-stone-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              {shop.name}
            </div>
          ) : (
            <Link
              href="/onboarding"
              className="flex h-12 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
            >
              Start Onboarding
            </Link>
          )}
          <Link
            href="/profile"
            className="flex h-12 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
          >
            Profile
          </Link>
        </section>
      </div>
    </WorkspaceShell>
  );
}
