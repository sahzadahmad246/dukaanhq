"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Product } from "@/lib/types/inventory";
import { ProductList } from "./product-list";
import { AddProductModal } from "./add-product-modal";

export function InventoryManager({ products }: { products: (Product & { total_quantity: number })[] }) {
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">Products Catalog</h2>
          <p className="text-sm text-stone-500">Manage your store's inventory and stock levels.</p>
        </div>
        <button
          onClick={() => setIsAddProductOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      <ProductList products={products} />

      <AddProductModal
        open={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
      />
    </>
  );
}
