import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadDashboardData } from "./load-dashboard-data";
import { DashboardHome } from "./_components/dashboard-home";

export default async function DashboardPage() {
  const { user, profile, shop, stats, recentInvoices, recentProducts, products, categories, brands } =
    await loadDashboardData();

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
      <DashboardHome
        ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop Owner"}
        shopLogoUrl={shop?.logo_url ?? null}
        stats={stats}
        recentInvoices={recentInvoices}
        recentProducts={recentProducts}
        products={products}
        categories={categories}
        brands={brands}
      />
    </WorkspaceShell>
  );
}
