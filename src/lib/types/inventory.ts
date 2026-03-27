import { z } from "zod";

import { QrPayloadSchema } from "@/lib/qr";

export const CategorySchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export const BrandSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Brand = z.infer<typeof BrandSchema>;

export const TrackingTypeSchema = z.enum(["SERIALIZED", "QUANTITY_BASED"]);
export type TrackingType = z.infer<typeof TrackingTypeSchema>;

export const ProductKindSchema = z.enum(["MOBILE", "SERIALIZED", "QUANTITY_BASED"]);
export type ProductKind = z.infer<typeof ProductKindSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  brand_id: z.string().uuid().nullable(),
  name: z.string().min(1, "Product name is required"),
  slug: z.string().min(1, "Product slug is required"),
  description: z.string().nullable(),
  short_description: z.string().nullable().optional(),
  image_url: z.string().url().nullable(),
  image_public_id: z.string().nullable().optional(),
  tracking_type: TrackingTypeSchema,
  product_kind: ProductKindSchema.default("QUANTITY_BASED"),
  base_purchase_price: z.coerce.number().min(0),
  base_selling_price: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100),
  low_stock_threshold: z.coerce.number().int().min(0),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const ProductImageSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url(),
  image_public_id: z.string().min(1),
  sort_order: z.coerce.number().int(),
  created_at: z.string(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const ProductHighlightSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  label: z.string().min(1, "Highlight label is required"),
  value: z.string().min(1, "Highlight value is required"),
  sort_order: z.coerce.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProductHighlight = z.infer<typeof ProductHighlightSchema>;

export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  name: z.string().min(1, "Variant name is required"),
  color: z.string().nullable().optional(),
  storage_label: z.string().nullable().optional(),
  sku: z.string().nullable(),
  purchase_price_override: z.coerce.number().min(0).nullable(),
  selling_price_override: z.coerce.number().min(0).nullable(),
  label_code: z.string().nullable().optional(),
  qr_payload: QrPayloadSchema.nullable().optional(),
  quantity: z.coerce.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const InventoryItemStatusSchema = z.enum(["IN_STOCK", "SOLD", "RESERVED", "RETURNED", "DAMAGED"]);
export type InventoryItemStatus = z.infer<typeof InventoryItemStatusSchema>;

export const IdentifierTypeSchema = z.enum(["IMEI", "SERIAL_NUMBER", "UNIQUE_ID"]);
export type IdentifierType = z.infer<typeof IdentifierTypeSchema>;

export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  serial_number: z.string().min(1, "Serial number is required"),
  identifier_type: IdentifierTypeSchema.default("SERIAL_NUMBER"),
  imei_1: z.string().nullable().optional(),
  imei_2: z.string().nullable().optional(),
  unique_identifier: z.string().nullable().optional(),
  label_code: z.string().nullable().optional(),
  qr_payload: QrPayloadSchema.nullable().optional(),
  purchase_price: z.coerce.number().min(0),
  status: InventoryItemStatusSchema,
  added_at: z.string(),
  sold_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const InventoryItemIdentifierSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  identifier_type: IdentifierTypeSchema,
  identifier_value: z.string().min(1, "Identifier value is required"),
  sort_order: z.coerce.number().int().min(0),
  created_at: z.string(),
});
export type InventoryItemIdentifier = z.infer<typeof InventoryItemIdentifierSchema>;

export const StockMovementTypeSchema = z.enum(["PURCHASE", "SALE", "ADJUSTMENT_ADD", "ADJUSTMENT_REMOVE", "RETURN", "DAMAGE"]);
export type StockMovementType = z.infer<typeof StockMovementTypeSchema>;

export const StockMovementSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  inventory_item_id: z.string().uuid().nullable(),
  type: StockMovementTypeSchema,
  quantity_change: z.coerce.number().int(),
  reason: z.string().nullable(),
  performed_by: z.string().uuid(),
  created_at: z.string(),
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

// Form schemas (omitting generated fields like id, dates)
export const ProductFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(1, "Description is required").max(280, "Description must be 280 characters or fewer."),
  category_name: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand_name: z.string().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  image_public_id: z.string().optional().nullable(),
  product_kind: ProductKindSchema,
  tracking_type: TrackingTypeSchema,
  base_purchase_price: z.coerce.number().min(0, "Price must be >= 0"),
  base_selling_price: z.coerce.number().min(0, "Price must be >= 0"),
  tax_rate: z.coerce.number().min(0).max(100),
  low_stock_threshold: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true),
});
export type ProductFormValues = z.infer<typeof ProductFormSchema>;

export const ProductHighlightDraftSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sort_order: z.coerce.number().int().min(0).default(0),
});
export type ProductHighlightDraft = z.infer<typeof ProductHighlightDraftSchema>;

export const ProductVariantDraftSchema = z.object({
  temp_key: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  storage_label: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0).default(0),
  purchase_price_override: z.coerce.number().min(0).optional().nullable(),
  selling_price_override: z.coerce.number().min(0).optional().nullable(),
});
export type ProductVariantDraft = z.infer<typeof ProductVariantDraftSchema>;

export const InventoryUnitDraftSchema = z.object({
  variant_temp_key: z.string().min(1),
  identifier_type: IdentifierTypeSchema,
  identifier_value: z.string().min(1).optional(),
  imei_1: z.string().optional().nullable(),
  imei_2: z.string().optional().nullable(),
  serial_number: z.string().optional().nullable(),
  unique_identifier: z.string().optional().nullable(),
});
export type InventoryUnitDraft = z.infer<typeof InventoryUnitDraftSchema>;
