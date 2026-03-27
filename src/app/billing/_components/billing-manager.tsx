"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Printer,
  Receipt,
  Wallet,
  PhoneCall,
  TrendingUp,
  ShoppingBag,
  User,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";

import type { Product } from "@/lib/types/inventory";
import { InventoryTopBar } from "@/app/inventory/_components/inventory-top-bar";
import { AddBillModal } from "./add-bill-modal";
import { BillDetailsDrawer } from "./bill-details-drawer";
import { printInvoice, type PrintableInvoice } from "./invoice-print";
import type { BillingInvoiceSummary } from "../load-billing-data";

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

const FILTER_CHIPS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
] as const;

const CARD_ACCENTS = [
  { top: "#f97316", tint: "#fff7ed", textAccent: "#c2410c", dotBg: "#ffedd5" },
  { top: "#3b82f6", tint: "#eff6ff", textAccent: "#1d4ed8", dotBg: "#dbeafe" },
  { top: "#10b981", tint: "#f0fdf4", textAccent: "#047857", dotBg: "#d1fae5" },
  { top: "#8b5cf6", tint: "#f5f3ff", textAccent: "#6d28d9", dotBg: "#ede9fe" },
  { top: "#ec4899", tint: "#fdf2f8", textAccent: "#be185d", dotBg: "#fce7f3" },
  { top: "#f59e0b", tint: "#fffbeb", textAccent: "#b45309", dotBg: "#fef3c7" },
];

