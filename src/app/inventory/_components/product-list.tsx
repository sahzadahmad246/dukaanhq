import { LoaderCircle } from "lucide-react";

import { Product } from "@/lib/types/inventory";
import { ProductActionsMenu } from "./product-actions-menu";

export function ProductList({
  products,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  deletingProductId,
}: {
  products: (Product & { total_quantity: number })[];
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
  deletingProductId?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-[1.7rem] border border-stone-200 bg-white shadow-sm">
      <div className="divide-y divide-stone-100">
        {products.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-stone-500">
            No products found in inventory. Add one to get started.
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              onClick={() => onProductClick?.(product.id)}
              onMouseEnter={() => onProductHover?.(product.id)}
              onFocus={() => onProductHover?.(product.id)}
              onTouchStart={() => onProductHover?.(product.id)}
              className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-stone-50/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-stone-950">
                    {product.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      product.product_kind === "MOBILE"
                        ? "bg-emerald-100 text-emerald-700"
                        : product.tracking_type === "SERIALIZED"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {product.product_kind === "MOBILE"
                      ? "Mobile"
                      : product.tracking_type === "SERIALIZED"
                        ? "Serial"
                        : "Qty"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-stone-500">
                  <span>In: ₹{product.base_purchase_price}</span>
                  <span className="h-1 w-1 rounded-full bg-stone-300" />
                  <span>Out: ₹{product.base_selling_price}</span>
                </div>
              </div>
              
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Stock
                </div>
                <div
                  className={`mt-0.5 text-lg font-bold ${
                    product.total_quantity <= product.low_stock_threshold
                      ? "text-rose-600"
                      : "text-stone-900"
                  }`}
                >
                  {product.total_quantity}
                </div>
                <div className="mt-2 flex justify-end">
                  {deletingProductId === product.id ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <ProductActionsMenu
                      onEdit={() => onProductEdit?.(product.id)}
                      onDelete={() => onProductDelete?.(product.id)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
