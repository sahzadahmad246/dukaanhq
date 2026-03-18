import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { InventoryManager } from "./_components/inventory-manager";
import { loadInventoryData } from "./load-inventory-data";

export default async function InventoryPage() {
  const { user, profile, shop, products, categories, brands } = await loadInventoryData();

  return (
    <WorkspaceShell
      title="Inventory"
      activeNav="inventory"
      hideHeader
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={profile?.role ?? "customer"}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <section className="grid gap-6">
        <InventoryManager products={products} categories={categories} brands={brands} />
      </section>
    </WorkspaceShell>
  );
}
