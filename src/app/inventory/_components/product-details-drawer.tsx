"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { X, PackageOpen, Loader2, ChevronDown } from "lucide-react";
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
                {product.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-300">
                    <PackageOpen className="h-16 w-16" />
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex gap-1.5">
                  {[...Array(3)].map((_, i) => (
                     <div key={i} className={`h-1.5 rounded-full ${i === 0 ? "w-4 bg-blue-600" : "w-1.5 bg-stone-300"}`} />
                  ))}
                </div>
              </div>

              {/* Title & Description */}
              <div className="px-5 py-5">
                <h1 className="text-[22px] font-extrabold leading-tight text-stone-900 tracking-tight">{product.name}</h1>
                <p className="mt-1.5 text-sm text-stone-500 leading-relaxed">
                  {product.description || (product.category?.name ? `Premium quality ${product.category.name.toLowerCase()} available for purchase.` : "High quality product from our store inventory.")}
                </p>
                <div className="mt-4 text-[13px] font-medium text-stone-600">
                  <span className="text-stone-500">Category:</span> {product.category?.name || "General"}
                  {product.brand?.name && <span className="ml-3"><span className="text-stone-500">Brand:</span> {product.brand.name}</span>}
                </div>
              </div>

              {/* Options / Pricing Block */}
              <div className="px-5 mt-1">
                <div className="flex items-stretch gap-3">
                  <div className="relative flex-1 rounded-2xl border-2 border-blue-600 bg-blue-50/40 p-3.5 pt-4 transition-all">
                    <span className="absolute -top-2.5 left-3 bg-white px-1.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">
                      Standard
                    </span>
                    <p className="font-bold text-stone-900">{product.tracking_type === "QUANTITY_BASED" ? "Quantity Item" : "Serialized"}</p>
                    <div className="mt-2.5 flex items-end gap-1.5">
                      <span className="text-xl font-black text-stone-900 leading-none">₹{product.base_selling_price}</span>
                      {product.base_purchase_price < product.base_selling_price && (
                         <span className="text-xs font-semibold text-stone-400 line-through mb-0.5">₹{Math.round(product.base_selling_price * 1.2)}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-stone-500 text-stone-500">
                       Cost price: ₹{product.base_purchase_price}
                    </p>
                  </div>

                  {product.total_quantity > 0 ? (
                    <div className="flex-1 rounded-2xl border border-stone-200 bg-white p-3.5 pt-4 opacity-70">
                      <p className="font-bold text-stone-600">Wholesale</p>
                      <div className="mt-2.5 flex items-end gap-1.5">
                         <span className="text-xl font-black text-stone-900 leading-none">₹{Math.round(product.base_selling_price * 0.9)}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-stone-500 text-stone-500">
                         Min 10 qty
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Add Button Row */}
              <div className="mx-5 mt-6 flex items-center justify-between rounded-2xl border border-stone-100 bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-stone-950/5">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${product.total_quantity > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {product.total_quantity > 0 ? `${product.total_quantity} IN STOCK` : "OUT OF STOCK"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-lg font-black text-stone-900">₹{product.base_selling_price}</span>
                    <span className="text-[11px] font-semibold text-stone-500 line-through tracking-tight">₹{Math.round(product.base_selling_price * 1.2)}</span>
                  </div>
                </div>
                <button 
                  className="rounded-xl bg-[#0050ff] px-8 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#0040e0] hover:shadow active:scale-95 disabled:opacity-50"
                  disabled={product.total_quantity <= 0}
                >
                  ADD
                </button>
              </div>

              {/* Payment Offers Mock */}
              <div className="mx-5 mt-5">
                <div className="w-full flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3.5 cursor-pointer hover:bg-stone-50 transition">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-stone-500">Payment Offers</span>
                    <p className="mt-0.5 text-sm font-bold text-stone-900">🏦 Upto ₹150 OFF</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-stone-400" />
                </div>
              </div>

              {/* Details Expandos */}
              <div className="mx-5 mt-8 space-y-4 border-t border-stone-100 pt-6">
                
                {product.tracking_type === "SERIALIZED" && inStockItems.length > 0 && (
                  <div>
                    <div className="flex w-full items-center justify-between py-2 text-left cursor-pointer group">
                      <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-stone-600 transition">Serial Numbers</h3>
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pb-4">
                      {inStockItems.map((item: InventoryItem) => (
                        <span key={item.id} className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-mono font-medium text-stone-700">
                          {item.serial_number}
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
                          <p className="text-[13px] font-bold text-stone-800">{variant.name}</p>
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
