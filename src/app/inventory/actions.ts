"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ProductFormSchema } from "@/lib/types/inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

export type ActionResponse<T = any> = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

export async function createProductAction(
  _prevState: ActionResponse,
  formData: FormData
): Promise<ActionResponse> {
  const { shop, user } = await getWorkspaceData();

  if (!shop) {
    return { status: "error", message: "No active shop found." };
  }

  const parsed = ProductFormSchema.safeParse({
    name: formData.get("name"),
    category_id: formData.get("category_id") || null,
    brand_id: formData.get("brand_id") || null,
    description: formData.get("description") || null,
    image_url: formData.get("image_url") || null,
    tracking_type: formData.get("tracking_type"),
    base_purchase_price: formData.get("base_purchase_price"),
    base_selling_price: formData.get("base_selling_price"),
    tax_rate: formData.get("tax_rate") || "0",
    low_stock_threshold: formData.get("low_stock_threshold") || "0",
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid form data",
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ""])
      ),
    };
  }

  const values = parsed.data;
  const initialStock = parseInt(formData.get("initial_stock") as string || "0", 10);
  const serialNumbers = (formData.get("serial_numbers") as string || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createSupabaseServerClient();

  // 1. Create Product
  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      shop_id: shop.id,
      name: values.name,
      slug: values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString().slice(-4),
      category_id: values.category_id,
      brand_id: values.brand_id,
      description: values.description,
      image_url: values.image_url,
      tracking_type: values.tracking_type,
      base_purchase_price: values.base_purchase_price,
      base_selling_price: values.base_selling_price,
      tax_rate: values.tax_rate,
      low_stock_threshold: values.low_stock_threshold,
      is_active: values.is_active,
    })
    .select("id")
    .single();

  if (productError || !product) {
    console.error("Product creation error:", productError);
    return { status: "error", message: "Failed to create product." };
  }

  // 2. Create Default Variant
  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .insert({
      shop_id: shop.id,
      product_id: product.id,
      name: "Default",
      quantity: values.tracking_type === "QUANTITY_BASED" ? initialStock : 0,
    })
    .select("id")
    .single();

  if (variantError || !variant) {
    return { status: "error", message: "Failed to create product variant." };
  }

  // 3. Handle Initial Stock Movement
  if (values.tracking_type === "QUANTITY_BASED" && initialStock > 0) {
    await supabase.from("stock_movements").insert({
      shop_id: shop.id,
      product_id: product.id,
      variant_id: variant.id,
      type: "PURCHASE",
      quantity_change: initialStock,
      reason: "Initial stock entry",
      performed_by: user.id,
    });
  } else if (values.tracking_type === "SERIALIZED" && serialNumbers.length > 0) {
    // Insert serial numbers
    const inventoryItems = serialNumbers.map((sn) => ({
      shop_id: shop.id,
      product_id: product.id,
      variant_id: variant.id,
      serial_number: sn,
      purchase_price: values.base_purchase_price,
      status: "IN_STOCK",
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from("inventory_items")
      .insert(inventoryItems)
      .select("id");

    if (itemsError) {
      return { status: "error", message: "Failed to add serial numbers." };
    }

    // Insert stock movements for each
    if (insertedItems) {
      const movements = insertedItems.map((item) => ({
        shop_id: shop.id,
        product_id: product.id,
        variant_id: variant.id,
        inventory_item_id: item.id,
        type: "PURCHASE",
        quantity_change: 1,
        reason: "Initial stock row",
        performed_by: user.id,
      }));
      await supabase.from("stock_movements").insert(movements);
    }
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Product created successfully." };
}

export async function deleteProductAction(productId: string): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("shop_id", shop.id);

  if (error) {
    return { status: "error", message: "Failed to delete product." };
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Product deleted successfully." };
}
