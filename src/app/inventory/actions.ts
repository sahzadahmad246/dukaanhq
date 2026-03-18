"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  InventoryUnitDraftSchema,
  ProductFormSchema,
  ProductKindSchema,
  ProductVariantDraftSchema,
} from "@/lib/types/inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import {
  deleteImageFromCloudinary,
  deleteImagesFromCloudinary,
  uploadImagesToCloudinary,
} from "@/lib/cloudinary";
import { computeInventoryQuantity } from "./inventory-utils";

export type ActionResponse<T = unknown> = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

const ProductCreatePayloadSchema = z.object({
  variants: z.array(ProductVariantDraftSchema).min(1, "At least one variant is required."),
  units: z.array(InventoryUnitDraftSchema).default([]),
});

const ExistingProductImageSchema = z.object({
  id: z.string().optional(),
  image_url: z.string().url(),
  image_public_id: z.string().min(1),
  sort_order: z.number().int().min(0),
});

type ParsedProductInput = {
  values: z.infer<typeof ProductFormSchema>;
  payload: z.infer<typeof ProductCreatePayloadSchema>;
  productKind: z.infer<typeof ProductKindSchema>;
  normalizedUnits: Array<z.infer<typeof InventoryUnitDraftSchema>>;
};

function parseJsonField<T>(value: FormDataEntryValue | null, schema: z.ZodSchema<T>) {
  if (typeof value !== "string" || value.trim() === "") {
    return schema.safeParse(undefined);
  }

  try {
    return schema.safeParse(JSON.parse(value));
  } catch {
    return schema.safeParse(undefined);
  }
}

function buildFieldErrors(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ""])
  );
}

