import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadDashboardData } from "./load-dashboard-data";
import { DashboardHome } from "./_components/dashboard-home";

export default async function DashboardPage() {
  try {
    const { user, profile, shop, membership, stats, recentInvoices, recentProducts, products, categories, brands } =
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
        ownerRole={membership?.role ?? profile?.role ?? "customer"}
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
  } catch {
    return (
      <WorkspaceShell
        title="Dashboard"
        activeNav="dashboard"
        shopName="Shop"
        shopAddress=""
        shopLogoUrl={null}
        ownerName="Shop Owner"
        ownerEmail=""
        ownerRole="owner"
        userAvatarUrl={null}
      >
        <DashboardHome
          ownerName="Shop Owner"
          shopLogoUrl={null}
          stats={{
            totalRevenue: 0,
            todayRevenue: 0,
            monthRevenue: 0,
            totalInvoices: 0,
            todayInvoices: 0,
            totalProducts: 0,
            inStockItems: 0,
            lowStockProducts: 0,
            totalCustomers: 0,
          }}
          recentInvoices={[]}
          recentProducts={[]}
          products={[]}
          categories={[]}
          brands={[]}
          loadError="We couldn't refresh dashboard data right now. Please stay on this page and try again in a moment."
        />
      </WorkspaceShell>
    );
  }
}
