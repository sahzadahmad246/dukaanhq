"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ChevronRight,
  LoaderCircle,
  TrendingUp,
  Package,
  PackagePlus,
  AlertTriangle,
} from "lucide-react";

import { Product } from "@/lib/types/inventory";
import { matchesSearch, slugifySegment } from "../inventory-utils";
import { ProductActionsMenu } from "./product-actions-menu";

type InventoryProduct = Product & {
  total_quantity: number;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
};

type ProductTab = "ALL" | "MOBILE" | "SERIALIZED" | "QUANTITY_BASED";

const tabs: Array<{ id: ProductTab; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "MOBILE", label: "Mobile" },
  { id: "SERIALIZED", label: "Serialized" },
  { id: "QUANTITY_BASED", label: "Qty Based" },
];

type SharedCardProps = {
  deletingProductId?: string | null;
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
  onAddStock?: (id: string) => void;
  stockThreshold?: number;
};

export function ProductList({
  products,
  activeTab,
  searchQuery,
  onActiveTabChange,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  onAddStock,
  deletingProductId,
  stockThreshold = 5,
}: {
  products: InventoryProduct[];
  activeTab: ProductTab;
  searchQuery: string;
  onActiveTabChange: (value: ProductTab) => void;
} & SharedCardProps & {
  onActiveTabChange: (value: ProductTab) => void;
}) {
  const tabFilteredProducts = useMemo(() => {
    if (activeTab === "ALL") return products;
    return products.filter((p) => p.product_kind === activeTab);
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

  const profileSections = useMemo(() => {
    if (activeTab !== "ALL") return [];
    return [
      { key: "profile-mobile", title: "Mobile Phones", products: products.filter((p) => p.product_kind === "MOBILE") },
      { key: "profile-serialized", title: "Serialized Products", products: products.filter((p) => p.product_kind === "SERIALIZED") },
      { key: "profile-qty", title: "Qty Based Products", products: products.filter((p) => p.product_kind === "QUANTITY_BASED") },
    ].filter((s) => s.products.length > 0);
  }, [activeTab, products]);

  const brandSections = useMemo(
    () => buildSections({ products: tabFilteredProducts, sectionPrefix: "brand", getKey: (p) => p.brand?.name?.trim() || "Unbranded", getTitle: (v) => v }),
    [tabFilteredProducts]
  );

  const categorySections = useMemo(
    () => buildSections({ products: tabFilteredProducts, sectionPrefix: "category", getKey: (p) => p.category?.name?.trim() || "Uncategorized", getTitle: (v) => v }),
    [tabFilteredProducts]
  );

  const sharedProps: SharedCardProps = { deletingProductId, onProductClick, onProductHover, onProductEdit, onProductDelete, onAddStock, stockThreshold };

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
        <div className="flex min-w-max gap-1.5">
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
          {profileSections.map((section) => (
            <CatalogSection key={section.key} title={section.title} groupHref={`/inventory/view/profile/${slugifySegment(section.title)}`} products={section.products} {...sharedProps} />
          ))}
          {brandSections.length > 0 && (
            <div className="space-y-4">
              {brandSections.map((section) => (
                <CatalogSection key={section.key} title={section.title} groupHref={`/inventory/view/brand/${slugifySegment(section.title)}`} products={section.products} {...sharedProps} />
              ))}
            </div>
          )}
          {categorySections.length > 0 && (
            <div className="space-y-4">
              {categorySections.map((section) => (
                <CatalogSection key={section.key} title={section.title} groupHref={`/inventory/view/category/${slugifySegment(section.title)}`} products={section.products} {...sharedProps} />
              ))}
            </div>
          )}
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

function CatalogSection({
  title,
  groupHref,
  products,
  ...sharedProps
}: {
  title: string;
  groupHref: string;
  products: InventoryProduct[];
} & SharedCardProps) {
  const previewProducts = products.slice(0, 6);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{title}</h4>
        <Link href={groupHref} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-stone-400 transition hover:text-stone-700">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="overflow-visible rounded-2xl border border-stone-100 bg-white shadow-sm">
        {previewProducts.map((product, index) => (
          <ProductCard key={product.id} product={product} isLast={index === previewProducts.length - 1} {...sharedProps} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  isLast = false,
  deletingProductId,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  onAddStock,
  stockThreshold = 5,
}: {
  product: InventoryProduct;
  isLast?: boolean;
} & SharedCardProps) {
  const isOutOfStock = product.total_quantity === 0;
  const isLowStock = !isOutOfStock && product.total_quantity <= stockThreshold;

  const marginPct =
    product.base_purchase_price > 0
      ? Math.round(((product.base_selling_price - product.base_purchase_price) / product.base_purchase_price) * 100)
      : 0;

  return (
    <div
      className={`group relative ${!isLast ? "border-b border-stone-100" : ""} ${isOutOfStock ? "bg-stone-50" : "bg-white"
        }`}
    >
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-0 h-full w-[3px] rounded-r-sm transition-all duration-200 ${isOutOfStock
            ? "bg-red-300"
            : isLowStock
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
        {/* Info block — faded when OOS */}
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

            {/* Cost */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-300">Cost</span>
              <span className="text-xs font-semibold tabular-nums text-stone-500">
                ₹{product.base_purchase_price.toLocaleString("en-IN")}
              </span>
            </div>

            {/* MRP */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-300">MRP</span>
              <span className="text-xs font-bold tabular-nums text-stone-700">
                ₹{product.base_selling_price.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Margin */}
            {marginPct > 0 && !isOutOfStock && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                <TrendingUp className="h-2.5 w-2.5" />
                {marginPct}%
              </span>
            )}
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
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Out of stock notice ── */}
      {isOutOfStock && (
        <div className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
              <span className="text-[10px] font-black leading-none">✕</span>
            </div>
            <p className="truncate text-[11px] font-semibold text-red-600">
              Out of stock — unavailable for sale
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddStock?.(product.id);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all duration-150 hover:bg-red-700 active:scale-95"
          >
            <PackagePlus className="h-3 w-3" />
            Add Stock
          </button>
        </div>
      )}

      {/* ── Low stock notice ── */}
      {isLowStock && (
        <div className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="truncate text-[11px] font-semibold text-amber-700">
              Only {product.total_quantity} left — running low
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddStock?.(product.id);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-700 shadow-sm transition-all duration-150 hover:bg-amber-50 active:scale-95"
          >
            <PackagePlus className="h-3 w-3" />
            Refill
          </button>
        </div>
      )}
    </div>
  );
}
