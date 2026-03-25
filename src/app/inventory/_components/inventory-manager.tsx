"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { Brand, Category, Product } from "@/lib/types/inventory";
import { ProductList } from "./product-list";
import { AddProductModal } from "./add-product-modal";
import { ProductDetailsDrawer } from "./product-details-drawer";
import { RecordSaleModal } from "./record-sale-modal";
import { AddStockModal } from "./add-stock-modal";
import { productDetailsQueryOptions } from "../queries";
import { deleteProductAction } from "../actions";
import { InventoryTopBar } from "./inventory-top-bar";

export function InventoryManager({
  products,
  categories,
  brands,
}: {
  products: (Product & {
    total_quantity: number;
    brand?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
  })[];
  categories: Category[];
  brands: Brand[];
}) {
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [saleProductId, setSaleProductId] = useState<string | null>(null);
  const [stockProductId, setStockProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "MOBILE" | "SERIALIZED" | "QUANTITY_BASED">("ALL");
  const [showHeader, setShowHeader] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onScroll = () => {
      const atTop = window.scrollY <= 4;
      setShowHeader(atTop);
      setShowScrollTop(window.scrollY > 700);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  function handleRecordSale(productId: string) {
    prefetchProduct(productId);
    setSaleProductId(productId);
  }

  function handleDelete(productId: string) {
    setConfirmDeleteProductId(productId);
  }

  function handleAddStock(productId: string) {
    prefetchProduct(productId);
    setStockProductId(productId);
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
      <div
        className={`fixed inset-x-0 top-0 z-40 transition-transform duration-300 ${
          showHeader ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto w-full max-w-lg border-b border-stone-200 bg-[#f7f8fb]/95 px-3 py-3 backdrop-blur">
          <InventoryTopBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onBack={() => router.back()}
            onAdd={handleAddOpen}
          />
        </div>
      </div>

      <div className="h-14" />

      <ProductList
        products={products}
        activeTab={activeTab}
        searchQuery={searchQuery}
        onActiveTabChange={setActiveTab}
        onProductClick={handleProductClick}
        onProductHover={prefetchProduct}
        onProductEdit={handleProductEdit}
        onProductDelete={handleDelete}
        onAddStock={handleAddStock}
        deletingProductId={isDeleting ? deletingProductId : null}
      />

      {isAddProductOpen ? (
        <AddProductModal
          open={isAddProductOpen}
          productId={editingProductId}
          mode={editingProductId ? "edit" : "create"}
          onSaved={async () => {
            router.refresh();
          }}
          onClose={() => {
            setIsAddProductOpen(false);
            setEditingProductId(null);
          }}
          categories={categories}
          brands={brands}
          products={products}
        />
      ) : null}

      <ProductDetailsDrawer
        productId={selectedProductId}
        onEdit={handleProductEdit}
        onDelete={handleDelete}
        onRecordSale={handleRecordSale}
        onClose={() => setSelectedProductId(null)}
      />

      <RecordSaleModal
        key={saleProductId ?? "sale-idle"}
        open={Boolean(saleProductId)}
        productId={saleProductId}
        onClose={() => setSaleProductId(null)}
        onRecorded={async () => {
          router.refresh();
          if (saleProductId) {
            await queryClient.invalidateQueries({ queryKey: ["inventory", "product-details", saleProductId] });
          }
        }}
      />

      <AddStockModal
        key={stockProductId ?? "stock-idle"}
        open={Boolean(stockProductId)}
        productId={stockProductId}
        onClose={() => setStockProductId(null)}
        onSaved={async () => {
          router.refresh();
          if (stockProductId) {
            await queryClient.invalidateQueries({ queryKey: ["inventory", "product-details", stockProductId] });
          }
        }}
      />

      {confirmDeleteProductId ? (
        <DeleteConfirmationDialog
          isDeleting={isDeleting && deletingProductId === confirmDeleteProductId}
          onCancel={() => setConfirmDeleteProductId(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-stone-950 text-white shadow-lg"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
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
