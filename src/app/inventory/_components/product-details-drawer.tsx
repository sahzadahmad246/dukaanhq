"use client";

import { useMemo, useState, useEffect } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, Loader2, TrendingUp, TrendingDown, Tag, Layers, QrCode, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fetchProductDetails, productDetailsQueryKey, type ProductDetails } from "../queries";
import { ProductActionsMenu } from "./product-actions-menu";
import { Button } from "@/components/ui/button";
import { buildVariantLabel } from "@/lib/inventory-labels";
import { downloadQrSheetPdf } from "@/lib/qr-pdf";
import { stringifyQrPayload } from "@/lib/qr";

type InventoryItem = NonNullable<ProductDetails["inventory_items"]>[number];
type StockMovement = NonNullable<ProductDetails["stock_movements"]>[number];
type ProductHighlight = NonNullable<ProductDetails["highlights"]>[number];

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

function StatusPill({ count, label, type }: { count: number; label: string; type: "success" | "danger" | "info" }) {
  const styles = {
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
    danger: "bg-red-50 text-red-600 ring-1 ring-red-200/60",
    info: "bg-sky-50 text-sky-600 ring-1 ring-sky-200/60",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${styles[type]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${type === "success" ? "bg-emerald-500" : type === "danger" ? "bg-red-500" : "bg-sky-500"}`} />
      {count} {label}
    </span>
  );
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
  const [showQrModal, setShowQrModal] = useState(false);

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
        labelCode: variant.label_code ?? null,
        qrPayload: variant.qr_payload ?? null,
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

  const allImages = useMemo(() => {
    if (!product) return [];
    const images = [];
    if (product.image_url) images.push({ id: 'primary', image_url: product.image_url });
    product.product_images?.forEach(img => {
      if (img.image_url !== product.image_url) images.push(img);
    });
    return images;
  }, [product]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (allImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [allImages.length]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [productId]);

  const { minPrice, displayPriceLabel } = useMemo(() => {
    if (!product) return { minPrice: 0, displayPriceLabel: "Price" };
    const variantsWithPrice = product.variants?.filter(v => v.selling_price_override !== null && v.selling_price_override !== undefined) || [];
    if (variantsWithPrice.length > 0) {
      const min = Math.min(...variantsWithPrice.map(v => Number(v.selling_price_override)));
      return { minPrice: min, displayPriceLabel: "Starting from" };
    }
    return { minPrice: Number(product.base_selling_price ?? 0), displayPriceLabel: "" };
  }, [product]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${productId ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[90vh] flex-col rounded-t-3xl bg-[#FAFAF8] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-20 sm:h-[calc(100vh-6rem)] sm:w-[460px] sm:rounded-2xl ${productId ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"}`}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-stone-400">Product Details</span>
          <div className="flex items-center gap-2">
            {productId && !isLoading && !isError && onEdit && onDelete ? (
              <ProductActionsMenu
                onEdit={() => onEdit(productId)}
                onDelete={() => onDelete(productId)}
                onRecordSale={onRecordSale ? () => onRecordSale(productId) : undefined}
                onAdjustStock={onAdjustStock ? () => onAdjustStock(productId) : undefined}
                onDownloadQr={() => setShowQrModal(true)}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 transition-all hover:bg-stone-200 hover:text-stone-800"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {!productId ? null : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100">
                <PackageOpen className="h-5 w-5 text-stone-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-700">Couldn't load product</p>
                <p className="mt-1 text-xs text-stone-400">{error instanceof Error ? error.message : "Please try again."}</p>
              </div>
            </div>
          ) : isLoading || !product ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
              <p className="text-xs font-medium text-stone-400">Loading product…</p>
            </div>
          ) : (
            <div className="flex flex-col pb-10">

              {/* ── Image Carousel ── */}
              <div className="mx-4 overflow-hidden rounded-2xl bg-stone-100 relative group" style={{ aspectRatio: "4/3" }}>
                {allImages.length > 0 ? (
                  <div className="h-full w-full relative">
                    <img key={allImages[currentImageIndex].id} src={allImages[currentImageIndex].image_url} alt={`${product.name} - Image ${currentImageIndex + 1}`} className="h-full w-full object-cover transition-opacity duration-500" />
                    {allImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/40 text-white backdrop-blur-sm transition opacity-0 group-hover:opacity-100 hover:bg-stone-900/60"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/40 text-white backdrop-blur-sm transition opacity-0 group-hover:opacity-100 hover:bg-stone-900/60"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <PackageOpen className="h-14 w-14 text-stone-300" />
                  </div>
                )}
                {allImages.length > 1 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                    {allImages.map((_, i) => (
                      <div key={i} className={`h-1.5 rounded-full shadow-sm border border-white/30 backdrop-blur-sm transition-all ${i === currentImageIndex ? "w-3 bg-white" : "w-1.5 bg-stone-800/50"}`} />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Name & Meta ── */}
              <div className="mt-5 px-5">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900" style={{ fontFamily: "'Georgia', serif" }}>
                    {product.name}
                  </h1>
                  <div className="shrink-0 text-right pt-0.5">
                    {displayPriceLabel && <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">{displayPriceLabel}</p>}
                    <p className="text-[20px] font-bold text-stone-900 leading-none">₹{minPrice.toLocaleString("en-IN")}</p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {product.category?.name && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
                      <Layers className="h-3 w-3" />
                      {product.category.name}
                    </span>
                  )}
                  {product.brand?.name && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
                      <Tag className="h-3 w-3" />
                      {product.brand.name}
                    </span>
                  )}
                </div>

                {(product.short_description || product.description) && (
                  <p className="mt-3.5 text-[13px] leading-relaxed text-stone-500">
                    {product.short_description || product.description}
                  </p>
                )}
              </div>

              {/* ── Variants List ── */}
              {variantSummaries.length > 0 && (
                <div className="mt-8 mb-4 px-6">
                  <div className="rounded-[1.6rem] border border-stone-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between bg-stone-50/80 px-5 py-3.5 border-b border-stone-200">
                      <h3 className="text-[13px] font-extrabold uppercase tracking-tight text-stone-700">Available Options</h3>
                      <div className="text-[12px] font-bold text-emerald-700 bg-emerald-100/50 px-2.5 py-1 rounded-full outline outline-1 outline-emerald-200">
                        {variantSummaries.reduce((acc, curr) => acc + curr.sellable, 0)} In Stock
                      </div>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {variantSummaries.map(({ variant, sellable, damaged, returned, sellingPrice }) => (
                        <div key={variant.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-colors hover:bg-stone-50/40">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between sm:justify-start gap-4">
                              <p className="text-[14px] font-bold text-stone-900 line-clamp-1">
                                {[variant.storage_label, variant.color].filter(Boolean).join(" / ") || "Standard"}
                              </p>
                              <p className="text-[14px] font-bold text-stone-900 sm:hidden">
                                ₹{sellingPrice.toLocaleString("en-IN")}
                              </p>
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                              <StatusPill count={sellable} label="stock" type={sellable > 0 ? "success" : "danger"} />
                              {damaged > 0 && <StatusPill count={damaged} label="dmg" type="danger" />}
                              {returned > 0 && <StatusPill count={returned} label="ret" type="info" />}
                            </div>
                          </div>
                          <div className="hidden sm:block shrink-0 text-right">
                            <p className="text-[15px] font-black tracking-tight text-stone-900">
                              ₹{sellingPrice.toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}



              {/* ── Serialized In-Stock ── */}
              {product.tracking_type === "SERIALIZED" && inStockItems.length > 0 && (
                <div className="mt-8 px-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                    {product.product_kind === "MOBILE" ? "Sellable Devices / IMEI" : "Sellable Units"}
                  </p>
                  <div className="space-y-2">
                    {inStockItems.map((item: InventoryItem) => (
                      <div key={item.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5">
                        <p className="text-[13px] font-semibold text-stone-900">
                          {buildVariantLabel(variants.find((v) => v.id === item.variant_id) ?? {}) ?? product.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-stone-500">{buildInventoryItemLabel(item)}</p>
                        {item.label_code && (
                          <p className="mt-2 font-mono text-[10px] font-medium text-stone-400">{item.label_code}</p>
                        )}
                        {item.label_code && item.qr_payload && (
                          <button
                            className="mt-3 w-full rounded-xl border border-stone-200 bg-stone-50 py-2 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"
                            onClick={() => void downloadQrSheetPdf([{ labelCode: item.label_code as string, payload: stringifyQrPayload(item.qr_payload!) }], `${(item.label_code as string).toLowerCase()}-qr.pdf`)}
                          >
                            Download QR
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Damaged ── */}
              {product.tracking_type === "SERIALIZED" && damagedItems.length > 0 && (
                <div className="mt-6 px-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Damaged Units</p>
                  <div className="space-y-2">
                    {damagedItems.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
                        <p className="text-[13px] font-semibold text-red-800">
                          {buildVariantLabel(variants.find((v) => v.id === item.variant_id) ?? {}) ?? product.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-red-500">{buildInventoryItemLabel(item)}</p>
                        {item.label_code && <p className="mt-2 font-mono text-[10px] font-medium text-red-400">{item.label_code}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Returned ── */}
              {product.tracking_type === "SERIALIZED" && returnedItems.length > 0 && (
                <div className="mt-6 px-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">Returned Units</p>
                  <div className="space-y-2">
                    {returnedItems.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3.5">
                        <p className="text-[13px] font-semibold text-sky-800">
                          {buildVariantLabel(variants.find((v) => v.id === item.variant_id) ?? {}) ?? product.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-sky-500">{buildInventoryItemLabel(item)}</p>
                        {item.label_code && <p className="mt-2 font-mono text-[10px] font-medium text-sky-400">{item.label_code}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Highlights ── */}
              {product.highlights?.length ? (
                <div className="mt-6 px-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Highlights</p>
                  <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    {product.highlights.map((highlight: ProductHighlight) => (
                      <div key={highlight.id} className="flex items-start gap-4 px-4 py-3">
                        <p className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 pt-0.5">
                          {highlight.label}
                        </p>
                        <p className="text-[13px] font-medium text-stone-800">{highlight.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ── Recent Activity ── */}
              {product.stock_movements && product.stock_movements.length > 0 && (
                <div className="mt-6 px-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Recent Activity</p>
                  <div className="space-y-2">
                    {product.stock_movements.slice(0, 4).map((movement: StockMovement) => {
                      const isPositive = movement.quantity_change > 0;
                      return (
                        <div key={movement.id} className="flex items-center gap-3.5 rounded-xl border border-stone-100 bg-white px-4 py-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isPositive ? "bg-emerald-50" : "bg-red-50"}`}>
                            {isPositive
                              ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                              : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-stone-800 capitalize">
                              {movement.type.toLowerCase().replace(/_/g, " ")}
                            </p>
                            <p className="text-[11px] text-stone-400 mt-0.5">
                              {format(new Date(movement.created_at), "MMM d, h:mm a")} · {movement.performed_by_name}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[12px] font-bold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                            {isPositive ? "+" : "−"}{Math.abs(movement.quantity_change)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── QR Select Modal ── */}
      {showQrModal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-stone-950/40 px-4 pb-6 sm:p-0 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={() => setShowQrModal(false)}>
          <div className="w-full max-w-[340px] rounded-[2rem] bg-white p-5 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h4 className="px-1 text-base font-bold tracking-tight text-stone-900">Download QR Labels</h4>
            <p className="px-1 mt-1 text-[13px] text-stone-500 mb-4">Choose a specific label or download all.</p>
            
            <div className="max-h-[50vh] overflow-y-auto space-y-1.5 scrollbar-hide px-1 pb-1">
              {product?.tracking_type === "QUANTITY_BASED" 
                ? variantSummaries.filter(v => v.labelCode && v.qrPayload).map(({ variant, label, labelCode, qrPayload }) => (
                    <button 
                      key={variant.id}
                      onClick={() => {
                        void downloadQrSheetPdf([{ labelCode: labelCode as string, payload: stringifyQrPayload(qrPayload!) }], `${labelCode?.toLowerCase()}-qr.pdf`);
                        setShowQrModal(false);
                      }}
                      className="flex w-full items-center justify-between rounded-[1rem] border border-stone-200 bg-white p-3.5 text-left transition hover:border-stone-400"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[13px] font-bold text-stone-900 line-clamp-1">{label || "Variant"}</p>
                        <p className="text-[11px] font-mono text-stone-500 mt-0.5">{labelCode}</p>
                      </div>
                      <div className="shrink-0 flex items-center justify-center bg-stone-100 rounded-full h-8 w-8 text-stone-600">
                        <QrCode className="h-4 w-4" />
                      </div>
                    </button>
                  ))
                : (product?.inventory_items ?? []).filter(i => i.label_code && i.qr_payload).map(item => (
                    <button 
                      key={item.id}
                      onClick={() => {
                        void downloadQrSheetPdf([{ labelCode: item.label_code as string, payload: stringifyQrPayload(item.qr_payload!) }], `${item.label_code?.toLowerCase()}-qr.pdf`);
                        setShowQrModal(false);
                      }}
                      className="flex w-full items-center justify-between rounded-[1rem] border border-stone-200 bg-white p-3.5 text-left transition hover:border-stone-400"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[13px] font-bold text-stone-900 line-clamp-1">{buildInventoryItemLabel(item)}</p>
                        <p className="text-[11px] font-mono text-stone-500 mt-0.5">{item.label_code}</p>
                      </div>
                      <div className="shrink-0 flex items-center justify-center bg-stone-100 rounded-full h-8 w-8 text-stone-600">
                        <QrCode className="h-4 w-4" />
                      </div>
                    </button>
                  ))
              }
              
              {((product?.tracking_type === "QUANTITY_BASED" 
                ? variantSummaries.filter(v => v.labelCode && v.qrPayload).length 
                : (product?.inventory_items ?? []).filter(i => i.label_code && i.qr_payload).length) > 1) && (
                <>
                  <div className="py-2"><hr className="border-stone-100" /></div>
                  <button 
                    onClick={() => {
                      const entries = product?.tracking_type === "QUANTITY_BASED"
                        ? variantSummaries.filter((e) => e.labelCode && e.qrPayload).map((e) => ({ labelCode: e.labelCode as string, payload: stringifyQrPayload(e.qrPayload!) }))
                        : (product?.inventory_items ?? []).filter((i) => i.label_code && i.qr_payload).map((i) => ({ labelCode: i.label_code as string, payload: stringifyQrPayload(i.qr_payload!) }));
                      void downloadQrSheetPdf(entries, `${product?.name.trim().replace(/\s+/g, "-").toLowerCase()}-qr-labels.pdf`);
                      setShowQrModal(false);
                    }}
                    className="flex w-full items-center justify-between rounded-[1rem] bg-stone-900 p-3.5 text-left transition hover:bg-stone-800 shadow-md"
                  >
                    <div>
                      <p className="text-[13px] font-bold text-white">All Labels</p>
                      <p className="text-[11px] font-medium text-stone-300 mt-0.5">Batch download</p>
                    </div>
                  </button>
                </>
              )}
            </div>

            <div className="mt-3 flex justify-end px-1">
              <Button variant="ghost" className="rounded-xl w-full font-semibold" onClick={() => setShowQrModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}