import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { Brand, Category, Product } from "@/lib/types/inventory";
import { computeInventoryQuantity } from "./inventory-utils";

export async function loadInventoryData() {
  const { user, profile, shop } = await getWorkspaceData();
  const supabase = await createSupabaseServerClient();

  let products: (Product & {
    total_quantity: number;
    brand?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
  })[] = [];
  let categories: Category[] = [];
  let brands: Brand[] = [];

  if (shop) {
    type ProductRow = Product & {
      variants?: Array<{
        quantity: number | null;
        name: string | null;
        color: string | null;
        storage_label: string | null;
      }> | null;
      inventory_items?: Array<{ status: string | null }> | null;
      brand?: { name?: string | null } | null;
      category?: { name?: string | null } | null;
    };

    const { data: productRows } = await supabase
      .from("products")
      .select(`
        *,
        brand:brands ( name ),
        category:categories ( name ),
        variants:product_variants ( quantity, name, color, storage_label ),
        inventory_items ( status )
      `)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false });

    const [{ data: categoryRows }, { data: brandRows }] = await Promise.all([
      supabase.from("categories").select("*").eq("shop_id", shop.id).order("name"),
      supabase.from("brands").select("*").eq("shop_id", shop.id).order("name"),
    ]);

    categories = (categoryRows ?? []) as Category[];
    brands = (brandRows ?? []) as Brand[];

    if (productRows) {
      products = (productRows as ProductRow[]).map((product) => ({
        ...product,
        total_quantity: computeInventoryQuantity({
          productKind: product.product_kind,
          trackingType: product.tracking_type,
          variants: product.variants,
          inventoryItems: product.inventory_items,
        }),
      }));
    }
  }

  return {
    user,
    profile,
    shop,
    products,
    categories,
    brands,
  };
}
