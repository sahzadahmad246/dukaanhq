import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { Brand, Category, Product } from "@/lib/types/inventory";
import { computeInventoryQuantity } from "./inventory-utils";

type WorkspaceData = Awaited<ReturnType<typeof getWorkspaceData>>;

export async function loadInventoryData(workspaceData?: WorkspaceData, isSecondHand = false) {
  const { user, profile, shop, membership } = workspaceData ?? (await getWorkspaceData());
  const supabase = await createSupabaseServerClient();

  let products: (Product & {
    total_quantity: number;
    stock_identifier?: string | null;
    variants?: Array<{
      id: string;
      quantity: number | null;
      name: string | null;
      color: string | null;
      storage_label: string | null;
      purchase_price_override: number | null;
      selling_price_override: number | null;
    }> | null;
    brand?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
    has_damaged_activity?: boolean;
    has_return_activity?: boolean;
    damaged_count?: number;
    returned_count?: number;
  })[] = [];
  let categories: Category[] = [];
  let brands: Brand[] = [];

  if (shop) {
    type ProductRow = Product & {
      variants?: Array<{
        id: string;
        quantity: number | null;
        name: string | null;
        color: string | null;
        storage_label: string | null;
        purchase_price_override: number | null;
        selling_price_override: number | null;
      }> | null;
      inventory_items?: Array<{ status: string | null; imei_1: string | null }> | null;
      stock_movements?: Array<{ type: string | null }> | null;
      brand?: { name?: string | null } | null;
      category?: { name?: string | null } | null;
    };

    const productsQuery = supabase
      .from("products")
      .select(`
        *,
        brand:brands ( name ),
        category:categories ( name ),
        variants:product_variants ( id, quantity, name, color, storage_label, purchase_price_override, selling_price_override ),
        inventory_items ( status, imei_1 ),
        stock_movements ( type )
      `)
      .eq("shop_id", shop.id)
      .eq("is_second_hand", isSecondHand)
      .order("created_at", { ascending: false });

    const [productResult, { data: categoryRows }, { data: brandRows }] = await Promise.all([
      productsQuery,
      supabase.from("categories").select("*").eq("shop_id", shop.id).order("name"),
      supabase.from("brands").select("*").eq("shop_id", shop.id).order("name"),
    ]);
    if (productResult.error) throw new Error("Could not load stock. Check that the latest database migrations have been applied.");
    const productRows = productResult.data;

    categories = (categoryRows ?? []) as Category[];
    brands = (brandRows ?? []) as Brand[];

    if (productRows) {
      products = (productRows as ProductRow[]).map(({ inventory_items, stock_movements, ...product }) => ({
        ...product,
        stock_identifier: isSecondHand ? inventory_items?.[0]?.imei_1 ?? null : null,
        total_quantity: computeInventoryQuantity({
          productKind: product.product_kind,
          trackingType: product.tracking_type,
          variants: product.variants,
          inventoryItems: inventory_items,
        }),
        damaged_count: (inventory_items ?? []).filter((item) => item.status === "DAMAGED").length,
        returned_count: (inventory_items ?? []).filter((item) => item.status === "RETURNED").length,
        has_damaged_activity:
          (inventory_items ?? []).some((item) => item.status === "DAMAGED") ||
          (stock_movements ?? []).some((movement) => movement.type === "DAMAGE"),
        has_return_activity:
          (inventory_items ?? []).some((item) => item.status === "RETURNED") ||
          (stock_movements ?? []).some((movement) => movement.type === "RETURN"),
      }));
    }
  }

  return {
    user,
    profile,
    shop,
    membership,
    products,
    categories,
    brands,
  };
}
