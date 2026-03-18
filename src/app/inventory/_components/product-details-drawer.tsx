"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, History, Tag, Box, ArrowUpRight, ArrowDownRight, Loader2, FileText, GalleryHorizontal } from "lucide-react";
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
  onEdit: (productId: string) => void;
  onDelete: (productId: string) => void;
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
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-6 py-4 sm:px-8 sm:py-6">
          <h2 className="text-lg font-bold text-stone-900">Product Details</h2>
          <div className="flex items-center gap-2">
            {productId && !isLoading && !isError ? (
              <ProductActionsMenu
                onEdit={() => onEdit(productId)}
                onDelete={() => onDelete(productId)}
              />
            ) : null}
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
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
            <div className="space-y-8">
              {/* Header Info */}
              <div className="flex gap-4">
                {product.image_url ? (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-stone-100 border border-stone-200">
                    <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-500 border border-blue-100">
                    <PackageOpen className="h-10 w-10" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-stone-950">{product.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                      product.product_kind === "MOBILE"
                        ? "bg-emerald-100 text-emerald-700"
                        : product.tracking_type === "SERIALIZED"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {product.product_kind === "MOBILE"
                        ? "Mobile"
                        : product.tracking_type === "SERIALIZED"
                          ? "Serialized"
                          : "Qty Based"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      <Tag className="h-3 w-3" />
                      {product.category?.name || "Uncategorized"}
                    </span>
                    {product.brand?.name ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                        {product.brand.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex gap-4 text-sm font-medium text-stone-500">
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-wider text-stone-400">Purchase</span>
                      <span className="text-stone-900">₹{product.base_purchase_price}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-wider text-stone-400">Selling</span>
                      <span className="text-emerald-600">₹{product.base_selling_price}</span>
                    </div>
                  </div>
                </div>
              </div>

              {product.description ? (
                <section>
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400">
                    <FileText className="h-4 w-4" /> Description
                  </h4>
                  <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <p className="text-sm leading-6 text-stone-700">{product.description}</p>
                  </div>
                </section>
              ) : null}

              {galleryImages.length > 0 ? (
                <section>
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400">
                    <GalleryHorizontal className="h-4 w-4" /> Images
                  </h4>
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                    {galleryImages.map((image) => (
                      <div
                        key={image.id}
                        className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
                      >
                        <img src={image.image_url} alt={product.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {product.variants?.length ? (
                <section>
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400">
                    <Tag className="h-4 w-4" /> Variants
                  </h4>
                  <div className="mt-3 space-y-3">
                    {product.variants.map((variant) => (
                      <div key={variant.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold text-stone-900">{variant.name}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                          {variant.color ? <span className="rounded-full bg-stone-100 px-2.5 py-1">{variant.color}</span> : null}
                          {variant.storage_label ? (
                            <span className="rounded-full bg-stone-100 px-2.5 py-1">{variant.storage_label}</span>
                          ) : null}
                          {product.tracking_type === "QUANTITY_BASED" ? (
                            <span className="rounded-full bg-stone-100 px-2.5 py-1">{variant.quantity ?? 0} in stock</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Stock Info */}
              <section>
                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400">
                  <Box className="h-4 w-4" /> Current Stock
                </h4>
                <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Total Available</p>
                      <p className={`mt-1 text-3xl font-black ${product.total_quantity <= product.low_stock_threshold ? "text-rose-600" : "text-stone-900"}`}>
                        {product.total_quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Threshold</p>
                      <p className="mt-1 text-sm font-bold text-stone-700">{product.low_stock_threshold} units</p>
                    </div>
                  </div>

                  {product.tracking_type === "SERIALIZED" && (product.inventory_items?.length ?? 0) > 0 && (
                    <div className="mt-4 border-t border-stone-100 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                        Active {product.product_kind === "MOBILE" ? "IMEI Numbers" : "Identifiers"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {inStockItems.map((item: InventoryItem) => (
                          <span key={item.id} className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 font-mono">
                            {item.serial_number}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Audit / Movements */}
              <section>
                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400">
                  <History className="h-4 w-4" /> Activity Log
                </h4>
                <div className="mt-3 space-y-3">
                  {product.stock_movements?.length === 0 ? (
                    <p className="text-sm text-stone-500">No activity recorded yet.</p>
                  ) : (
                    product.stock_movements?.map((movement: StockMovement) => (
                      <div key={movement.id} className="flex items-start gap-4 rounded-2xl border border-stone-100 bg-stone-50 p-4">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${movement.quantity_change > 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                          {movement.quantity_change > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-stone-900">
                            {movement.type.replace("_", " ")} 
                            <span className={`ml-2 font-bold ${movement.quantity_change > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change}
                            </span>
                          </p>
                          {movement.reason && <p className="mt-0.5 text-xs text-stone-500">{movement.reason}</p>}
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                            By {movement.performed_by_name} • {format(new Date(movement.created_at), "MMM d, yyyy • h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