function parseProductInput(formData: FormData): ActionResponse<ParsedProductInput> {
  const parsed = ProductFormSchema.safeParse({
    name: formData.get("name"),
    category_id: formData.get("category_id") || null,
    category_name: formData.get("category_name") || null,
    brand_id: formData.get("brand_id") || null,
    brand_name: formData.get("brand_name") || null,
    description: formData.get("description") || null,
    product_kind: formData.get("product_kind"),
    tracking_type: formData.get("tracking_type"),
    base_purchase_price: formData.get("base_purchase_price"),
    base_selling_price: formData.get("base_selling_price"),
    tax_rate: formData.get("tax_rate") || "0",
    low_stock_threshold: formData.get("low_stock_threshold") || "0",
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid form data",
      fieldErrors: buildFieldErrors(parsed.error),
    };
  }

  const values = parsed.data;
  const payloadResult = parseJsonField(
    formData.get("product_payload"),
    ProductCreatePayloadSchema
  );

  if (!payloadResult.success) {
    return {
      status: "error",
      message: payloadResult.error.issues[0]?.message ?? "Invalid variant payload",
      fieldErrors: {
        product_payload: payloadResult.error.issues[0]?.message ?? "Invalid variant payload",
      },
    };
  }

  const payload = payloadResult.data;
  const productKind = ProductKindSchema.parse(values.product_kind);

  if (productKind !== "QUANTITY_BASED" && payload.units.length === 0) {
    return {
      status: "error",
      message: "Add at least one inventory unit for serialized products.",
      fieldErrors: {
        product_payload: "Add at least one inventory unit for serialized products.",
      },
    };
  }

  if (productKind === "MOBILE") {
    const nonImeiUnit = payload.units.find((unit) => unit.identifier_type !== "IMEI");
    if (nonImeiUnit) {
      return {
        status: "error",
        message: "Mobile products only support IMEI identifiers.",
        fieldErrors: {
          product_payload: "Mobile products only support IMEI identifiers.",
        },
      };
    }
  }

  const normalizedUnits = payload.units.map((unit) => ({
    ...unit,
    identifier_value: unit.identifier_value.trim(),
  }));
  const duplicateIdentifiers = normalizedUnits.reduce<Record<string, number>>((acc, unit) => {
    const key = unit.identifier_value.toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicateIdentifiers = Object.values(duplicateIdentifiers).some((count) => count > 1);

  if (hasDuplicateIdentifiers) {
    return {
      status: "error",
      message: "Duplicate IMEI/serial values found in this form.",
      fieldErrors: {
        product_payload: "Duplicate IMEI/serial values found in this form.",
      },
    };
  }

  if (!values.brand_id && !values.brand_name?.trim()) {
    return {
      status: "error",
      message: "Brand is required.",
      fieldErrors: { brand_id: "Brand is required." },
    };
  }

  if (!values.category_id && !values.category_name?.trim()) {
    return {
      status: "error",
      message: "Category is required.",
      fieldErrors: { category_id: "Category is required." },
    };
  }

  return {
    status: "success",
    message: "Validated",
    data: {
      values,
      payload,
      productKind,
      normalizedUnits,
    },
  };
}

export async function createProductAction(
  _prevState: ActionResponse,
  formData: FormData
): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();

  if (!shop) {
    return { status: "error", message: "No active shop found." };
  }

  const inputResult = parseProductInput(formData);
  if (inputResult.status === "error" || !inputResult.data) {
    return inputResult;
  }

  const { values, payload, productKind, normalizedUnits } = inputResult.data;

  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const uploadedImages = await uploadImagesToCloudinary(imageFiles);
  const primaryImage = uploadedImages[0] ?? null;

  const supabase = await createSupabaseServerClient();

  const { data: productId, error } = await supabase.rpc("create_inventory_product", {
    p_shop_id: shop.id,
    p_name: values.name,
    p_category_id: values.category_id,
    p_category_name: values.category_name,
    p_brand_id: values.brand_id,
    p_brand_name: values.brand_name,
    p_description: values.description,
    p_image_url: primaryImage?.url ?? null,
    p_image_public_id: primaryImage?.public_id ?? null,
    p_product_kind: productKind,
    p_base_purchase_price: values.base_purchase_price,
    p_base_selling_price: values.base_selling_price,
    p_tax_rate: values.tax_rate,
    p_low_stock_threshold: values.low_stock_threshold,
    p_is_active: values.is_active,
    p_variants: payload.variants,
    p_units: normalizedUnits,
  });

  if (error) {
    if (uploadedImages.length > 0) {
      await deleteImagesFromCloudinary(uploadedImages.map((image) => image.public_id));
    }
    console.error("Product creation error:", error);
    return { status: "error", message: error.message || "Failed to create product." };
  }

  if (primaryImage && uploadedImages.length > 1) {
    if (productId) {
      const galleryImages = uploadedImages.map((image, index) => ({
        shop_id: shop.id,
        product_id: productId,
        image_url: image.url,
        image_public_id: image.public_id,
        sort_order: index,
      }));

      await supabase.from("product_images").insert(galleryImages);
    }
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Product created successfully." };
}

export async function updateProductAction(
  _prevState: ActionResponse,
  formData: FormData
): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();

  if (!shop) {
    return { status: "error", message: "No active shop found." };
  }

  const productId = typeof formData.get("product_id") === "string" ? formData.get("product_id") : null;
  if (!productId || typeof productId !== "string") {
    return { status: "error", message: "Missing product id." };
  }

  const inputResult = parseProductInput(formData);
  if (inputResult.status === "error" || !inputResult.data) {
    return inputResult;
  }

  const { values, payload, productKind, normalizedUnits } = inputResult.data;
  const existingImagesResult = parseJsonField(
    formData.get("existing_images"),
    z.array(ExistingProductImageSchema).default([])
  );

  if (!existingImagesResult.success) {
    return {
      status: "error",
      message: "Invalid image payload.",
      fieldErrors: { images: "Invalid image payload." },
    };
  }

  const keptExistingImages = existingImagesResult.data;
  const newImageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const supabase = await createSupabaseServerClient();
  const { data: existingProduct, error: existingProductError } = await supabase
    .from("products")
    .select("id, image_url, image_public_id, product_images(id, image_url, image_public_id, sort_order)")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();

  if (existingProductError || !existingProduct) {
    return { status: "error", message: "Product not found." };
  }

  const uploadedImages = await uploadImagesToCloudinary(newImageFiles);
  const finalImages = [
    ...keptExistingImages.map((image, index) => ({
      id: image.id,
      url: image.image_url,
      public_id: image.image_public_id,
      sort_order: index,
    })),
    ...uploadedImages.map((image, index) => ({
      url: image.url,
      public_id: image.public_id,
      sort_order: keptExistingImages.length + index,
    })),
  ];

  const primaryImage = finalImages[0] ?? null;

  const { error } = await supabase.rpc("update_inventory_product", {
    p_product_id: productId,
    p_shop_id: shop.id,
    p_name: values.name,
    p_category_id: values.category_id,
    p_category_name: values.category_name,
    p_brand_id: values.brand_id,
    p_brand_name: values.brand_name,
    p_description: values.description,
    p_image_url: primaryImage?.url ?? null,
    p_image_public_id: primaryImage?.public_id ?? null,
    p_product_kind: productKind,
    p_base_purchase_price: values.base_purchase_price,
    p_base_selling_price: values.base_selling_price,
    p_tax_rate: values.tax_rate,
    p_low_stock_threshold: values.low_stock_threshold,
    p_is_active: values.is_active,
    p_variants: payload.variants,
    p_units: normalizedUnits,
  });

  if (error) {
    if (uploadedImages.length > 0) {
      await deleteImagesFromCloudinary(uploadedImages.map((image) => image.public_id));
    }
    console.error("Product update error:", error);
    return { status: "error", message: error.message || "Failed to update product." };
  }

  const oldPublicIds = new Set<string>();
  if (existingProduct.image_public_id) oldPublicIds.add(existingProduct.image_public_id);
  for (const image of existingProduct.product_images ?? []) {
    if (image.image_public_id) oldPublicIds.add(image.image_public_id);
  }
  const keptPublicIds = new Set(finalImages.map((image) => image.public_id));
  const removedPublicIds = Array.from(oldPublicIds).filter((publicId) => !keptPublicIds.has(publicId));

  await supabase.from("product_images").delete().eq("product_id", productId).eq("shop_id", shop.id);

  if (finalImages.length > 1) {
    const galleryImages = finalImages.map((image, index) => ({
      shop_id: shop.id,
      product_id: productId,
      image_url: image.url,
      image_public_id: image.public_id,
      sort_order: index,
    }));
    const { error: galleryError } = await supabase.from("product_images").insert(galleryImages);
    if (galleryError) {
      console.error("Product gallery update error:", galleryError);
      return { status: "error", message: "Product updated, but gallery sync failed." };
    }
  }

  if (removedPublicIds.length > 0) {
    await deleteImagesFromCloudinary(removedPublicIds);
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Product updated successfully." };
}

export async function deleteProductAction(productId: string): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();

  // Fetch the product to see if it has a Cloudinary image to delete
  const { data: product } = await supabase
    .from("products")
    .select("image_public_id, product_images(image_public_id)")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();

  if (product?.image_public_id) {
    await deleteImageFromCloudinary(product.image_public_id);
  }
  if (product?.product_images?.length) {
    await deleteImagesFromCloudinary(product.product_images.map((image) => image.image_public_id));
  }

  const { data: deletedRows, error } = await supabase
    .from("products")
    .delete()
    .select("id")
    .eq("id", productId)
    .eq("shop_id", shop.id); // Guard to ensure they can only delete their own

  if (error) {
    return { status: "error", message: "Failed to delete product." };
  }

  if (!deletedRows || deletedRows.length === 0) {
    return {
      status: "error",
      message: "Delete was blocked. Run the latest Supabase SQL migration for product delete access.",
    };
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Product deleted successfully." };
}

export async function getProductDetailsAction(productId: string): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();
  type ProductVariantRow = {
    id: string;
    quantity: number | null;
    name: string;
    color: string | null;
    storage_label: string | null;
  };
  type InventoryItemRow = {
    id: string;
    variant_id: string | null;
    serial_number: string;
    identifier_type: string;
    status: string;
    added_at: string;
  };
  type StockMovementRow = {
    id: string;
    type: string;
    quantity_change: number;
    reason: string | null;
    created_at: string;
    performed_by: string;
    performed_by_name?: string;
  };
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();

  if (error || !product) {
    return {
      status: "error",
      message: error?.message || "Product not found or access denied.",
    };
  }

  const [
    categoryResult,
    brandResult,
    variantsResult,
    inventoryItemsResult,
    stockMovementsResult,
    productImagesResult,
  ] = await Promise.all([
    product.category_id
      ? supabase.from("categories").select("name").eq("id", product.category_id).eq("shop_id", shop.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    product.brand_id
      ? supabase.from("brands").select("name").eq("id", product.brand_id).eq("shop_id", shop.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("product_variants")
      .select("id, quantity, name, color, storage_label")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("created_at"),
    supabase
      .from("inventory_items")
      .select("id, variant_id, serial_number, identifier_type, status, added_at")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("added_at"),
    supabase
      .from("stock_movements")
      .select("id, type, quantity_change, reason, created_at, performed_by")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_images")
      .select("id, image_url, image_public_id, sort_order")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("sort_order"),
  ]);

  if (variantsResult.error) {
    return { status: "error", message: variantsResult.error.message || "Failed to load product variants." };
  }

  if (inventoryItemsResult.error) {
    return { status: "error", message: inventoryItemsResult.error.message || "Failed to load inventory items." };
  }

  if (stockMovementsResult.error) {
    return { status: "error", message: stockMovementsResult.error.message || "Failed to load stock history." };
  }

  const productWithRelations = {
    ...product,
    category: categoryResult.data,
    brand: brandResult.data,
    variants: variantsResult.data ?? [],
    inventory_items: inventoryItemsResult.data ?? [],
    stock_movements: stockMovementsResult.data ?? [],
    product_images:
      productImagesResult.error && productImagesResult.error.code === "42P01"
        ? []
        : (productImagesResult.data ?? []),
  };

  // Calculate total quantity directly here for convenience
  const total_quantity = computeInventoryQuantity({
    productKind: productWithRelations.product_kind,
    trackingType: productWithRelations.tracking_type,
    variants: productWithRelations.variants as ProductVariantRow[],
    inventoryItems: productWithRelations.inventory_items as InventoryItemRow[],
  });

  productWithRelations.total_quantity = total_quantity;

  // Map user names and sort
  if (productWithRelations.stock_movements && productWithRelations.stock_movements.length > 0) {
    const userIds = Array.from(
      new Set(productWithRelations.stock_movements.map((movement: StockMovementRow) => movement.performed_by))
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profileMap = (profiles || []).reduce<Record<string, string | null>>((acc, profile) => {
      acc[profile.id] = profile.full_name;
      return acc;
    }, {});

    productWithRelations.stock_movements = productWithRelations.stock_movements.map((movement: StockMovementRow) => ({
      ...movement,
      performed_by_name: profileMap[movement.performed_by] || "Admin",
    }));
  }

  return { status: "success", data: productWithRelations, message: "Fetched details" };
}
