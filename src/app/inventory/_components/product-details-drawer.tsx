"use client";

import { useMemo, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { fetchProductDetails, productDetailsQueryKey, type ProductDetails } from "../queries";
import { ProductActionsMenu } from "./product-actions-menu";
import { Button } from "@/components/ui/button";

type InventoryItem = NonNullable<ProductDetails["inventory_items"]>[number];
type StockMovement = NonNullable<ProductDetails["stock_movements"]>[number];
type ProductHighlight = NonNullable<ProductDetails["highlights"]>[number];
function buildVariantLabel(variant: { name?: string | null; color?: string | null; storage_label?: string | null }) {
  return [variant.storage_label, variant.color, variant.name].filter(Boolean).join(" / ") || "Default";
}

export function ProductDetailsDrawer({
  productId,
  onEdit,
  onDelete,
  onRecordSale,
  onClose,
}: {
  productId: string | null;
  onEdit?: (productId: string) => void;
  onDelete?: (productId: string) => void;
  onRecordSale?: (productId: string) => void;
  onClose: () => void;
}) {
  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    staleTime: 10 * 60 * 1000,
  });
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const variants = useMemo(() => product?.variants ?? [], [product?.variants]);
  const variantStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!product) return map;

    if (product.tracking_type === "QUANTITY_BASED") {
      for (const variant of variants) {
        map.set(variant.id, variant.quantity ?? 0);
      }
      return map;
    }

    for (const item of product.inventory_items ?? []) {
      if (item.status !== "IN_STOCK" || !item.variant_id) continue;
      map.set(item.variant_id, (map.get(item.variant_id) ?? 0) + 1);
    }
    return map;
  }, [product, variants]);

  const defaultVariant =
    variants.find((variant) => (variantStockMap.get(variant.id) ?? 0) > 0) ??
    variants[0] ??
    null;
  const activeVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    defaultVariant;
  const activeStorage = activeVariant?.storage_label ?? null;

  const storageOptions = useMemo(
    () =>
      Array.from(
        new Map(
          variants
            .filter((variant) => variant.storage_label)
            .map((variant) => [
              variant.storage_label as string,
              {
                value: variant.storage_label as string,
                stock: variants
                  .filter((item) => item.storage_label === variant.storage_label)
                  .reduce((sum, item) => sum + (variantStockMap.get(item.id) ?? 0), 0),
              },
            ])
        ).values()
      ),
    [variantStockMap, variants]
  );

  const colorSource = activeStorage
    ? variants.filter((variant) => variant.storage_label === activeStorage)
    : variants;
  const colorOptions = useMemo(
    () =>
      Array.from(
        new Map(
          colorSource
            .filter((variant) => variant.color)
            .map((variant) => [
              variant.color as string,
              {
                value: variant.color as string,
                stock: colorSource
                  .filter((item) => item.color === variant.color)
                  .reduce((sum, item) => sum + (variantStockMap.get(item.id) ?? 0), 0),
              },
            ])
        ).values()
      ),
    [colorSource, variantStockMap]
  );

  const activeVariantImages =
    (product?.product_images ?? []).filter((image) => image.variant_id === activeVariant?.id) ??
    [];
  const galleryImages = activeVariantImages.length > 0
    ? activeVariantImages
    : (product?.product_images ?? []).filter((image) => !image.variant_id);
  const heroImageUrl =
    (selectedImageUrl && galleryImages.some((image) => image.image_url === selectedImageUrl) ? selectedImageUrl : null) ??
    galleryImages[0]?.image_url ??
    product?.image_url ??
    null;
  const selectedVariantStock = activeVariant ? variantStockMap.get(activeVariant.id) ?? 0 : product?.total_quantity ?? 0;
  const inStockItems = (product?.inventory_items?.filter((item: InventoryItem) => item.status === "IN_STOCK" && (!activeVariant || item.variant_id === activeVariant.id)) ?? []);

  function handleStorageSelect(storageValue: string) {
    const matchingVariant =
      variants.find((variant) => variant.storage_label === storageValue && variant.color === activeVariant?.color) ??
      variants.find((variant) => variant.storage_label === storageValue) ??
      null;
    setSelectedVariantId(matchingVariant?.id ?? "");
    setSelectedImageUrl(null);
  }

  function handleColorSelect(colorValue: string) {
    const matchingVariant =
      variants.find(
        (variant) =>
          variant.color === colorValue &&
          (activeStorage ? variant.storage_label === activeStorage : true)
      ) ??
      variants.find((variant) => variant.color === colorValue) ??
      null;
    setSelectedVariantId(matchingVariant?.id ?? "");
    setSelectedImageUrl(null);
  }

  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-sm transition-opacity duration-300 ${productId ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose} 
      />

      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col rounded-t-[2rem] bg-white shadow-[0_-20px_60px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-24 sm:h-[calc(100vh-8rem)] sm:w-[450px] sm:rounded-[2rem] ${productId ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"}`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-stone-100">
            <h2 className="text-lg font-bold tracking-tight text-stone-900">Details</h2>
          <div className="flex items-center gap-2">
            {productId && !isLoading && !isError && onEdit && onDelete ? (
              <ProductActionsMenu
                onEdit={() => onEdit(productId)}
                onDelete={() => onDelete(productId)}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
              aria-label="Close product details"
            >
              <X className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          {!productId ? null : isError ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-stone-400">
              <PackageOpen className="h-8 w-8" />
              <p className="mt-4 text-sm font-medium text-stone-700">Could not load this product.</p>
              <p className="mt-1 text-xs text-stone-500">{error instanceof Error ? error.message : "Please try again."}</p>
            </div>
          ) : isLoading || !product ? (
            <div className="flex h-64 flex-col items-center justify-center text-stone-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="mt-4 text-sm font-medium">Fetching product data...</p>
            </div>
          ) : product ? (
            <div className="flex flex-col">
              {/* Hero Image */}
              <div className="relative aspect-[4/3] w-full bg-stone-100 overflow-hidden">
                {heroImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={heroImageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-300">
                    <PackageOpen className="h-16 w-16" />
                  </div>
                )}
              </div>

              {/* Title & Description */}
              <div className="px-5 py-5">
                <h1 className="text-[22px] font-extrabold leading-tight text-stone-900 tracking-tight">{product.name}</h1>
                <p className="mt-1.5 text-sm text-stone-500 leading-relaxed">
                  {product.short_description || product.description || (product.category?.name ? `Premium quality ${product.category.name.toLowerCase()} available for purchase.` : "High quality product from our store inventory.")}
                </p>
                <div className="mt-4 text-[13px] font-medium text-stone-600">
                  <span className="text-stone-500">Category:</span> {product.category?.name || "General"}
                  {product.brand?.name && <span className="ml-3"><span className="text-stone-500">Brand:</span> {product.brand.name}</span>}
                </div>
              </div>

              {/* Variant-aware selector block */}
              <div className="px-5 mt-1 space-y-5">
                {galleryImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setSelectedImageUrl(image.image_url)}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl border ${heroImageUrl === image.image_url ? "border-stone-900" : "border-stone-200"} bg-white`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.image_url} alt={product.name} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                {storageOptions.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Storage / Variant</p>
                    <div className="flex flex-wrap gap-2">
                      {storageOptions.map((option) => {
                        const active = option.value === activeStorage;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleStorageSelect(option.value)}
                            className={`min-w-[92px] rounded-2xl border px-3 py-3 text-left transition ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-900 hover:border-stone-400"}`}
                          >
                            <div className="text-sm font-bold">{option.value}</div>
                            <div className={`mt-1 text-[11px] font-medium ${active ? "text-white/75" : "text-stone-500"}`}>
                              {option.stock} left
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {colorOptions.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Color</p>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((option) => {
                        const active = option.value === activeVariant?.color;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleColorSelect(option.value)}
                            className={`min-w-[92px] rounded-2xl border px-3 py-3 text-left transition ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-900 hover:border-stone-400"}`}
                          >
                            <div className="text-sm font-bold">{option.value}</div>
                            <div className={`mt-1 text-[11px] font-medium ${active ? "text-white/75" : "text-stone-500"}`}>
                              {option.stock} left
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {product.tracking_type === "QUANTITY_BASED" ? "Selected Option" : "Selected Variant"}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-stone-900">
                        {activeVariant ? buildVariantLabel(activeVariant) : "Default"}
                      </h3>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selectedVariantStock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {selectedVariantStock > 0 ? `${selectedVariantStock} left` : "Out of stock"}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-2xl font-black text-stone-900">₹{product.base_selling_price}</span>
                    {product.base_purchase_price < product.base_selling_price ? (
                      <span className="text-sm font-semibold text-stone-400 line-through">₹{Math.round(product.base_selling_price * 1.2)}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">Cost price: ₹{product.base_purchase_price}</p>
                </div>
              </div>

              {onRecordSale ? (
                <div className="mx-5 mt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onRecordSale(product.id)}
                    disabled={selectedVariantStock <= 0}
                  >
                    Record Sale Without Bill
                  </Button>
                </div>
              ) : null}

              {/* Payment Offers Mock */}
              <div className="mx-5 mt-5">
                <div className="w-full flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3.5 cursor-pointer hover:bg-stone-50 transition">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-stone-500">Selected Stock</span>
                    <p className="mt-0.5 text-sm font-bold text-stone-900">{selectedVariantStock} unit(s) available</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-stone-400" />
                </div>
              </div>

              {/* Details Expandos */}
              <div className="mx-5 mt-8 space-y-4 border-t border-stone-100 pt-6">
                
                {product.tracking_type === "SERIALIZED" && inStockItems.length > 0 && (
                  <div>
                    <div className="flex w-full items-center justify-between py-2 text-left cursor-pointer group">
                      <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-stone-600 transition">
                        {product.product_kind === "MOBILE" ? "IMEI / Device IDs" : "Serial Numbers"}
                      </h3>
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pb-4">
                      {inStockItems.map((item: InventoryItem) => (
                        <span key={item.id} className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-mono font-medium text-stone-700">
                          {item.identifiers && item.identifiers.length > 0
                            ? item.identifiers
                                .sort((a, b) => a.sort_order - b.sort_order)
                                .map((identifier) => identifier.identifier_value)
                                .join(" / ")
                            : item.serial_number}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {product.variants?.length ? (
                  <div>
                    <div className="flex w-full items-center justify-between py-2 text-left cursor-pointer group border-t border-stone-100">
                      <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-stone-600 transition">Variants</h3>
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="mt-2 space-y-3 pb-4">
                      {product.variants.map((variant) => (
                        <div key={variant.id} className="flex flex-col gap-1 rounded-lg border border-stone-100 p-2.5">
                          <p className="text-[13px] font-bold text-stone-800">{buildVariantLabel(variant)}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {variant.color && <span className="text-[10px] font-bold bg-stone-100 px-2 py-0.5 rounded text-stone-600 uppercase tracking-wide">{variant.color}</span>}
                            {variant.storage_label && <span className="text-[10px] font-bold bg-stone-100 px-2 py-0.5 rounded text-stone-600 uppercase tracking-wide">{variant.storage_label}</span>}
                            {product.tracking_type === "QUANTITY_BASED" && <span className="text-[10px] font-bold bg-stone-100 px-2 py-0.5 rounded text-stone-600">Qty: {variant.quantity ?? 0}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {product.highlights?.length ? (
                  <div>
                    <div className="flex w-full items-center justify-between py-2 text-left cursor-pointer group border-t border-stone-100">
                      <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-stone-600 transition">Highlights</h3>
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="mt-2 space-y-2 pb-4">
                      {product.highlights.map((highlight: ProductHighlight) => (
                        <div key={highlight.id} className="grid grid-cols-[minmax(0,120px)_1fr] gap-3 rounded-lg border border-stone-100 bg-stone-50/60 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            {highlight.label}
                          </p>
                          <p className="text-sm font-medium text-stone-800">{highlight.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="flex w-full items-center justify-between py-2 text-left cursor-pointer group border-t border-stone-100">
                    <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-stone-600 transition">Stock & Audit Information</h3>
                    <ChevronDown className="h-4 w-4 text-stone-400" />
                  </div>
                  <div className="mt-1 pb-6 space-y-4">
                    <p className="text-xs text-stone-500 leading-relaxed">
                      This product has an alert threshold of {product.low_stock_threshold} units. Last restock activity was logged in the system. The image(s) shown are representative of the actual product.
                    </p>
                    
                    {product.stock_movements && product.stock_movements.length > 0 && (
                      <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50/50 p-3 shadow-inner">
                         <h4 className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-3">Recent Activity</h4>
                         <div className="space-y-3">
                           {product.stock_movements.slice(0, 3).map((movement: StockMovement) => (
                             <div key={movement.id} className="flex items-start gap-2.5">
                               <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${movement.quantity_change > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                 {movement.quantity_change > 0 ? "+" : "−"}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <p className="text-[11px] font-bold text-stone-700 capitalize">
                                   {movement.type.toLowerCase().replace("_", " ")} <span className="text-stone-400 font-medium ml-1">({Math.abs(movement.quantity_change)} units)</span>
                                 </p>
                                 <p className="text-[9px] font-medium text-stone-400 mt-0.5">
                                   {format(new Date(movement.created_at), "MMM d, h:mm a")} • {movement.performed_by_name}
                                 </p>
                               </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
