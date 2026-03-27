"use client";

import { useMemo } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fetchProductDetails, productDetailsQueryKey, type ProductDetails } from "../queries";
import { ProductActionsMenu } from "./product-actions-menu";
import { Button } from "@/components/ui/button";

type InventoryItem = NonNullable<ProductDetails["inventory_items"]>[number];
type StockMovement = NonNullable<ProductDetails["stock_movements"]>[number];
type ProductHighlight = NonNullable<ProductDetails["highlights"]>[number];
function buildVariantLabel(variant: { name?: string | null; color?: string | null; storage_label?: string | null }) {
  const parts = [variant.storage_label, variant.color].filter(Boolean);
  const normalizedName = (variant.name ?? "").trim();
  if (normalizedName && normalizedName.toLowerCase() !== "default") {
    parts.push(normalizedName);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

function resolveVariantSellingPrice(product: ProductDetails, variant?: NonNullable<ProductDetails["variants"]>[number] | null) {
  return Number(variant?.selling_price_override ?? product.base_selling_price ?? 0);
}

function resolveVariantPurchasePrice(product: ProductDetails, variant?: NonNullable<ProductDetails["variants"]>[number] | null) {
  return Number(variant?.purchase_price_override ?? product.base_purchase_price ?? 0);
}

function buildInventoryItemLabel(item: InventoryItem) {
  if (item.identifiers && item.identifiers.length > 0) {
    return item.identifiers
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((identifier) => identifier.identifier_value)
      .join(" / ");
  }

  if (item.imei_1 || item.imei_2) {
    return [item.imei_1, item.imei_2].filter(Boolean).join(" / ");
  }

  return item.unique_identifier || item.serial_number;
}

export function ProductDetailsDrawer({
  productId,
  onEdit,
  onDelete,
  onRecordSale,
  onAdjustStock,
  onClose,
}: {
  productId: string | null;
  onEdit?: (productId: string) => void;
  onDelete?: (productId: string) => void;
  onRecordSale?: (productId: string) => void;
  onAdjustStock?: (productId: string) => void;
  onClose: () => void;
}) {
  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    staleTime: 10 * 60 * 1000,
  });

  const variants = useMemo(() => product?.variants ?? [], [product?.variants]);
  const galleryImages = useMemo(() => product?.product_images ?? [], [product?.product_images]);
  const heroImageUrl = galleryImages[0]?.image_url ?? product?.image_url ?? null;
  const inStockItems = (product?.inventory_items?.filter((item: InventoryItem) => item.status === "IN_STOCK") ?? []);
  const damagedItems = (product?.inventory_items?.filter((item: InventoryItem) => item.status === "DAMAGED") ?? []);
  const returnedItems = (product?.inventory_items?.filter((item: InventoryItem) => item.status === "RETURNED") ?? []);

  const variantSummaries = useMemo(() => {
    if (!product) return [];

    return variants.map((variant) => {
      const sellable = product.tracking_type === "QUANTITY_BASED"
        ? variant.quantity ?? 0
        : (product.inventory_items ?? []).filter((item) => item.status === "IN_STOCK" && item.variant_id === variant.id).length;
      const damaged = (product.inventory_items ?? []).filter((item) => item.status === "DAMAGED" && item.variant_id === variant.id).length;
      const returned = (product.inventory_items ?? []).filter((item) => item.status === "RETURNED" && item.variant_id === variant.id).length;

      return {
        variant,
        sellable,
        damaged,
        returned,
        label: buildVariantLabel(variant) ?? product.name,
        sellingPrice: resolveVariantSellingPrice(product, variant),
        purchasePrice: resolveVariantPurchasePrice(product, variant),
      };
    });
  }, [product, variants]);

  const variantImageMap = useMemo(() => {
    const map = new Map<string, NonNullable<ProductDetails["product_images"]>[number][]>();
    for (const image of galleryImages) {
      const key = image.variant_id ?? "shared";
      map.set(key, [...(map.get(key) ?? []), image]);
    }
    return map;
  }, [galleryImages]);

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

              <div className="px-5 mt-1 space-y-5">
                {galleryImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((image) => (
                      <div
                        key={image.id}
                        className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.image_url} alt={product.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Sellable Stock</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${product.total_quantity > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {product.total_quantity} saleable
                    </span>
                    {damagedItems.length > 0 ? (
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                        {damagedItems.length} damaged
                      </span>
                    ) : null}
                    {returnedItems.length > 0 ? (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        {returnedItems.length} returned
                      </span>
                    ) : null}
                  </div>
                </div>

                {variantSummaries.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-extrabold text-stone-900">Variant Inventory</h3>
                    <div className="mt-3 space-y-3">
                      {variantSummaries.map(({ variant, label, sellable, damaged, returned, sellingPrice, purchasePrice }) => (
                        <div key={variant.id} className="rounded-[1.35rem] border border-stone-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-stone-900">{label}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {[
                                  variant.storage_label,
                                  variant.color,
                                  variantImageMap.get(variant.id)?.length ? `${variantImageMap.get(variant.id)?.length} images` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ") || "Standard option"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-stone-900">₹{sellingPrice}</p>
                              <p className="mt-1 text-xs text-stone-500">Cost ₹{purchasePrice}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${sellable > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {sellable} sellable
                            </span>
                            {damaged > 0 ? (
                              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{damaged} damaged</span>
                            ) : null}
                            {returned > 0 ? (
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{returned} returned</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {onRecordSale || onAdjustStock ? (
                <div className="mx-5 mt-4 grid gap-3">
                  {onRecordSale ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onRecordSale(product.id)}
                      disabled={product.total_quantity <= 0}
                    >
                      Record Sale Without Bill
                    </Button>
                  ) : null}
                  {onAdjustStock ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => onAdjustStock(product.id)}
                    >
                      Adjust Stock
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="mx-5 mt-8 space-y-4 border-t border-stone-100 pt-6">
                {product.tracking_type === "SERIALIZED" && inStockItems.length > 0 && (
                  <div>
                    <h3 className="py-2 text-sm font-extrabold text-stone-900">
                      {product.product_kind === "MOBILE" ? "Sellable IMEI / Devices" : "Sellable Serialized Units"}
                    </h3>
                    <div className="mt-2 space-y-2 pb-4">
                      {inStockItems.map((item: InventoryItem) => (
                        <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                          <p className="text-sm font-semibold text-stone-900">
                            {buildVariantLabel(variants.find((variant) => variant.id === item.variant_id) ?? {}) ?? product.name}
                          </p>
                          <p className="mt-1 text-xs font-mono text-stone-600">{buildInventoryItemLabel(item)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {product.tracking_type === "SERIALIZED" && damagedItems.length > 0 ? (
                  <div>
                    <h3 className="border-t border-stone-100 py-2 text-sm font-extrabold text-stone-900">Damaged Units</h3>
                    <div className="mt-2 space-y-2 pb-4">
                      {damagedItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
                          <p className="text-sm font-semibold text-rose-900">
                            {buildVariantLabel(variants.find((variant) => variant.id === item.variant_id) ?? {}) ?? product.name}
                          </p>
                          <p className="mt-1 text-xs font-mono text-rose-700">{buildInventoryItemLabel(item)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {product.tracking_type === "SERIALIZED" && returnedItems.length > 0 ? (
                  <div>
                    <h3 className="border-t border-stone-100 py-2 text-sm font-extrabold text-stone-900">Returned Units</h3>
                    <div className="mt-2 space-y-2 pb-4">
                      {returnedItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
                          <p className="text-sm font-semibold text-blue-900">
                            {buildVariantLabel(variants.find((variant) => variant.id === item.variant_id) ?? {}) ?? product.name}
                          </p>
                          <p className="mt-1 text-xs font-mono text-blue-700">{buildInventoryItemLabel(item)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {product.highlights?.length ? (
                  <div>
                    <h3 className="border-t border-stone-100 py-2 text-sm font-extrabold text-stone-900">Highlights</h3>
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
                  <h3 className="border-t border-stone-100 py-2 text-sm font-extrabold text-stone-900">Stock & Audit Information</h3>
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
