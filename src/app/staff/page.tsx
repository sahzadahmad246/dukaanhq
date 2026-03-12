import Link from "next/link";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

export default async function StaffPage() {
  const { user, profile, shop } = await getWorkspaceData();

  return (
    <WorkspaceShell
      title="Staff"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={profile?.role ?? "customer"}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <section className="grid gap-3">
        <div className="rounded-3xl border border-blue-100 bg-white/95 px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Staff</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">Team access and permissions</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Add staff members, assign store roles, and control who can access billing, inventory, and reports.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Current shop</div>
              <div className="mt-1 text-sm font-medium text-stone-950">{shop?.name ?? "-"}</div>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Access owner</div>
              <div className="mt-1 text-sm font-medium text-stone-950">{profile?.full_name ?? user.user_metadata.full_name ?? "-"}</div>
            </div>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="flex h-12 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
        >
          Back to Dashboard
        </Link>
      </section>
    </WorkspaceShell>
  );
}
