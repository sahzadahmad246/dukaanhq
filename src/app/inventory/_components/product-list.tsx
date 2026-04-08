"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LoaderCircle,
  Package,
  PackagePlus,
  AlertTriangle,
} from "lucide-react";

import { Brand, Category, Product } from "@/lib/types/inventory";
import { buildVariantLabel } from "@/lib/inventory-labels";
import { matchesSearch } from "../inventory-utils";
import { ProductActionsMenu } from "./product-actions-menu";

export type InventoryProduct = Product & {
  total_quantity: number;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  variants?: Array<{
    id: string;
    quantity: number | null;
    name: string | null;
    color: string | null;
    storage_label: string | null;
    purchase_price_override: number | null;
    selling_price_override: number | null;
  }> | null;
  has_damaged_activity?: boolean;
  has_return_activity?: boolean;
  damaged_count?: number;
  returned_count?: number;
};

type SharedCardProps = {
  deletingProductId?: string | null;
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
  onAddStock?: (id: string) => void;
  onRecordSale?: (id: string) => void;
  onAdjustStock?: (id: string) => void;
  stockThreshold?: number;
};

export function ProductList({
  products,
  categories,
  brands,
  activeTab,
  searchQuery,
  onActiveTabChange,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  onAddStock,
  onRecordSale,
  onAdjustStock,
  deletingProductId,
  stockThreshold = 5,
}: {
  products: InventoryProduct[];
  categories: Category[];
  brands: Brand[];
  activeTab: string;
  searchQuery: string;
  onActiveTabChange: (value: string) => void;
} & SharedCardProps) {
  
  const tabs = useMemo(() => {
    return [
      { id: "ALL", label: "All Products" },
      ...categories.map(c => ({ id: `CATEGORY_${c.id}`, label: c.name })),
      ...brands.map(b => ({ id: `BRAND_${b.id}`, label: b.name })),
    ];
  }, [categories, brands]);

  const tabFilteredProducts = useMemo(() => {
    if (activeTab === "ALL") return products;
    if (activeTab.startsWith("CATEGORY_")) {
      const catId = activeTab.replace("CATEGORY_", "");
      return products.filter(p => p.category_id === catId);
    }
    if (activeTab.startsWith("BRAND_")) {
      const brandId = activeTab.replace("BRAND_", "");
      return products.filter(p => p.brand_id === brandId);
    }
    return products;
  }, [activeTab, products]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return tabFilteredProducts.filter((p) =>
      matchesSearch(
        [p.name, p.brand?.name ?? "", p.category?.name ?? ""].join(" "),
        searchQuery
      )
    );
  }, [searchQuery, tabFilteredProducts]);

  const categorySections = useMemo(
    () => buildSections({ products: tabFilteredProducts, sectionPrefix: "category", getKey: (p) => p.category?.name?.trim() || "Uncategorized", getTitle: (v) => v }),
    [tabFilteredProducts]
  );

  const sharedProps: SharedCardProps = { deletingProductId, onProductClick, onProductHover, onProductEdit, onProductDelete, onAddStock, onRecordSale, onAdjustStock, stockThreshold };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-14 text-center shadow-sm">
        <Package className="h-8 w-8 text-stone-300" />
        <p className="text-sm text-stone-400">No products found. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      {/* Tab Bar */}
      <div className="scrollbar-hidden -mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1.5 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActiveTabChange(tab.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${activeTab === tab.id
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {searchQuery.trim() ? (
        <section className="space-y-2">
          {searchResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
              No matching products found.
            </div>
          ) : (
            <div className="overflow-visible rounded-2xl border border-stone-100 bg-white shadow-sm">
              {searchResults.map((product, index) => (
                <ProductCard key={product.id} product={product} isLast={index === searchResults.length - 1} {...sharedProps} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-6">
          {categorySections.map((section) => (
            <section key={section.key} className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-400 px-1">{section.title}</h4>
              <div className="overflow-visible rounded-2xl border border-stone-100 bg-white shadow-sm">
                {section.products.map((product, index) => (
                  <ProductCard key={product.id} product={product} isLast={index === section.products.length - 1} {...sharedProps} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSections({
  products,
  sectionPrefix,
  getKey,
  getTitle,
}: {
  products: InventoryProduct[];
  sectionPrefix: string;
  getKey: (product: InventoryProduct) => string;
  getTitle: (value: string) => string;
}) {
  const grouped = new Map<string, InventoryProduct[]>();
  for (const product of products) {
    const key = getKey(product);
    const list = grouped.get(key) ?? [];
    list.push(product);
    grouped.set(key, list);
  }
  return Array.from(grouped.entries())
    .map(([key, items]) => ({
      key: `${sectionPrefix}-${key.toLowerCase().replace(/\s+/g, "-")}`,
      title: getTitle(key),
      products: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function ProductCard({
  product,
  isLast = false,
  deletingProductId,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  onAddStock,
  onRecordSale,
  onAdjustStock,
  stockThreshold = 5,
}: {
  product: InventoryProduct;
  isLast?: boolean;
} & SharedCardProps) {
  const hasMultipleVariants = (product.variants?.length ?? 0) > 1;
  const alerts = useMemo(() => {
    const nextAlerts: Array<{ id: string; kind: "out" | "low"; message: string; actionLabel: string }> = [];

    if (product.total_quantity === 0) {
      nextAlerts.push({
        id: "total-out",
        kind: "out",
        message: "Out of stock — unavailable for sale",
        actionLabel: "Add Stock",
      });
    } else if (product.total_quantity <= stockThreshold) {
      nextAlerts.push({
        id: "total-low",
        kind: "low",
        message: `Only ${product.total_quantity} left — running low`,
        actionLabel: "Refill",
      });
    }

    if (hasMultipleVariants) {
      for (const variant of product.variants ?? []) {
        const variantQuantity = Number(variant.quantity ?? 0);
        const label = buildVariantLabel(variant) ?? product.name;

        if (variantQuantity === 0) {
          nextAlerts.push({
            id: `variant-out-${variant.id}`,
            kind: "out",
            message: `${label} is out of stock`,
            actionLabel: "Add Stock",
          });
        } else if (variantQuantity <= stockThreshold) {
          nextAlerts.push({
            id: `variant-low-${variant.id}`,
            kind: "low",
            message: `${label} has only ${variantQuantity} left`,
            actionLabel: "Refill",
          });
        }
      }
    }

    return nextAlerts;
  }, [hasMultipleVariants, product.name, product.total_quantity, product.variants, stockThreshold]);

  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const alertSignature = `${product.id}:${alerts.map((alert) => alert.id).join("|") || "none"}`;

  useEffect(() => {
    if (alerts.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveAlertIndex((current) => (current + 1) % alerts.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [alertSignature, alerts.length]);

  const activeAlert = alerts[activeAlertIndex] ?? null;
  const hasOutAlert = alerts.some((alert) => alert.kind === "out");
  const hasLowAlert = alerts.some((alert) => alert.kind === "low");
  const isOutOfStock = product.total_quantity === 0;
  const isLowStock = !isOutOfStock && product.total_quantity <= stockThreshold;
  
  const variantsWithPrice = product.variants?.filter((v) => v.selling_price_override !== null && v.selling_price_override !== undefined) || [];
  const minPrice = variantsWithPrice.length > 0
    ? Math.min(...variantsWithPrice.map((v) => Number(v.selling_price_override)))
    : Number(product.base_selling_price ?? 0);
  
  const displayPriceLabel = variantsWithPrice.length > 0 ? "Starting from" : "Price";

  return (
    <div
      className={`group relative ${!isLast ? "border-b border-stone-100" : ""} bg-white`}
    >
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-0 h-full w-[3px] rounded-r-sm transition-all duration-200 ${hasOutAlert
            ? "bg-red-300"
            : hasLowAlert
              ? "bg-amber-400"
              : "bg-transparent group-hover:bg-stone-300"
          }`}
      />

      {/* Main clickable row */}
      <div
        onClick={() => !isOutOfStock && onProductClick?.(product.id)}
        onMouseEnter={() => onProductHover?.(product.id)}
        onFocus={() => onProductHover?.(product.id)}
        onTouchStart={() => onProductHover?.(product.id)}
        className={`flex items-start gap-3 px-4 py-3.5 ${isOutOfStock ? "cursor-default" : "cursor-pointer hover:bg-stone-50/70"
          } transition-colors duration-150`}
      >
        {/* Info block */}
        <div className={`min-w-0 flex-1 transition-opacity duration-200 ${isOutOfStock ? "opacity-35" : ""}`}>
          {/* Brand / Category */}
          <p className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {product.brand?.name || product.category?.name || "—"}
          </p>

          {/* Name */}
          <p className="truncate text-sm font-semibold leading-snug text-stone-800">
            {product.name}
          </p>

          {/* Stats row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Stock pill */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${isOutOfStock
                  ? "bg-red-100 text-red-500"
                  : isLowStock
                    ? "bg-amber-50 text-amber-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOutOfStock ? "bg-red-400" : isLowStock ? "bg-amber-400" : "bg-emerald-400"
                  }`}
              />
              {product.total_quantity} in stock
            </span>

            <span className="text-stone-200 select-none">·</span>

            {/* Price */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-300">{displayPriceLabel}</span>
              <span className="text-xs font-bold tabular-nums text-stone-700">
                ₹{minPrice.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 self-start pt-0.5" onClick={(e) => e.stopPropagation()}>
          {deletingProductId === product.id ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-stone-400" />
            </div>
          ) : (
            <div className={`transition-opacity duration-150 ${isOutOfStock ? "opacity-60" : "opacity-100"}`}>
              <ProductActionsMenu
                compact
                onEdit={() => onProductEdit?.(product.id)}
                onDelete={() => onProductDelete?.(product.id)}
                onRecordSale={() => onRecordSale?.(product.id)}
                onAdjustStock={() => onAdjustStock?.(product.id)}
              />
            </div>
          )}
        </div>
      </div>

      {activeAlert ? (
        <div
          key={alertSignature}
          className={`mx-3 mb-3 rounded-xl px-3 py-2 transition-all duration-300 ${
            activeAlert.kind === "out" ? "border border-red-100 bg-red-50" : "border border-amber-100 bg-amber-50/70"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {activeAlert.kind === "out" ? (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                  <span className="text-[10px] font-black leading-none">✕</span>
                </div>
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <p className={`truncate text-[11px] font-semibold ${activeAlert.kind === "out" ? "text-red-600" : "text-amber-700"}`}>
                {activeAlert.message}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddStock?.(product.id);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition-all duration-150 active:scale-95 ${
                activeAlert.kind === "out"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
              }`}
            >
              <PackagePlus className="h-3 w-3" />
              {activeAlert.actionLabel}
            </button>
          </div>

          {alerts.length > 1 ? (
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {alerts.map((alert, index) => (
                <button
                  key={alert.id}
                  type="button"
                  aria-label={`Show stock alert ${index + 1}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveAlertIndex(index);
                  }}
                  className={`h-1.5 rounded-full transition-all ${index === activeAlertIndex ? "w-4 bg-stone-700/70" : "w-1.5 bg-stone-300"}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