export function BillingManager({
  products,
  invoices,
  shopLogoUrl,
}: {
  products: ProductSummary[];
  invoices: BillingInvoiceSummary[];
  shopLogoUrl?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentQuery = searchParams.get("q") ?? "";
  const currentPeriod = searchParams.get("period") ?? "all";

  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const [showHeader, setShowHeader] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [liveProducts, setLiveProducts] = useState(products);

  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    setLiveProducts(products);
  }, [products]);

  useEffect(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    updateScrollArrows();
    el.addEventListener("scroll", updateScrollArrows, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollArrows);
  }, [updateScrollArrows]);

  function scrollChips(direction: "left" | "right") {
    const el = chipScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -120 : 120, behavior: "smooth" });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchQuery && searchQuery !== currentQuery) {
        params.set("q", searchQuery);
        router.push(`${pathname}?${params.toString()}`);
      } else if (!searchQuery && currentQuery) {
        params.delete("q");
        router.push(`${pathname}?${params.toString()}`);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, currentQuery, pathname, router, searchParams]);

  const setFilter = useCallback(
    (period: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (period === "all") {
        params.delete("period");
      } else {
        params.set("period", period);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router]
  );

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

  useEffect(() => {
    if (currentQuery || currentPeriod !== "all") {
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  }, [invoices, currentQuery, currentPeriod]);

  const selectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId]
  );

  const stats = useMemo(
    () => ({
      count: invoices.length,
      totalValue: invoices.reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0),
      avgValue:
        invoices.length > 0
          ? invoices.reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0) / invoices.length
          : 0,
    }),
    [invoices]
  );

  function reprintInvoice(invoice: PrintableInvoice) {
    printInvoice({ ...(invoice as PrintableInvoice), shop_logo_url: shopLogoUrl ?? null });
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');

        .bm-root {
          background: #f4f5f7;
          min-height: 100vh;
          font-family: 'Nunito', system-ui, sans-serif;
        }
        .bm-topbar {
          background: rgba(244,245,247,0.94);
          border-bottom: 1.5px solid #e4e4e7;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .bm-chip-active {
          background: #18181b;
          color: #fff;
          font-weight: 800;
          box-shadow: 0 2px 8px rgba(0,0,0,0.16);
        }
        .bm-chip-idle {
          background: #fff;
          color: #71717a;
          font-weight: 600;
          border: 1.5px solid #e4e4e7;
        }
        .bm-chip-idle:hover { border-color: #a1a1aa; color: #3f3f46; }

        .bm-stat {
          border-radius: 18px;
          padding: 14px 12px 12px;
          position: relative;
          overflow: hidden;
        }
        .bm-stat-label {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 7px;
        }
        .bm-stat-value {
          font-size: 24px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.03em;
          color: #18181b;
        }
        .bm-stat-value-sm { font-size: 17px; }
        .bm-stat-blob {
          position: absolute;
          border-radius: 50%;
          bottom: -12px; right: -12px;
          width: 44px; height: 44px;
          opacity: 0.3;
        }

        .bm-card {
          background: #ffffff;
          border-radius: 20px;
          padding: 15px 14px 13px;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.17s ease, box-shadow 0.17s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.05);
        }
        .bm-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.09), 0 12px 30px rgba(0,0,0,0.07);
        }
        .bm-card:active { transform: translateY(0); }

        .bm-card-topbar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 3.5px;
          border-radius: 20px 0 0 20px;
        }

        .bm-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .bm-customer {
          font-size: 15px; font-weight: 800; color: #18181b;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .bm-inv-num {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.05em;
          padding: 2px 6px; border-radius: 6px;
          white-space: nowrap;
        }
        .bm-date {
          font-size: 11.5px; font-weight: 600; color: #a1a1aa;
          display: flex; align-items: center; gap: 3px; flex-shrink: 0;
        }
        .bm-product-line {
          font-size: 12.5px; font-weight: 500; color: #a1a1aa;
          display: flex; align-items: center; gap: 5px;
          flex: 1; min-width: 0;
        }
        .bm-amount {
          font-size: 19px; font-weight: 900;
          letter-spacing: -0.025em; color: #18181b; flex-shrink: 0;
        }
        .bm-divider {
          height: 1px; background: #f1f1f3;
          margin: 11px 0 10px;
        }
        .bm-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 5px 12px; border-radius: 50px;
          font-size: 11.5px; font-weight: 700;
          transition: background 0.13s, transform 0.1s;
          cursor: pointer; border: none; outline: none;
          font-family: inherit;
        }
        .bm-btn:active { transform: scale(0.96); }
        .bm-btn-call { background: #eff6ff; color: #2563eb; }
        .bm-btn-call:hover { background: #dbeafe; }
        .bm-btn-print { background: #f4f4f5; color: #52525b; }
        .bm-btn-print:hover { background: #e4e4e7; }

        .bm-empty {
          border: 2px dashed #d4d4d8; border-radius: 20px;
          padding: 48px 24px; text-align: center; background: #fafafa;
        }
        .bm-section-label {
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.13em; text-transform: uppercase;
          color: #a1a1aa; margin-bottom: 10px; padding-left: 2px;
        }
        .bm-scroll-arrow {
          width: 28px; height: 28px; border-radius: 50%;
          background: #fff; border: 1.5px solid #e4e4e7;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          display: flex; align-items: center; justify-content: center;
          color: #52525b; transition: background 0.13s; cursor: pointer;
        }
        .bm-scroll-arrow:hover { background: #f4f4f5; }

        .bm-fab {
          position: fixed; bottom: 90px; right: 16px; z-index: 40;
          width: 44px; height: 44px; border-radius: 50%;
          background: #18181b; color: #fff;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.22);
          transition: transform 0.15s; border: none; cursor: pointer;
        }
        .bm-fab:hover { transform: scale(1.08); }
      `}</style>

      <div className="bm-root -mx-3 px-1">
        {/* ── Sticky top bar ── */}
        <div
          className={`fixed left-1/2 -translate-x-1/2 w-full max-w-3xl top-0 z-40 bm-topbar transition-transform duration-300 ${showHeader ? "translate-y-0" : "-translate-y-full -translate-x-1/2"
            }`}
        >
          <div className="mx-auto w-full max-w-3xl px-1 py-3">
            <InventoryTopBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onBack={() => router.back()}
              onAdd={() => setIsAddBillOpen(true)}
            />
          </div>
        </div>

        <div className="h-16" />

        <section className="w-full px-1 pt-2">

          {/* ── Filter Chips ── */}
          <div className="relative mb-5">
            {canScrollLeft && (
              <button type="button" onClick={() => scrollChips("left")}
                className="bm-scroll-arrow absolute left-0 top-1/2 z-10 -translate-y-1/2">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div ref={chipScrollRef}
              className="flex items-center gap-2 overflow-x-auto px-1 py-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {FILTER_CHIPS.map((chip) => (
                <button key={chip.id} onClick={() => setFilter(chip.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-[7px] text-[13px] transition-all duration-200 ${currentPeriod === chip.id ? "bm-chip-active" : "bm-chip-idle"
                    }`}>
                  {chip.label}
                </button>
              ))}
            </div>
            {canScrollRight && (
              <button type="button" onClick={() => scrollChips("right")}
                className="bm-scroll-arrow absolute right-0 top-1/2 z-10 -translate-y-1/2">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            <div className="bm-stat" style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }}>
              <div className="bm-stat-label" style={{ color: "#ea580c" }}>
                <Receipt style={{ width: 11, height: 11 }} /> Bills
              </div>
              <div className="bm-stat-value">{stats.count}</div>
              <div className="bm-stat-blob" style={{ background: "#f97316" }} />
            </div>
            <div className="bm-stat" style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
              <div className="bm-stat-label" style={{ color: "#16a34a" }}>
                <Wallet style={{ width: 11, height: 11 }} /> Revenue
              </div>
              <div className={`bm-stat-value ${stats.totalValue >= 100000 ? "bm-stat-value-sm" : ""}`}>
                ₹{stats.totalValue >= 1000
                  ? `${(stats.totalValue / 1000).toFixed(1)}k`
                  : stats.totalValue.toFixed(0)}
              </div>
              <div className="bm-stat-blob" style={{ background: "#22c55e" }} />
            </div>
            <div className="bm-stat" style={{ background: "#f5f3ff", border: "1.5px solid #ddd6fe" }}>
              <div className="bm-stat-label" style={{ color: "#7c3aed" }}>
                <TrendingUp style={{ width: 11, height: 11 }} /> Avg
              </div>
              <div className="bm-stat-value bm-stat-value-sm">
                ₹{stats.avgValue.toFixed(0)}
              </div>
              <div className="bm-stat-blob" style={{ background: "#8b5cf6" }} />
            </div>
          </div>

          {/* ── Invoice List ── */}
          {invoices.length === 0 ? (
            <div className="bm-empty">
              <p style={{ color: "#3f3f46", fontWeight: 700, fontSize: 14 }}>No bills found</p>
              <p style={{ color: "#a1a1aa", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                We couldn&apos;t find any bills matching your search or filters.
              </p>
            </div>
          ) : (
            <>
              <p className="bm-section-label">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {invoices.map((invoice, i) => {
                  const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                  return (
                    <article key={invoice.id} onClick={() => setSelectedInvoiceId(invoice.id)} className="bm-card">
                      <div className="bm-card-topbar" style={{ background: accent.top }} />

                      {/* Row 1 */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                          <div className="bm-avatar" style={{ background: accent.dotBg }}>
                            <User style={{ width: 15, height: 15, color: accent.top }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="bm-customer">
                              {invoice.customer_name || "Walk-in Customer"}
                            </div>
                            <span className="bm-inv-num" style={{ background: accent.tint, color: accent.textAccent }}>
                              {invoice.invoice_number}
                            </span>
                          </div>
                        </div>
                        <span className="bm-date">
                          <CalendarDays style={{ width: 11, height: 11 }} />
                          {format(new Date(invoice.invoice_date), "dd MMM")}
                        </span>
                      </div>

                      {/* Row 2 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
                        <div className="bm-product-line">
                          <ShoppingBag style={{ width: 12, height: 12, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {invoice.invoice_items?.[0]?.product_name_snapshot ?? "Unknown item"}
                            {(invoice.invoice_items?.length ?? 0) > 1 ? ` +${invoice.invoice_items!.length - 1}` : ""}
                          </span>
                        </div>
                        <div className="bm-amount">₹{Number(invoice.grand_total).toFixed(0)}</div>
                      </div>

                      <div className="bm-divider" />

                      {/* Row 3 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                        {invoice.customer_mobile ? (
                          <a href={`tel:${invoice.customer_mobile}`} onClick={(e) => e.stopPropagation()} className="bm-btn bm-btn-call">
                            <PhoneCall style={{ width: 11, height: 11 }} /> Call
                          </a>
                        ) : null}
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); reprintInvoice(invoice); }}
                          className="bm-btn bm-btn-print">
                          <Printer style={{ width: 12, height: 12 }} /> Reprint
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <AddBillModal
          open={isAddBillOpen}
          onClose={() => setIsAddBillOpen(false)}
          products={liveProducts}
          shopLogoUrl={shopLogoUrl}
          onInvoiceCreated={(items) => {
            setLiveProducts((current) =>
              current.map((product) => {
                const lineItems = items.filter((item) => item.product_id === product.id);
                if (lineItems.length === 0) return product;

                const soldQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);
                const nextVariants = product.variants?.map((variant) => {
                  const variantSold = lineItems
                    .filter((item) => item.variant_id === variant.id)
                    .reduce((sum, item) => sum + item.quantity, 0);

                  if (!variantSold) return variant;
                  return {
                    ...variant,
                    quantity: Math.max((variant.quantity ?? 0) - variantSold, 0),
                  };
                });

                return {
                  ...product,
                  total_quantity: Math.max((product.total_quantity ?? 0) - soldQuantity, 0),
                  variants: nextVariants ?? product.variants,
                };
              })
            );
            router.refresh();
          }}
        />

        <BillDetailsDrawer
          invoice={selectedInvoice ? { ...selectedInvoice, shop_logo_url: shopLogoUrl ?? null } : null}
          open={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoiceId(null)}
          onReprint={reprintInvoice}
        />

        {showScrollTop && (
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="bm-fab" aria-label="Scroll to top">
            <ChevronUp style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>
    </>
  );
}
