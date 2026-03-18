"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Brand, Category, Product } from "@/lib/types/inventory";
import { ProductList } from "./product-list";
import { AddProductModal } from "./add-product-modal";
import { ProductDetailsDrawer } from "./product-details-drawer";
import { productDetailsQueryOptions } from "../queries";
import { deleteProductAction } from "../actions";

export function InventoryManager({
  products,
  categories,
  brands,
}: {
  products: (Product & { total_quantity: number })[];
  categories: Category[];
  brands: Brand[];
}) {
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();
  const queryClient = useQueryClient();

  function prefetchProduct(productId: string) {
    void queryClient.prefetchQuery(productDetailsQueryOptions(productId));
  }

  function handleProductClick(productId: string) {
    prefetchProduct(productId);
    setSelectedProductId(productId);
  }

  function handleProductEdit(productId: string) {
    prefetchProduct(productId);
    setSelectedProductId(null);
    setEditingProductId(productId);
    setIsAddProductOpen(true);
  }

  function handleAddOpen() {
    setEditingProductId(null);
    setIsAddProductOpen(true);
  }

  function handleDelete(productId: string) {
    setConfirmDeleteProductId(productId);
  }

  function confirmDelete() {
    if (!confirmDeleteProductId) return;
    const productId = confirmDeleteProductId;
    setConfirmDeleteProductId(null);
    setDeletingProductId(productId);
    startDeleteTransition(async () => {
      const result = await deleteProductAction(productId);
      if (result.status === "success") {
        toast.success(result.message);
        if (selectedProductId === productId) {
          setSelectedProductId(null);
        }
        router.refresh();
        await queryClient.invalidateQueries({ queryKey: ["inventory", "product-details", productId] });
      } else {
        toast.error(result.message);
      }
      setDeletingProductId(null);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">Products Catalog</h2>
          <p className="text-sm text-stone-500">Manage your store&apos;s inventory and stock levels.</p>
        </div>
        <button
          onClick={handleAddOpen}
          className="flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      <ProductList
        products={products}
        onProductClick={handleProductClick}
        onProductHover={prefetchProduct}
        onProductEdit={handleProductEdit}
        onProductDelete={handleDelete}
        deletingProductId={isDeleting ? deletingProductId : null}
      />

      {isAddProductOpen ? (
        <AddProductModal
          open={isAddProductOpen}
          productId={editingProductId}
          mode={editingProductId ? "edit" : "create"}
          onClose={() => {
            setIsAddProductOpen(false);
            setEditingProductId(null);
          }}
          categories={categories}
          brands={brands}
        />
      ) : null}

      <ProductDetailsDrawer
        productId={selectedProductId}
        onEdit={handleProductEdit}
        onDelete={handleDelete}
        onClose={() => setSelectedProductId(null)}
      />

      {confirmDeleteProductId ? (
        <DeleteConfirmationDialog
          isDeleting={isDeleting && deletingProductId === confirmDeleteProductId}
          onCancel={() => setConfirmDeleteProductId(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}

function DeleteConfirmationDialog({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <h3 className="text-lg font-semibold text-stone-950">Delete Product</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          This will remove the product and its related inventory records. This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
