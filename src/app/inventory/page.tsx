import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InventoryManager } from "./_components/inventory-manager";
import { Product } from "@/lib/types/inventory";

export default async function InventoryPage() {
  const { user, profile, shop } = await getWorkspaceData();
  const supabase = await createSupabaseServerClient();

  let productsWithQty: (Product & { total_quantity: number })[] = [];

  if (shop) {
    // Note: In a production scenario, aggregating quantity from variants
    // or stock_movements could be done in a view or an RPC for performance.
    // For MVP, we'll fetch products and their default variant quantities.
    const { data: products } = await supabase
      .from("products")
      .select(`
        *,
        variants:product_variants ( quantity ),
        inventory_items ( count )
      `)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false });

    if (products) {
      productsWithQty = products.map((prod: any) => {
        let total_quantity = 0;
        
        if (prod.tracking_type === "QUANTITY_BASED" && prod.variants) {
          total_quantity = prod.variants.reduce((acc: number, v: any) => acc + (v.quantity || 0), 0);
        } else if (prod.tracking_type === "SERIALIZED" && prod.inventory_items) {
          total_quantity = prod.inventory_items[0]?.count || 0;
        }

        const { variants, inventory_items, ...rest } = prod;
        return {
          ...rest,
          total_quantity,
        };
      });
    }
  }

  return (
    <WorkspaceShell
      title="Inventory"
      activeNav="inventory"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={profile?.role ?? "customer"}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <section className="grid gap-6">
        <InventoryManager products={productsWithQty} />
      </section>
    </WorkspaceShell>
  );
}
