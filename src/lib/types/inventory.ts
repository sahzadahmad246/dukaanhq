import { z } from "zod";

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

export const ProductSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  brand_id: z.string().uuid().nullable(),
  name: z.string().min(1, "Product name is required"),
  slug: z.string().min(1, "Product slug is required"),
  description: z.string().nullable(),
  image_url: z.string().url().nullable(),
  image_public_id: z.string().nullable().optional(),
  tracking_type: TrackingTypeSchema,
  base_purchase_price: z.coerce.number().min(0),
  base_selling_price: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100),
  low_stock_threshold: z.coerce.number().int().min(0),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  name: z.string().min(1, "Variant name is required"),
  sku: z.string().nullable(),
  purchase_price_override: z.coerce.number().min(0).nullable(),
  selling_price_override: z.coerce.number().min(0).nullable(),
  quantity: z.coerce.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const InventoryItemStatusSchema = z.enum(["IN_STOCK", "SOLD", "RESERVED", "RETURNED", "DAMAGED"]);
export type InventoryItemStatus = z.infer<typeof InventoryItemStatusSchema>;

export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  shop_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  serial_number: z.string().min(1, "Serial number is required"),
  purchase_price: z.coerce.number().min(0),
  status: InventoryItemStatusSchema,
  added_at: z.string(),
  sold_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

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
  category_name: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  image_public_id: z.string().optional().nullable(),
  tracking_type: TrackingTypeSchema,
  base_purchase_price: z.coerce.number().min(0, "Price must be >= 0"),
  base_selling_price: z.coerce.number().min(0, "Price must be >= 0"),
  tax_rate: z.coerce.number().min(0).max(100),
  low_stock_threshold: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true),
});
export type ProductFormValues = z.infer<typeof ProductFormSchema>;
