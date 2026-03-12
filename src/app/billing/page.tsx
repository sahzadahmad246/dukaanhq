import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { WorkspaceShell } from "@/app/_components/workspace-shell";

export default async function BillingPage() {
  const { user, profile, shop } = await getWorkspaceData();

  return (
    <WorkspaceShell
      title="Billing"
      activeNav="billing"
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
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Billing</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">Invoices and payments</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This page is ready for billing modules. Hook invoices, payment status, and collections here next.
          </p>
        </div>
      </section>
    </WorkspaceShell>
  );
}
