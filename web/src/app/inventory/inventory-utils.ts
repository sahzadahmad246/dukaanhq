import type { ProductKind, TrackingType } from "@/lib/types/inventory";

type VariantLike = {
  quantity?: number | null;
};

type InventoryItemLike = {
  status?: string | null;
};

export function computeInventoryQuantity({
  trackingType,
  variants,
  inventoryItems,
}: {
  productKind: ProductKind;
  trackingType: TrackingType;
  variants?: VariantLike[] | null;
  inventoryItems?: InventoryItemLike[] | null;
}) {
  if (trackingType === "QUANTITY_BASED") {
    return (variants ?? []).reduce((sum, variant) => sum + (variant.quantity ?? 0), 0);
  }

  const inStockCount = (inventoryItems ?? []).filter((item) => item.status === "IN_STOCK").length;
  return inStockCount;
}

export function matchesSearch(text: string, query: string) {
  const normalizedText = text.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => normalizedText.includes(part));
}

export function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
