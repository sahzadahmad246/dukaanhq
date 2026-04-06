"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, isValid } from "date-fns";
import {
  Wallet,
  TrendingUp,
  Receipt,
  Package,
  Archive,
  Users,
  AlertTriangle,
  ShoppingBag,
  CalendarDays,
  ArrowRight,
  Plus,
  PhoneCall,
  User,
} from "lucide-react";

import type { DashboardStats, RecentInvoice, RecentProduct } from "../load-dashboard-data";
import type { Product } from "@/lib/types/inventory";
import type { Brand, Category } from "@/lib/types/inventory";
import { AddBillModal } from "@/app/billing/_components/add-bill-modal";
import { AddProductModal } from "@/app/inventory/_components/add-product-modal";

type ProductSummary = Product & {
  total_quantity: number;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  variants?: Array<{
    id: string;
    quantity: number | null;
    name: string | null;
    color: string | null;
    storage_label: string | null;
  }> | null;
};

function formatCurrency(n: number) {
  const value = Number.isFinite(n) ? n : 0;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${value.toFixed(0)}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}

function formatSafeShortDate(value: string | null | undefined) {
  if (!value) return "--";
  const parsed = new Date(value);
  return isValid(parsed) ? format(parsed, "dd MMM") : "--";
}

function formatSafeAmount(value: number | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(0) : "0";
}

