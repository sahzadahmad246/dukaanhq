import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadDashboardData } from "./load-dashboard-data";
import { DashboardHome } from "./_components/dashboard-home";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
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
      saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <DashboardHome
        ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop Owner"}
        shopLogoUrl={shop?.logo_url ?? null}
        shopPostalCode={shop?.postal_code ?? null}
        stats={stats}
        recentInvoices={recentInvoices}
        recentProducts={recentProducts}
        products={products}
        categories={categories}
        brands={brands}
        shopStampUrl={shop?.shop_stamp_url ?? null}
      />
    </WorkspaceShell>
  );
}
