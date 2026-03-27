"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  InventoryUnitDraftSchema,
  ProductFormSchema,
  ProductHighlightDraftSchema,
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
  highlights: z.array(ProductHighlightDraftSchema).default([]),
});

const ExistingProductImageSchema = z.object({
  id: z.string().optional(),
  image_url: z.string().url(),
  image_public_id: z.string().min(1),
  sort_order: z.number().int().min(0),
  variant_id: z.string().uuid().nullable().optional(),
  variant_temp_key: z.string().nullable().optional(),
});

const ProductImageAssignmentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["new", "existing"]),
  sort_order: z.number().int().min(0),
  variant_temp_key: z.string().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
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
    identifier_value: unit.identifier_value?.trim() ?? "",
    imei_1: unit.imei_1?.trim() || null,
    imei_2: unit.imei_2?.trim() || null,
    serial_number: unit.serial_number?.trim() || null,
    unique_identifier: unit.unique_identifier?.trim() || null,
  }));

  const duplicateIdentifiers = normalizedUnits.reduce<Record<string, number>>((acc, unit) => {
    const values = [
      unit.identifier_value,
      unit.imei_1,
      unit.imei_2,
      unit.serial_number,
      unit.unique_identifier,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    for (const value of values) {
      acc[value] = (acc[value] ?? 0) + 1;
    }

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
  const imageAssignmentsResult = parseJsonField(
    formData.get("image_assignments"),
    z.array(ProductImageAssignmentSchema).default([])
  );

  if (!imageAssignmentsResult.success) {
    return {
      status: "error",
      message: "Invalid image assignment payload.",
      fieldErrors: { images: "Invalid image assignment payload." },
    };
  }

  const imageAssignments = imageAssignmentsResult.data;

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
    p_short_description: values.description,
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
    p_highlights: payload.highlights,
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
      const { data: createdVariants } = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", productId)
        .eq("shop_id", shop.id)
        .order("created_at");

      const variantIdMap = new Map<string, string>();
      payload.variants.forEach((variant, index) => {
        const resolvedVariantId = createdVariants?.[index]?.id;
        if (resolvedVariantId) {
          variantIdMap.set(variant.temp_key, resolvedVariantId);
        }
      });

      const newImageAssignments = imageAssignments.filter((assignment) => assignment.kind === "new");
      const galleryImages = uploadedImages.slice(1).map((image, index) => {
        const assignment = newImageAssignments[index + 1] ?? null;
        return {
          shop_id: shop.id,
          product_id: productId,
          variant_id: assignment?.variant_temp_key ? variantIdMap.get(assignment.variant_temp_key) ?? null : null,
          image_url: image.url,
          image_public_id: image.public_id,
          sort_order: index + 1,
        };
      });

      if (galleryImages.length > 0) {
        await supabase.from("product_images").insert(galleryImages);
      }
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
  const imageAssignmentsResult = parseJsonField(
    formData.get("image_assignments"),
    z.array(ProductImageAssignmentSchema).default([])
  );

  if (!imageAssignmentsResult.success) {
    return {
      status: "error",
      message: "Invalid image assignment payload.",
      fieldErrors: { images: "Invalid image assignment payload." },
    };
  }

  const imageAssignments = imageAssignmentsResult.data;
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
  const assignmentMap = new Map(imageAssignments.map((assignment) => [assignment.id, assignment]));
  const finalImages = [
    ...keptExistingImages.map((image, index) => ({
      id: image.id,
      url: image.image_url,
      public_id: image.image_public_id,
      sort_order: index,
      variant_id: assignmentMap.get(image.id ?? "")?.variant_id ?? image.variant_id ?? null,
      variant_temp_key: assignmentMap.get(image.id ?? "")?.variant_temp_key ?? image.variant_temp_key ?? null,
    })),
    ...uploadedImages.map((image, index) => ({
      id: imageAssignments.filter((assignment) => assignment.kind === "new")[index]?.id ?? `new-${index}`,
      url: image.url,
      public_id: image.public_id,
      sort_order: keptExistingImages.length + index,
      variant_id: null,
      variant_temp_key: imageAssignments.filter((assignment) => assignment.kind === "new")[index]?.variant_temp_key ?? null,
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
    p_short_description: values.description,
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
    p_highlights: payload.highlights,
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
    const { data: updatedVariants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("created_at");

    const variantIdMap = new Map<string, string>();
    payload.variants.forEach((variant, index) => {
      const resolvedVariantId = updatedVariants?.[index]?.id;
      if (resolvedVariantId) {
        variantIdMap.set(variant.temp_key, resolvedVariantId);
      }
    });

    const galleryImages = finalImages.map((image, index) => ({
      shop_id: shop.id,
      product_id: productId,
      variant_id: image.variant_id ?? (image.variant_temp_key ? variantIdMap.get(image.variant_temp_key) ?? null : null),
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

export async function recordInventorySaleAction(input: {
  product_id: string;
  variant_id?: string | null;
  inventory_item_id?: string | null;
  quantity?: number;
  reason?: string | null;
}): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_inventory_sale", {
    p_shop_id: shop.id,
    p_product_id: input.product_id,
    p_variant_id: input.variant_id ?? null,
    p_inventory_item_id: input.inventory_item_id ?? null,
    p_quantity: input.quantity ?? 1,
    p_reason: input.reason ?? null,
  });

  if (error) {
    return { status: "error", message: error.message || "Failed to record sale." };
  }

  revalidatePath("/inventory");
  revalidatePath("/billing");
  return { status: "success", message: "Sale recorded and stock updated." };
}

export async function adjustInventoryStockAction(input: {
  product_id: string;
  adjustment_type: "ADJUSTMENT_ADD" | "ADJUSTMENT_REMOVE" | "RETURN" | "DAMAGE" | "RESTORE_RETURNED" | "RESTORE_DAMAGED";
  variant_id?: string | null;
  inventory_item_id?: string | null;
  quantity?: number;
  reason?: string | null;
}): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjust_inventory_stock", {
    p_shop_id: shop.id,
    p_product_id: input.product_id,
    p_adjustment_type: input.adjustment_type,
    p_variant_id: input.variant_id ?? null,
    p_inventory_item_id: input.inventory_item_id ?? null,
    p_quantity: input.quantity ?? 1,
    p_reason: input.reason ?? null,
  });

  if (error) {
    return { status: "error", message: error.message || "Failed to adjust stock." };
  }

  revalidatePath("/inventory");
  revalidatePath("/billing");
  return { status: "success", message: "Stock updated successfully." };
}

export async function addInventoryStockAction(formData: FormData): Promise<ActionResponse> {
  const { shop, user } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const productId = typeof formData.get("product_id") === "string" ? formData.get("product_id") : null;
  const variantIdEntry = formData.get("variant_id");
  const colorEntry = formData.get("color");
  const storageLabelEntry = formData.get("storage_label");
  const quantityEntry = formData.get("quantity");
  const identifierTypeEntry = formData.get("identifier_type");
  const variantIdInput = typeof variantIdEntry === "string" ? variantIdEntry : null;
  const colorInput = typeof colorEntry === "string" ? colorEntry : null;
  const storageLabelInput = typeof storageLabelEntry === "string" ? storageLabelEntry : null;
  const quantityInput = typeof quantityEntry === "string" ? quantityEntry : null;
  const identifierTypeInput = typeof identifierTypeEntry === "string" ? identifierTypeEntry : null;
  const unitsResult = parseJsonField(
    formData.get("units"),
    z
      .array(
        z.object({
          imei_1: z.string().nullable().optional(),
          imei_2: z.string().nullable().optional(),
          serial_number: z.string().nullable().optional(),
          unique_identifier: z.string().nullable().optional(),
        })
      )
      .default([])
  );

  if (!productId) {
    return { status: "error", message: "Missing product id." };
  }

  if (!unitsResult.success) {
    return { status: "error", message: "Invalid stock unit payload." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, product_kind, tracking_type, base_purchase_price")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();

  if (productError || !product) {
    return { status: "error", message: "Product not found." };
  }

  let variantId = variantIdInput ?? null;

  if (variantId) {
    const { data: existingVariant } = await supabase
      .from("product_variants")
      .select("id")
      .eq("id", variantId)
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .maybeSingle();

    if (!existingVariant) {
      return { status: "error", message: "Selected option was not found." };
    }
  } else {
    const color = colorInput?.trim() || null;
    const storageLabel = storageLabelInput?.trim() || null;
    const variantName = [storageLabel, color].filter(Boolean).join(" / ") || "Default";
    const { data: newVariant, error: variantError } = await supabase
      .from("product_variants")
      .insert({
        shop_id: shop.id,
        product_id: productId,
        name: variantName,
        color,
        storage_label: storageLabel,
        quantity: 0,
      })
      .select("id")
      .single();

    if (variantError || !newVariant) {
      return { status: "error", message: variantError?.message || "Could not create a new option." };
    }
    variantId = newVariant.id;
  }

  if (product.tracking_type === "QUANTITY_BASED") {
    const quantity = Math.max(0, Number(quantityInput ?? 0));
    if (quantity <= 0) {
      return { status: "error", message: "Enter a quantity greater than 0." };
    }

    const { data: currentVariant, error: currentVariantError } = await supabase
      .from("product_variants")
      .select("quantity")
      .eq("id", variantId)
      .eq("shop_id", shop.id)
      .single();

    if (currentVariantError || !currentVariant) {
      return { status: "error", message: "Could not load current stock quantity." };
    }

    const { error: updateError } = await supabase
      .from("product_variants")
      .update({ quantity: (currentVariant.quantity ?? 0) + quantity })
      .eq("id", variantId)
      .eq("shop_id", shop.id);

    if (updateError) {
      return { status: "error", message: "Could not update stock quantity." };
    }

    await supabase.from("stock_movements").insert({
      shop_id: shop.id,
      product_id: productId,
      variant_id: variantId,
      type: "PURCHASE",
      quantity_change: quantity,
      reason: "Stock refill",
      performed_by: user.id,
    });

  } else {
    const units = unitsResult.data ?? [];
    if (units.length === 0) {
      return { status: "error", message: "Add at least one stock unit." };
    }

    for (const unit of units) {
      const identifierType =
        product.product_kind === "MOBILE"
          ? "IMEI"
          : ((identifierTypeInput as "IMEI" | "SERIAL_NUMBER" | "UNIQUE_ID" | null) ?? "SERIAL_NUMBER");
    const imei1 = unit.imei_1?.trim() || null;
    const imei2 = unit.imei_2?.trim() || null;
    const serialNumber =
      identifierType === "IMEI"
        ? [imei1, imei2].filter(Boolean).join(" | ") || null
        : unit.serial_number?.trim() || null;
    const uniqueIdentifier = identifierType === "UNIQUE_ID" ? unit.unique_identifier?.trim() || null : null;

    if (identifierType === "IMEI" && !imei1) {
      return { status: "error", message: "Each mobile unit needs IMEI 1." };
    }
    if (identifierType === "SERIAL_NUMBER" && !serialNumber) {
      return { status: "error", message: "Each unit needs a serial number." };
    }
    if (identifierType === "UNIQUE_ID" && !uniqueIdentifier) {
      return { status: "error", message: "Each unit needs a unique identifier." };
    }

    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory_items")
      .insert({
        shop_id: shop.id,
        product_id: productId,
        variant_id: variantId,
        serial_number: identifierType === "UNIQUE_ID" ? uniqueIdentifier : serialNumber,
        identifier_type: identifierType,
        imei_1: imei1,
        imei_2: imei2,
        unique_identifier: uniqueIdentifier,
        purchase_price: product.base_purchase_price,
        status: "IN_STOCK",
      })
      .select("id")
      .single();

    if (inventoryError || !inventoryItem) {
      return { status: "error", message: inventoryError?.message || "Could not add stock unit." };
    }

    const identifierRows = [
      imei1
        ? {
            shop_id: shop.id,
            inventory_item_id: inventoryItem.id,
            identifier_type: "IMEI",
            identifier_value: imei1,
            sort_order: 0,
          }
        : null,
      imei2
        ? {
            shop_id: shop.id,
            inventory_item_id: inventoryItem.id,
            identifier_type: "IMEI",
            identifier_value: imei2,
            sort_order: 1,
          }
        : null,
      identifierType !== "IMEI" && (serialNumber || uniqueIdentifier)
        ? {
            shop_id: shop.id,
            inventory_item_id: inventoryItem.id,
            identifier_type: identifierType,
            identifier_value: uniqueIdentifier ?? serialNumber ?? "",
            sort_order: 0,
          }
        : null,
    ].filter(Boolean);

    if (identifierRows.length > 0) {
      await supabase.from("inventory_item_identifiers").insert(identifierRows);
    }

    await supabase.from("stock_movements").insert({
      shop_id: shop.id,
      product_id: productId,
      variant_id: variantId,
      inventory_item_id: inventoryItem.id,
      type: "PURCHASE",
      quantity_change: 1,
      reason: "Stock refill",
      performed_by: user.id,
    });
    }
  }

  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (imageFiles.length > 0 && variantId) {
    const uploadedImages = await uploadImagesToCloudinary(imageFiles);
    if (uploadedImages.length > 0) {
      const { data: existingVariantImages, error: variantImageReadError } = await supabase
        .from("product_images")
        .select("sort_order")
        .eq("product_id", productId)
        .eq("shop_id", shop.id)
        .eq("variant_id", variantId)
        .order("sort_order", { ascending: false })
        .limit(1);

      if (variantImageReadError && variantImageReadError.code !== "42P01") {
        await deleteImagesFromCloudinary(uploadedImages.map((image) => image.public_id));
        return { status: "error", message: "Stock added, but variant image sync failed." };
      }

      const startOrder = (existingVariantImages?.[0]?.sort_order ?? -1) + 1;
      const galleryRows = uploadedImages.map((image, index) => ({
        shop_id: shop.id,
        product_id: productId,
        variant_id: variantId,
        image_url: image.url,
        image_public_id: image.public_id,
        sort_order: startOrder + index,
      }));

      const { error: imageInsertError } = await supabase.from("product_images").insert(galleryRows);
      if (imageInsertError) {
        await deleteImagesFromCloudinary(uploadedImages.map((image) => image.public_id));
        return { status: "error", message: "Stock added, but variant images could not be saved." };
      }
    }
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Stock added successfully." };
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
    purchase_price_override: number | null;
    selling_price_override: number | null;
  };
  type InventoryItemRow = {
    id: string;
    variant_id: string | null;
    serial_number: string;
    identifier_type: string;
    imei_1: string | null;
    imei_2: string | null;
    unique_identifier: string | null;
    status: string;
    added_at: string;
    identifiers?: Array<{
      id: string;
      identifier_type: string;
      identifier_value: string;
      sort_order: number;
    }> | null;
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
    highlightsResult,
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
      .select("id, quantity, name, color, storage_label, purchase_price_override, selling_price_override")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("created_at"),
    supabase
      .from("inventory_items")
      .select(`
        id,
        variant_id,
        serial_number,
        identifier_type,
        imei_1,
        imei_2,
        unique_identifier,
        status,
        added_at,
        identifiers:inventory_item_identifiers (
          id,
          identifier_type,
          identifier_value,
          sort_order
        )
      `)
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("added_at"),
    supabase
      .from("product_highlights")
      .select("id, label, value, sort_order, created_at, updated_at, shop_id, product_id")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("sort_order"),
    supabase
      .from("stock_movements")
      .select("id, type, quantity_change, reason, created_at, performed_by")
      .eq("product_id", productId)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_images")
      .select("id, image_url, image_public_id, sort_order, variant_id")
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

  if (highlightsResult.error) {
    return { status: "error", message: highlightsResult.error.message || "Failed to load product highlights." };
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
    highlights: highlightsResult.data ?? [],
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
