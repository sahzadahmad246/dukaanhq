"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, PackageOpen } from "lucide-react";

import { Product } from "@/lib/types/inventory";
import { matchesSearch } from "../inventory-utils";
import { InventoryTopBar } from "./inventory-top-bar";
import { ProductDetailsDrawer } from "./product-details-drawer";

type InventoryProduct = Product & {
  total_quantity: number;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  variants?: Array<{
    quantity: number | null;
    name: string | null;
    color: string | null;
    storage_label: string | null;
  }> | null;
};

export function InventoryGroupView({
  title,
  products,
  userAvatarUrl,
  avatarFallback,
}: {
  title: string;
  products: InventoryProduct[];
  userAvatarUrl?: string | null;
  avatarFallback?: string;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [showHeader, setShowHeader] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

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

  const filters = useMemo(() => {
    const values = new Set<string>();
    let hasInStock = false;
    let hasLowStock = false;
    let hasBudget = false;
    let hasMidRange = false;
    let hasPremium = false;

    for (const product of products) {
      if (product.total_quantity > 0) hasInStock = true;
      if (product.total_quantity <= product.low_stock_threshold) hasLowStock = true;
      if (product.base_selling_price < 10000) hasBudget = true;
      if (product.base_selling_price >= 10000 && product.base_selling_price < 30000) hasMidRange = true;
      if (product.base_selling_price >= 30000) hasPremium = true;
      if (product.brand?.name?.trim()) values.add(product.brand.name.trim());
      if (product.category?.name?.trim()) values.add(product.category.name.trim());
      for (const variant of product.variants ?? []) {
        if (variant.storage_label?.trim()) values.add(variant.storage_label.trim());
        if (variant.color?.trim()) values.add(variant.color.trim());
      }
    }

    return [
      "All",
      ...(hasInStock ? ["In Stock"] : []),
      ...(hasLowStock ? ["Low Stock"] : []),
      ...(hasBudget ? ["Under 10k"] : []),
      ...(hasMidRange ? ["10k-30k"] : []),
      ...(hasPremium ? ["30k+"] : []),
      ...Array.from(values).sort((a, b) => a.localeCompare(b)),
    ];
  }, [products]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const searchMatched = matchesSearch(
        [
          product.name,
          product.brand?.name ?? "",
          product.category?.name ?? "",
          ...(product.variants ?? []).flatMap((variant) => [variant.storage_label ?? "", variant.color ?? "", variant.name ?? ""]),
        ].join(" "),
        searchQuery
      );

      if (!searchMatched) return false;
      if (activeFilter === "All") return true;
      if (activeFilter === "In Stock") return product.total_quantity > 0;
      if (activeFilter === "Low Stock") return product.total_quantity <= product.low_stock_threshold;
      if (activeFilter === "Under 10k") return product.base_selling_price < 10000;
      if (activeFilter === "10k-30k") {
        return product.base_selling_price >= 10000 && product.base_selling_price < 30000;
      }
      if (activeFilter === "30k+") return product.base_selling_price >= 30000;
      if (product.brand?.name === activeFilter) return true;
      if (product.category?.name === activeFilter) return true;

      return (product.variants ?? []).some(
        (variant) => variant.storage_label === activeFilter || variant.color === activeFilter
      );
    });
  }, [activeFilter, products, searchQuery]);

  return (
    <>
      <div
        className={`fixed inset-x-0 top-0 z-40 transition-transform duration-300 ${
          showHeader ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto w-full max-w-3xl border-b border-stone-200 bg-[#f7f8fb]/95 px-3 py-3 backdrop-blur">
          <InventoryTopBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onBack={() => router.back()}
            userAvatarUrl={userAvatarUrl}
            avatarFallback={avatarFallback}
          />
          {filters.length > 1 ? (
            <div className="scrollbar-hidden -mx-1 mt-3 overflow-x-auto px-1">
              <div className="flex min-w-max gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      activeFilter === filter ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={filters.length > 1 ? "h-28" : "h-14"} />

      <section className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">{title}</h1>
          <p className="text-sm text-stone-500">
            {visibleProducts.length} product{visibleProducts.length === 1 ? "" : "s"}
          </p>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
            No products matched this search or filter.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((product) => (
              <article
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
                className="cursor-pointer overflow-hidden rounded-[1.2rem] border border-stone-200 bg-white shadow-sm"
              >
                <div className="relative aspect-square overflow-hidden bg-stone-100">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-stone-400">
                      <PackageOpen className="h-10 w-10" />
                    </div>
                  )}
                  {product.category?.name ? (
                    <span className="absolute left-2 top-2 inline-flex h-8 items-center rounded-full bg-white/90 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">
                      {product.category.name}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3 p-3">
                  <div className="truncate text-sm font-semibold text-stone-950">{product.name}</div>
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
              </article>
            ))}
          </div>
        )}
      </section>

      <ProductDetailsDrawer productId={selectedProductId} onClose={() => setSelectedProductId(null)} />

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
