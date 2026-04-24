import { queryOptions } from "@tanstack/react-query";
import { getProductDetailsAction } from "./actions";

export type ProductDetails = {
  id: string;
  name: string;
  description: string | null;
  short_description?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  image_url: string | null;
  image_public_id?: string | null;
  product_kind: "MOBILE" | "SERIALIZED" | "QUANTITY_BASED";
  tracking_type: "SERIALIZED" | "QUANTITY_BASED";
  base_purchase_price: number;
  base_selling_price: number;
  low_stock_threshold: number;
  total_quantity: number;
  category?: { name?: string | null } | null;
  brand?: { name?: string | null } | null;
  variants?: Array<{
    id: string;
    quantity: number | null;
    name: string;
    color?: string | null;
    storage_label?: string | null;
    purchase_price_override?: number | null;
    selling_price_override?: number | null;
  }> | null;
  inventory_items?: Array<{
    id: string;
    variant_id?: string | null;
    serial_number: string;
    identifier_type: string;
    imei_1?: string | null;
    imei_2?: string | null;
    unique_identifier?: string | null;
    status: string;
    added_at: string;
    identifiers?: Array<{
      id: string;
      identifier_type: string;
      identifier_value: string;
      sort_order: number;
    }> | null;
  }> | null;
  highlights?: Array<{
    id: string;
    shop_id: string;
    product_id: string;
    label: string;
    value: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }> | null;
  product_images?: Array<{
    id: string;
    variant_id?: string | null;
    image_url: string;
    image_public_id: string;
    sort_order: number;
  }> | null;
  stock_movements?: Array<{
    id: string;
    type: string;
    quantity_change: number;
    reason: string | null;
    created_at: string;
    performed_by: string;
    performed_by_name?: string;
  }> | null;
};
export const productDetailsQueryKey = (productId: string) => ["inventory", "product-details", productId] as const;

export async function fetchProductDetails(productId: string): Promise<ProductDetails> {
  const res = await getProductDetailsAction(productId);

  if (res.status !== "success" || !res.data) {
    throw new Error(res.message || "Failed to fetch product details.");
  }

  return res.data as ProductDetails;
}

export function productDetailsQueryOptions(productId: string) {
  return queryOptions({
    queryKey: productDetailsQueryKey(productId),
    queryFn: () => fetchProductDetails(productId),
    staleTime: 10 * 60 * 1000,
  });
}
