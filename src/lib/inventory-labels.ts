import type { ProductKind } from "@/lib/types/inventory";

type VariantLike = {
  name?: string | null;
  color?: string | null;
  storage_label?: string | null;
};

const SMARTPHONE_STORAGE_PRESETS = [
  "4GB / 64GB",
  "4GB / 128GB",
  "6GB / 64GB",
  "6GB / 128GB",
  "6GB / 256GB",
  "8GB / 128GB",
  "8GB / 256GB",
  "8GB / 512GB",
  "12GB / 256GB",
  "12GB / 512GB",
  "12GB / 1TB",
  "16GB / 512GB",
  "16GB / 1TB",
];

const APPLE_STORAGE_PRESETS = [
  "64GB",
  "128GB",
  "256GB",
  "512GB",
  "1TB",
];

const GENERIC_STORAGE_PRESETS = [
  "32GB",
  "64GB",
  "128GB",
  "256GB",
  "512GB",
  "1TB",
  "2TB",
];

export function buildVariantLabel(variant: VariantLike) {
  const storage = (variant.storage_label ?? "").trim();
  const color = (variant.color ?? "").trim();
  const normalizedName = (variant.name ?? "").trim();

  const parts = [storage, color].filter(Boolean);
  const nameLooksDefault = normalizedName.toLowerCase() === "default";
  const nameAlreadyRepresented =
    !normalizedName ||
    nameLooksDefault ||
    parts.some((part) => part.toLowerCase() === normalizedName.toLowerCase()) ||
    normalizedName.toLowerCase() === parts.join(" / ").toLowerCase();

  if (!nameAlreadyRepresented) {
    parts.push(normalizedName);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

export function getStoragePresetOptions({
  productKind,
  brandName,
}: {
  productKind: ProductKind | null;
  brandName?: string | null;
}) {
  const normalizedBrand = (brandName ?? "").trim().toLowerCase();

  if (productKind === "MOBILE") {
    return normalizedBrand === "apple" ? APPLE_STORAGE_PRESETS : SMARTPHONE_STORAGE_PRESETS;
  }

  return GENERIC_STORAGE_PRESETS;
}
