import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { InventoryManager } from "./_components/inventory-manager";
import { loadInventoryData } from "./load-inventory-data";
import { buildShopRoute } from "@/lib/shop-routes";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; filter?: string }>;
}) {
  const query = await searchParams;
  const { user, profile, shop, membership, products, categories, brands } = await loadInventoryData();

  if (shop?.slug) {
    if (!query.shop) {
      redirect(buildShopRoute(shop.slug, "inventory"));
    }

    if (query.shop !== shop.slug) {
      redirect(buildShopRoute(shop.slug, "inventory"));
    }
  }

  return (
    <WorkspaceShell
      title="Inventory"
      activeNav="inventory"
      hideHeader
      shopName={shop?.name ?? "Shop"}
      shopSlug={shop?.slug ?? null}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={membership?.role ?? profile?.role ?? "customer"}
      saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <section className="grid gap-6">
        <InventoryManager
          products={products}
          categories={categories}
          brands={brands}
          initialFilter={query.filter === "low-stock" ? "LOW_STOCK" : "ALL"}
        />
      </section>
    </WorkspaceShell>
  );
}
