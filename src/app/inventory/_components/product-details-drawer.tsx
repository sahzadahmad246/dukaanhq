"use client";

import { useEffect, useState } from "react";
import { X, PackageOpen, History, Tag, Box, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { getProductDetailsAction } from "../actions";

export function ProductDetailsDrawer({
  productId,
  onClose,
}: {
  productId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<any>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }

    let isMounted = true;
    
    async function fetchDetails() {
      setLoading(true);
      const res = await getProductDetailsAction(productId!);
      if (isMounted) {
        if (res.status === "success") {
          setProduct(res.data);
        }
        setLoading(false);
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [productId]);

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
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {loading || !product ? (
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
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${product.tracking_type === "SERIALIZED" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {product.tracking_type === "SERIALIZED" ? "Serialized" : "Qty Based"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      <Tag className="h-3 w-3" />
                      {product.category?.name || "Uncategorized"}
                    </span>
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

                  {product.tracking_type === "SERIALIZED" && product.inventory_items?.length > 0 && (
                    <div className="mt-4 border-t border-stone-100 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Active Serial Numbers</p>
                      <div className="flex flex-wrap gap-2">
                        {product.inventory_items.filter((i: any) => i.status === "IN_STOCK").map((item: any) => (
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
                    product.stock_movements?.map((movement: any) => (
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
                            {format(new Date(movement.created_at), "MMM d, yyyy • h:mm a")}
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
