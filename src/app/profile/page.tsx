import { redirect } from "next/navigation";

import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/app/_components/workspace-shell";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function ProfilePage() {
  const { user, profile, shop } = await getWorkspaceData();

  return (
    <WorkspaceShell
      title="Profile"
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
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Owner profile</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">
            {profile?.full_name ?? user.user_metadata.full_name ?? "User profile"}
          </h1>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Email</div>
              <div className="mt-1 text-sm font-medium text-stone-950">{profile?.email ?? user.email}</div>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Role</div>
              <div className="mt-1 text-sm font-medium capitalize text-stone-950">{profile?.role ?? "customer"}</div>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Shop</div>
              <div className="mt-1 text-sm font-medium text-stone-950">{shop?.name ?? "-"}</div>
            </div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
          >
            Sign Out
          </button>
        </form>
      </section>
    </WorkspaceShell>
  );
}