const STAT_CARDS: Array<{
  key: keyof DashboardStats;
  label: string;
  icon: typeof Wallet;
  bg: string;
  border: string;
  color: string;
  blobColor: string;
  format?: "currency";
}> = [
  { key: "totalRevenue", label: "Total Revenue", icon: Wallet, bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a", blobColor: "#22c55e", format: "currency" },
  { key: "monthRevenue", label: "This Month", icon: CalendarDays, bg: "#f5f3ff", border: "#ddd6fe", color: "#7c3aed", blobColor: "#8b5cf6", format: "currency" },
  { key: "totalProducts", label: "Products", icon: Package, bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb", blobColor: "#3b82f6" },
  { key: "inStockItems", label: "In Stock", icon: Archive, bg: "#ecfdf5", border: "#a7f3d0", color: "#059669", blobColor: "#10b981" },
  { key: "totalInvoices", label: "Total Bills", icon: Receipt, bg: "#fff7ed", border: "#fed7aa", color: "#ea580c", blobColor: "#f97316" },
  { key: "totalCustomers", label: "Customers", icon: Users, bg: "#fdf2f8", border: "#fbcfe8", color: "#db2777", blobColor: "#ec4899" },
];

const CARD_ACCENTS = [
  { top: "#f97316", tint: "#fff7ed", textAccent: "#c2410c", dotBg: "#ffedd5" },
  { top: "#3b82f6", tint: "#eff6ff", textAccent: "#1d4ed8", dotBg: "#dbeafe" },
  { top: "#10b981", tint: "#f0fdf4", textAccent: "#047857", dotBg: "#d1fae5" },
  { top: "#8b5cf6", tint: "#f5f3ff", textAccent: "#6d28d9", dotBg: "#ede9fe" },
  { top: "#ec4899", tint: "#fdf2f8", textAccent: "#be185d", dotBg: "#fce7f3" },
];

export function DashboardHome({
  ownerName,
  shopLogoUrl,
  stats,
  recentInvoices,
  recentProducts,
  products,
  categories,
  brands,
}: {
  ownerName: string;
  shopLogoUrl: string | null;
  stats: DashboardStats;
  recentInvoices: RecentInvoice[];
  recentProducts: RecentProduct[];
  products: ProductSummary[];
  categories: Category[];
  brands: Brand[];
}) {
  const router = useRouter();
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');

        .dash-root {
          font-family: 'Nunito', system-ui, sans-serif;
        }

        .dash-stat {
          border-radius: 18px;
          padding: 14px 12px 12px;
          position: relative;
          overflow: hidden;
        }
        .dash-stat-label {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 7px;
        }
        .dash-stat-value {
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.03em;
          color: #18181b;
        }
        .dash-stat-value-sm { font-size: 16px; }
        .dash-stat-blob {
          position: absolute;
          border-radius: 50%;
          bottom: -12px; right: -12px;
          width: 44px; height: 44px;
          opacity: 0.3;
        }

        .dash-section-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #a1a1aa;
          margin-bottom: 10px;
          padding-left: 2px;
        }

        .dash-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 50px;
          font-size: 13px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: transform 0.13s, box-shadow 0.13s;
          font-family: inherit;
          white-space: nowrap;
        }
        .dash-chip:active { transform: scale(0.96); }

        .dash-summary {
          border-radius: 18px;
          padding: 16px 14px;
          background: #ffffff;
          border: 1.5px solid #e4e4e7;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.05);
        }

        .dash-card {
          background: #ffffff;
          border-radius: 20px;
          padding: 15px 14px 13px;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.17s ease, box-shadow 0.17s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.05);
        }
        .dash-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.09), 0 12px 30px rgba(0,0,0,0.07);
        }
        .dash-card:active { transform: translateY(0); }

        .dash-card-topbar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 3.5px;
          border-radius: 20px 0 0 20px;
        }

        .dash-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .dash-product-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.05);
          transition: transform 0.15s;
        }
        .dash-product-card:active { transform: scale(0.98); }

        .dash-alert {
          border-radius: 16px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
        }
      `}</style>

      <div className="dash-root -mx-3 px-2">
        {/* Greeting — same row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "10px 2px 18px" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#a1a1aa" }}>
            {getGreeting()}
          </span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#18181b", letterSpacing: "-0.02em" }}>
            {ownerName}
          </span>
        </div>

        {/* Low Stock Alert */}
        {stats.lowStockProducts > 0 && (
          <div className="dash-alert" style={{ background: "#fef3c7", border: "1.5px solid #fcd34d", color: "#92400e", marginBottom: 14 }}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{stats.lowStockProducts} product{stats.lowStockProducts !== 1 ? "s" : ""} running low on stock</span>
          </div>
        )}

        {/* Stats Grid — 2 columns */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon;
            const rawVal = stats[card.key];
            const displayVal = card.format === "currency" ? formatCurrency(rawVal) : String(rawVal);
            const isLong = displayVal.length > 6;

            return (
              <div key={card.key} className="dash-stat" style={{ background: card.bg, border: `1.5px solid ${card.border}` }}>
                <div className="dash-stat-label" style={{ color: card.color }}>
                  <Icon style={{ width: 11, height: 11 }} /> {card.label}
                </div>
                <div className={`dash-stat-value ${isLong ? "dash-stat-value-sm" : ""}`}>
                  {displayVal}
                </div>
                <div className="dash-stat-blob" style={{ background: card.blobColor }} />
              </div>
            );
          })}
        </div>

        {/* Quick Action Chips */}
        <p className="dash-section-label">Quick Actions</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setIsAddBillOpen(true)}
            className="dash-chip"
            style={{ background: "#18181b", color: "#fff" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Create Bill
          </button>
          <button
            type="button"
            onClick={() => setIsAddProductOpen(true)}
            className="dash-chip"
            style={{ background: "#f4f4f5", color: "#18181b", border: "1.5px solid #e4e4e7" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add Product
          </button>
          <button
            type="button"
            className="dash-chip"
            style={{ background: "#f4f4f5", color: "#18181b", border: "1.5px solid #e4e4e7" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add Staff
          </button>
        </div>

        {/* Today's Summary — white card */}
        <div className="dash-summary" style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: "#a1a1aa", marginBottom: 12 }}>
            Today&apos;s Summary
          </p>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Left — Revenue */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Revenue</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: "#18181b", letterSpacing: "-0.03em" }}>
                {formatCurrency(stats.todayRevenue)}
              </p>
            </div>
            {/* Vertical Divider */}
            <div style={{ width: 1, height: 40, background: "#e4e4e7", flexShrink: 0 }} />
            {/* Right — Bills */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Bills</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: "#18181b", letterSpacing: "-0.03em" }}>
                {stats.todayInvoices}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Bills — same card style as billing page */}
        {recentInvoices.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p className="dash-section-label" style={{ marginBottom: 0 }}>Recent Bills</p>
              <Link href="/billing" style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                View all <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {recentInvoices.map((invoice, i) => {
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <article key={invoice.id} className="dash-card">
                    <div className="dash-card-topbar" style={{ background: accent.top }} />

                    {/* Row 1 */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <div className="dash-avatar" style={{ background: accent.dotBg }}>
                          <User style={{ width: 15, height: 15, color: accent.top }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#18181b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {invoice.customer_name || "Walk-in Customer"}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 6px", borderRadius: 6, background: accent.tint, color: accent.textAccent, whiteSpace: "nowrap" }}>
                            {invoice.invoice_number}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        <CalendarDays style={{ width: 11, height: 11 }} />
                        {formatSafeShortDate(invoice.invoice_date)}
                      </span>
                    </div>

                    {/* Row 2 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
                        <ShoppingBag style={{ width: 12, height: 12, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {invoice.invoice_items?.[0]?.product_name_snapshot ?? "Unknown item"}
                          {(invoice.invoice_items?.length ?? 0) > 1 ? ` +${invoice.invoice_items!.length - 1}` : ""}
                        </span>
                      </div>
                      <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.025em", color: "#18181b", flexShrink: 0 }}>
                        ₹{formatSafeAmount(invoice.grand_total)}
                      </div>
                    </div>

                    <div style={{ height: 1, background: "#f1f1f3", margin: "11px 0 10px" }} />

                    {/* Row 3 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                      {invoice.customer_mobile ? (
                        <a href={`tel:${invoice.customer_mobile}`} onClick={(e) => e.stopPropagation()}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 50, fontSize: 11.5, fontWeight: 700, background: "#eff6ff", color: "#2563eb", textDecoration: "none" }}>
                          <PhoneCall style={{ width: 11, height: 11 }} /> Call
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* Recently Added Products — same card as inventory page */}
        {recentProducts.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p className="dash-section-label" style={{ marginBottom: 0 }}>Recent Products</p>
              <Link href="/inventory" style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                View all <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm" style={{ marginBottom: 20 }}>
              {recentProducts.map((product, index) => {
                const isOutOfStock = product.total_quantity === 0;
                const isLowStock = !isOutOfStock && product.total_quantity <= 5;
                const marginPct =
                  product.base_purchase_price > 0
                    ? Math.round(((product.base_selling_price - product.base_purchase_price) / product.base_purchase_price) * 100)
                    : 0;

                return (
                  <div
                    key={product.id}
                    className={`group relative ${index !== recentProducts.length - 1 ? "border-b border-stone-100" : ""} ${isOutOfStock ? "bg-stone-50" : "bg-white"}`}
                  >
                    {/* Left accent bar */}
                    <div
                      className={`absolute left-0 top-0 h-full w-[3px] rounded-r-sm transition-all duration-200 ${
                        isOutOfStock ? "bg-red-300" : isLowStock ? "bg-amber-400" : "bg-transparent group-hover:bg-stone-300"
                      }`}
                    />

                    <div className={`flex items-start gap-3 px-4 py-3.5 ${isOutOfStock ? "cursor-default" : "cursor-pointer hover:bg-stone-50/70"} transition-colors duration-150`}>
                      <div className={`min-w-0 flex-1 transition-opacity duration-200 ${isOutOfStock ? "opacity-35" : ""}`}>
                        {/* Brand / Category */}
                        <p className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-stone-400">
                          {product.brand_name || product.category_name || "—"}
                        </p>

                        {/* Name */}
                        <p className="truncate text-sm font-semibold leading-snug text-stone-800">
                          {product.name}
                        </p>

                        {/* Stats row */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {/* Stock pill */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                              isOutOfStock
                                ? "bg-red-100 text-red-500"
                                : isLowStock
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                isOutOfStock ? "bg-red-400" : isLowStock ? "bg-amber-400" : "bg-emerald-400"
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
                    </div>

                    {/* Out of stock notice */}
                    {isOutOfStock && (
                      <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                          <span className="text-[10px] font-black leading-none">✕</span>
                        </div>
                        <p className="truncate text-[11px] font-semibold text-red-600">
                          Out of stock — unavailable for sale
                        </p>
                      </div>
                    )}

                    {/* Low stock notice */}
                    {isLowStock && (
                      <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <p className="truncate text-[11px] font-semibold text-amber-700">
                          Only {product.total_quantity} left — running low
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Spacer for bottom nav */}
        <div style={{ height: 20 }} />
      </div>

      {/* Modals */}
      <AddBillModal
        open={isAddBillOpen}
        onClose={() => setIsAddBillOpen(false)}
        products={products}
        shopLogoUrl={shopLogoUrl}
        onInvoiceCreated={() => router.refresh()}
      />

      {isAddProductOpen ? (
        <AddProductModal
          open={isAddProductOpen}
          mode="create"
          productId={null}
          onClose={() => setIsAddProductOpen(false)}
          categories={categories}
          brands={brands}
          products={products}
        />
      ) : null}
    </>
  );
}
