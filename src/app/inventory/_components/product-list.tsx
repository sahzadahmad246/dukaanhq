"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, LoaderCircle, PackageOpen } from "lucide-react";

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
  { id: "SERIALIZED", label: "Serialized Products" },
  { id: "QUANTITY_BASED", label: "Qty Based Products" },
];

export function ProductList({
  products,
  activeTab,
  searchQuery,
  onActiveTabChange,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
  deletingProductId,
}: {
  products: InventoryProduct[];
  activeTab: ProductTab;
  searchQuery: string;
  onActiveTabChange: (value: ProductTab) => void;
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
  deletingProductId?: string | null;
}) {
  const tabFilteredProducts = useMemo(() => {
    if (activeTab === "ALL") return products;
    return products.filter((product) => product.product_kind === activeTab);
  }, [activeTab, products]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return tabFilteredProducts.filter((product) =>
      matchesSearch(
        [
          product.name,
          product.brand?.name ?? "",
          product.category?.name ?? "",
          product.product_kind === "MOBILE"
            ? "mobile phones"
            : product.product_kind === "SERIALIZED"
              ? "serialized products"
              : "quantity based products",
        ].join(" "),
        searchQuery
      )
    );
  }, [searchQuery, tabFilteredProducts]);

  const profileSections = useMemo(() => {
    if (activeTab !== "ALL") return [];
    return [
      { key: "profile-mobile", title: "Mobile Phones", products: products.filter((product) => product.product_kind === "MOBILE") },
      { key: "profile-serialized", title: "Serialized Products", products: products.filter((product) => product.product_kind === "SERIALIZED") },
      { key: "profile-qty", title: "Qty Based Products", products: products.filter((product) => product.product_kind === "QUANTITY_BASED") },
    ].filter((section) => section.products.length > 0);
  }, [activeTab, products]);

  const brandSections = useMemo(
    () =>
      buildSections({
        products: tabFilteredProducts,
        sectionPrefix: "brand",
        getKey: (product) => product.brand?.name?.trim() || "Unbranded",
        getTitle: (value) => value,
      }),
    [tabFilteredProducts]
  );

  const categorySections = useMemo(
    () =>
      buildSections({
        products: tabFilteredProducts,
        sectionPrefix: "category",
        getKey: (product) => product.category?.name?.trim() || "Uncategorized",
        getTitle: (value) => value,
      }),
    [tabFilteredProducts]
  );

  if (products.length === 0) {
    return (
      <div className="rounded-[1.7rem] border border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-500 shadow-sm">
        No products found in inventory. Add one to get started.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="scrollbar-hidden -mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActiveTabChange(tab.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeTab === tab.id ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {searchQuery.trim() ? (
        <section className="space-y-3">
          {searchResults.length === 0 ? (
            <div className="rounded-[1.4rem] border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
              No matching products found in this tab.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {searchResults.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  layout="grid"
                  deletingProductId={deletingProductId}
                  onProductClick={onProductClick}
                  onProductHover={onProductHover}
                  onProductEdit={onProductEdit}
                  onProductDelete={onProductDelete}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          {profileSections.map((section) => (
            <CatalogSection
              key={section.key}
              title={section.title}
              groupHref={`/inventory/view/profile/${slugifySegment(section.title)}`}
              products={section.products}
              deletingProductId={deletingProductId}
              onProductClick={onProductClick}
              onProductHover={onProductHover}
              onProductEdit={onProductEdit}
              onProductDelete={onProductDelete}
            />
          ))}

          {brandSections.length > 0 ? (
            <div className="space-y-4">
              {brandSections.map((section) => (
                <CatalogSection
                  key={section.key}
                  title={section.title}
                  groupHref={`/inventory/view/brand/${slugifySegment(section.title)}`}
                  products={section.products}
                  deletingProductId={deletingProductId}
                  onProductClick={onProductClick}
                  onProductHover={onProductHover}
                  onProductEdit={onProductEdit}
                  onProductDelete={onProductDelete}
                />
              ))}
            </div>
          ) : null}

          {categorySections.length > 0 ? (
            <div className="space-y-4">
              {categorySections.map((section) => (
                <CatalogSection
                  key={section.key}
                  title={section.title}
                  groupHref={`/inventory/view/category/${slugifySegment(section.title)}`}
                  products={section.products}
                  deletingProductId={deletingProductId}
                  onProductClick={onProductClick}
                  onProductHover={onProductHover}
                  onProductEdit={onProductEdit}
                  onProductDelete={onProductDelete}
                />
              ))}
            </div>
          ) : null}
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
  deletingProductId,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
}: {
  title: string;
  groupHref: string;
  products: InventoryProduct[];
  deletingProductId?: string | null;
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
}) {
  const previewProducts = products.slice(0, 6);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-stone-950">{title}</h4>
        <Link href={groupHref} className="inline-flex items-center gap-1 text-xs font-medium text-stone-600">
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {previewProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            layout="grid"
            deletingProductId={deletingProductId}
            onProductClick={onProductClick}
            onProductHover={onProductHover}
            onProductEdit={onProductEdit}
            onProductDelete={onProductDelete}
          />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  layout,
  deletingProductId,
  onProductClick,
  onProductHover,
  onProductEdit,
  onProductDelete,
}: {
  product: InventoryProduct;
  layout: "carousel" | "grid";
  deletingProductId?: string | null;
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string) => void;
  onProductEdit?: (id: string) => void;
  onProductDelete?: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onProductClick?.(product.id)}
      onMouseEnter={() => onProductHover?.(product.id)}
      onFocus={() => onProductHover?.(product.id)}
      onTouchStart={() => onProductHover?.(product.id)}
      className={`group min-w-0 cursor-pointer overflow-hidden rounded-[1.2rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        layout === "grid" ? "h-full" : ""
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-stone-100">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <PackageOpen className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
          {product.category?.name ? (
            <span className="inline-flex h-8 items-center rounded-full bg-white/90 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">
              {product.category.name}
            </span>
          ) : null}
          <div onClick={(event) => event.stopPropagation()}>
            {deletingProductId === product.id ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <ProductActionsMenu
                compact
                onEdit={() => onProductEdit?.(product.id)}
                onDelete={() => onProductDelete?.(product.id)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-stone-950">{product.name}</div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-stone-500">{product.brand?.name || "Brand"}</p>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Stock</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-950">{product.total_quantity}</p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Purchase</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-950">₹{product.base_purchase_price}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Selling</p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-600">₹{product.base_selling_price}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
