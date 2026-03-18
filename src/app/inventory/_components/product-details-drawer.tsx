"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fetchProductDetails, productDetailsQueryKey, type ProductDetails } from "../queries";
import { ProductActionsMenu } from "./product-actions-menu";

type InventoryItem = NonNullable<ProductDetails["inventory_items"]>[number];
type StockMovement = NonNullable<ProductDetails["stock_movements"]>[number];

export function ProductDetailsDrawer({
  productId,
  onEdit,
  onDelete,
  onClose,
}: {
  productId: string | null;
  onEdit?: (productId: string) => void;
  onDelete?: (productId: string) => void;
  onClose: () => void;
}) {
  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    staleTime: 10 * 60 * 1000,
  });
  const inStockItems = product?.inventory_items?.filter((item: InventoryItem) => item.status === "IN_STOCK") ?? [];
  const galleryImages = product
    ? [
        ...(product.image_url && product.image_public_id
          ? [{ id: "primary", image_url: product.image_url, image_public_id: product.image_public_id, sort_order: 0 }]
          : []),
        ...((product.product_images ?? []).filter((image) => image.image_public_id !== product.image_public_id)),
      ]
    : [];

  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-sm transition-opacity duration-300 ${productId ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose} 
      />

      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col rounded-t-[2rem] bg-white shadow-[0_-20px_60px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-24 sm:h-[calc(100vh-8rem)] sm:w-[450px] sm:rounded-[2rem] ${productId ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"}`}
      >
        <div className="flex shrink-0 items-center justify-between px-6 py-5 sm:px-8 sm:py-7">
            <h2 className="text-xl font-bold tracking-tight text-stone-950">Details</h2>
          <div className="flex items-center gap-3">
            {productId && !isLoading && !isError && onEdit && onDelete ? (
              <ProductActionsMenu
                onEdit={() => onEdit(productId)}
                onDelete={() => onDelete(productId)}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center text-stone-400 transition hover:text-stone-900"
              aria-label="Close product details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
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
          ) : (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex gap-4">
                {product.image_url ? (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
                    <PackageOpen className="h-8 w-8" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-stone-950 truncate">{product.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${
                      product.product_kind === "MOBILE"
                        ? "bg-emerald-50 text-emerald-700"
                        : product.tracking_type === "SERIALIZED"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-blue-50 text-blue-700"
                    }`}>
                      {product.product_kind === "MOBILE"
                        ? "Mobile"
                        : product.tracking_type === "SERIALIZED"
                          ? "Serialized"
                          : "Qty Based"}
                    </span>
                    {product.category?.name && (
                      <span className="inline-flex rounded px-2 py-1 text-xs font-medium text-stone-600 bg-stone-50">
                        {product.category.name}
                      </span>
                    )}
                    {product.brand?.name && (
                      <span className="inline-flex rounded px-2 py-1 text-xs font-medium text-stone-600 bg-stone-50">
                        {product.brand.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Purchase</p>
                      <p className="mt-0.5 text-sm font-bold text-stone-900">₹{product.base_purchase_price}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Selling</p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-600">₹{product.base_selling_price}</p>
                    </div>
                  </div>
                </div>
              </div>

              {product.description ? (
                <section className="border-t border-stone-100 pt-6">
                  <p className="text-sm leading-6 text-stone-700">{product.description}</p>
                </section>
              ) : null}

              {galleryImages.length > 0 ? (
                <section className="border-t border-stone-100 pt-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">Images</h4>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((image) => (
                      <div
                        key={image.id}
                        className="h-20 w-20 shrink-0 overflow-hidden rounded bg-stone-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.image_url} alt={product.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {product.variants?.length ? (
                <section className="border-t border-stone-100 pt-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-4">Variants</h4>
                  <div className="space-y-4">
                    {product.variants.map((variant, idx, variants) => (
                      <div key={variant.id}>
                        <p className="text-sm font-semibold text-stone-900 mb-2">{variant.name}</p>
                        <div className="flex flex-wrap gap-2">
                          {variant.color && <span className="text-xs bg-stone-50 px-2.5 py-1 rounded text-stone-700">{variant.color}</span>}
                          {variant.storage_label && <span className="text-xs bg-stone-50 px-2.5 py-1 rounded text-stone-700">{variant.storage_label}</span>}
                          {product.tracking_type === "QUANTITY_BASED" && <span className="text-xs bg-stone-50 px-2.5 py-1 rounded text-stone-700">{variant.quantity ?? 0} in stock</span>}
                        </div>
                        {idx < variants.length - 1 && <div className="mt-4 border-b border-stone-100" />}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Stock Info */}
              <section className="border-t border-stone-100 pt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-4">Stock Status</h4>
                <div className="mb-4 flex items-start justify-between gap-8">
                  <div className="flex flex-col justify-start">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Total</p>
                    <p className={`text-3xl font-bold ${product.total_quantity <= product.low_stock_threshold ? "text-rose-600" : "text-stone-900"}`}>
                      {product.total_quantity}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-start pt-[2px] text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Threshold</p>
                    <p className="text-sm font-bold text-stone-700">{product.low_stock_threshold}</p>
                  </div>
                </div>

                {product.tracking_type === "SERIALIZED" && (product.inventory_items?.length ?? 0) > 0 && (
                  <div className="pt-4 border-t border-stone-100">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {product.product_kind === "MOBILE" ? "IMEI Numbers" : "Identifiers"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {inStockItems.map((item: InventoryItem) => (
                        <span key={item.id} className="bg-stone-50 px-2 py-1 text-xs font-mono text-stone-700 rounded">
                          {item.serial_number}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Audit / Movements */}
              {product.stock_movements && product.stock_movements.length > 0 && (
                <section className="border-t border-stone-100 pt-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-4">Activity</h4>
                  <div className="space-y-0">
                    {product.stock_movements.map((movement: StockMovement, idx, movements) => (
                      <div key={movement.id}>
                        <div className="flex items-start gap-3 py-3">
                          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${movement.quantity_change > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {movement.quantity_change > 0 ? "+" : "−"}{Math.abs(movement.quantity_change)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-900 capitalize">
                              {movement.type.toLowerCase().replace("_", " ")}
                            </p>
                            {movement.reason && <p className="text-xs text-stone-600 mt-0.5">{movement.reason}</p>}
                            <p className="text-[11px] text-stone-500 mt-1">
                              {movement.performed_by_name} • {format(new Date(movement.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                        {idx < movements.length - 1 && <div className="border-b border-stone-100" />}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
