"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Receipt,
  MoreVertical,
  Pencil,
  Trash2,
  Wallet,
  PhoneCall,
  TrendingUp,
  ShoppingBag,
  User,
  Loader2,
} from "lucide-react";
import { format, isValid, isToday, isYesterday, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import type { Product, Category, Brand } from "@/lib/types/inventory";
import { InventoryTopBar } from "@/app/inventory/_components/inventory-top-bar";
import { AddProductModal } from "@/app/inventory/_components/add-product-modal";
import { AddBillModal } from "./add-bill-modal";
import { BillDetailsDrawer } from "./bill-details-drawer";
import { downloadInvoicePdf, type PrintableInvoice } from "./invoice-print";
import { deleteInvoiceAction } from "../actions";
import type { BillingInvoiceSummary } from "../load-billing-data";
import { productDetailsQueryKey } from "@/app/inventory/queries";

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

function getBillPaymentLabel(invoice: BillingInvoiceSummary) {
  const methods = invoice.payment_details?.methods?.filter(Boolean) ?? [];
  if (methods.includes("LOAN")) return "Loan";
  return methods[0] || invoice.payment_method || "Cash";
}

function formatRelativeInvoiceDate(value: string | null | undefined) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!isValid(parsed)) return "--";

  if (isToday(parsed)) {
    const dist = formatDistanceToNowStrict(parsed, { addSuffix: true });
    if (dist.includes("second") || dist === "0 minutes ago") {
      return "Just now";
    }
    return dist
      .replace("minutes ago", "mins ago")
      .replace("minute ago", "min ago")
      .replace("hours ago", "hrs ago")
      .replace("hour ago", "hr ago");
  }

  if (isYesterday(parsed)) {
    return "Yesterday";
  }

  return format(parsed, "dd MMM");
}

function normalizeBillSearchText(invoice: BillingInvoiceSummary) {
  return [
    invoice.invoice_number,
    invoice.customer_name,
    invoice.customer_mobile,
    invoice.billing_address,
    invoice.customer_gst_number,
    invoice.payment_method,
    invoice.payment_status,
    invoice.notes,
    invoice.payment_details?.methods?.join(" "),
    invoice.invoice_items?.map((item) => [
      item.product_name_snapshot,
      item.brand_name_snapshot,
      item.category_name_snapshot,
      item.variant_name_snapshot,
      item.identifier_snapshot,
    ].filter(Boolean).join(" ")).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function BillingManager({
  products,
  invoices,
  categories,
  brands,
  shopLogoUrl,
  shopPostalCode,
  shopStampUrl,
}: {
  products: ProductSummary[];
  invoices: BillingInvoiceSummary[];
  categories: Category[];
  brands: Brand[];
  shopLogoUrl?: string | null;
  shopPostalCode?: string | null;
  shopStampUrl?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentQuery = searchParams.get("q") ?? "";
  const currentPeriod = searchParams.get("period") ?? "all";

  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const [showHeader, setShowHeader] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<BillingInvoiceSummary | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [openDownloadDropdownId, setOpenDownloadDropdownId] = useState<string | null>(null);
  const [liveProducts, setLiveProducts] = useState(products);

  const [deletedInvoiceIds, setDeletedInvoiceIds] = useState<Set<string>>(new Set());
  const [confirmDeleteInvoiceId, setConfirmDeleteInvoiceId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

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

  const displayedInvoices = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleInvoices = invoices.filter(inv => !deletedInvoiceIds.has(inv.id));
    if (!normalizedQuery) return visibleInvoices;
    return visibleInvoices.filter((invoice) => normalizeBillSearchText(invoice).includes(normalizedQuery));
  }, [invoices, searchQuery, deletedInvoiceIds]);

  const selectedInvoice = useMemo(
    () => displayedInvoices.find((inv) => inv.id === selectedInvoiceId) ?? invoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [displayedInvoices, invoices, selectedInvoiceId]
  );

  const stats = useMemo(
    () => ({
      count: displayedInvoices.length,
      totalValue: displayedInvoices.reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0),
      avgValue:
        displayedInvoices.length > 0
          ? displayedInvoices.reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0) / displayedInvoices.length
          : 0,
    }),
    [displayedInvoices]
  );

  async function downloadInvoice(invoice: PrintableInvoice) {
    try {
      await downloadInvoicePdf({
        ...(invoice as PrintableInvoice),
        shop_logo_url: shopLogoUrl ?? null,
        shop_postal_code: shopPostalCode ?? null,
        shop_stamp_url: null,
        customer_signature_url: null,
      });
    } catch (err) {
      console.error("[Download] PDF generation failed:", err);
      toast.error(`Download failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  function confirmDeleteInvoice(restockItems: boolean = true) {
    if (!confirmDeleteInvoiceId) return;
    const invoiceId = confirmDeleteInvoiceId;
    setDeletingInvoiceId(invoiceId);
    startDeleteTransition(async () => {
      const result = await deleteInvoiceAction(invoiceId, restockItems);
      if (result.status === "success") {
        toast.success(result.message);
        setDeletedInvoiceIds((prev) => new Set(prev).add(invoiceId));
        if (selectedInvoiceId === invoiceId) {
          setSelectedInvoiceId(null);
        }
        setConfirmDeleteInvoiceId(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setDeletingInvoiceId(null);
    });
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

        .bm-list {
          overflow: visible;
          border-radius: 20px;
          border: 1px solid #f1f1f3;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .bm-card {
          background: #ffffff;
          padding: 15px 14px 13px;
          position: relative;
          overflow: visible;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .bm-card:hover {
          background: #fafafa;
        }
        .bm-card + .bm-card {
          border-top: 1px solid #f1f1f3;
        }
        .bm-card:active { background: #f6f6f7; }

        .bm-card-topbar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 3.5px;
          border-radius: 2px;
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
              searchPlaceholder="Search bills by invoice no, customer, mobile, item"
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
          {displayedInvoices.length === 0 ? (
            <div className="bm-empty">
              <p style={{ color: "#3f3f46", fontWeight: 700, fontSize: 14 }}>No bills found</p>
              <p style={{ color: "#a1a1aa", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                We couldn&apos;t find any bills matching your search or filters.
              </p>
            </div>
          ) : (
            <>
              <p className="bm-section-label">{displayedInvoices.length} invoice{displayedInvoices.length !== 1 ? "s" : ""}</p>
              <div className="bm-list">
                {displayedInvoices.map((invoice, i) => {
                  const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                  return (
                    <article key={invoice.id} onClick={() => setSelectedInvoiceId(invoice.id)} className="bm-card" style={{ zIndex: (openDropdownId === invoice.id || openDownloadDropdownId === invoice.id) ? 50 : 1 }}>
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
                            <span className="bm-inv-num" style={{ background: accent.tint, color: accent.textAccent }}>
                              {getBillPaymentLabel(invoice)}
                            </span>
                          </div>
                        </div>
                        <span className="bm-date">
                          {formatRelativeInvoiceDate(invoice.invoice_date)}
                        </span>
                      </div>

                      {/* Row 2 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8, paddingLeft: 43 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="bm-product-line gap-8">
                            <ShoppingBag style={{ width: 12, height: 12, flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {invoice.invoice_items?.[0]?.product_name_snapshot ?? "Unknown item"}
                              {(invoice.invoice_items?.length ?? 0) > 1 ? ` +${invoice.invoice_items!.length - 1}` : ""}
                            </span>
                          </div>
                        </div>
                        <div className="bm-amount">₹{Number(invoice.grand_total).toFixed(0)}</div>
                      </div>
                      {/* Row 3 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, marginTop: 12 }}>
                        {invoice.customer_mobile ? (
                          <a
                            href={`tel:${invoice.customer_mobile}`}
                            onClick={(e) => e.stopPropagation()}
                            className="bm-btn bm-btn-call"
                            aria-label="Call customer"
                            title="Call customer"
                          >
                            <PhoneCall style={{ width: 11, height: 11 }} />
                          </a>
                        ) : null}

                        <div className="relative">
                          <button
                            type="button"
                            aria-label="Download bill"
                            title={invoice.send_ready_pdf_url ? "Download options" : "Download bill"}
                            onClick={(e) => {
                              if (invoice.send_ready_pdf_url) {
                                e.stopPropagation();
                                setOpenDownloadDropdownId(openDownloadDropdownId === invoice.id ? null : invoice.id);
                              } else {
                                e.stopPropagation();
                                downloadInvoice(invoice);
                              }
                            }}
                            className="bm-btn bm-btn-print"
                          >
                            <Download style={{ width: 12, height: 12 }} />
                          </button>
                          {openDownloadDropdownId === invoice.id && invoice.send_ready_pdf_url && (
                            <div className="absolute right-0 top-10 z-[60] w-52 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDownloadDropdownId(null);
                                  window.open(invoice.send_ready_pdf_url!, "_blank");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                              >
                                <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="flex-1">With Signature & Stamp</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDownloadDropdownId(null);
                                  downloadInvoice(invoice);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                              >
                                <Receipt className="h-3.5 w-3.5 text-stone-400" />
                                <span className="flex-1">Clean Invoice PDF</span>
                              </button>
                            </div>
                          )}
                          {openDownloadDropdownId === invoice.id && (
                            <div className="fixed inset-0 z-50" onClick={(e) => { e.stopPropagation(); setOpenDownloadDropdownId(null); }} />
                          )}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === invoice.id ? null : invoice.id); }}
                            className="bm-btn"
                            style={{ padding: "8px", background: "transparent", color: "#52525b" }}
                            aria-label="More options"
                          >
                            <MoreVertical style={{ width: 14, height: 14 }} />
                          </button>
                          {openDropdownId === invoice.id && (
                            <div className="absolute right-0 top-10 z-[60] w-36 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(null);
                                  setEditingInvoice(invoice);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(null);
                                  setConfirmDeleteInvoiceId(invoice.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                          {openDropdownId === invoice.id && (
                            <div className="fixed inset-0 z-50" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }} />
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <AddBillModal
          open={isAddBillOpen || !!editingInvoice}
          onClose={() => {
            setIsAddBillOpen(false);
            setEditingInvoice(null);
          }}
          onOpenAddProduct={() => setIsAddProductModalOpen(true)}
          invoiceToEdit={editingInvoice}
          products={liveProducts}
          shopLogoUrl={shopLogoUrl}
          shopPostalCode={shopPostalCode}
          shopStampUrl={shopStampUrl ?? null}
          onInvoiceCreated={async (items) => {
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
            await Promise.all(
              Array.from(new Set(items.map((item) => item.product_id))).map((productId) =>
                queryClient.invalidateQueries({ queryKey: productDetailsQueryKey(productId) })
              )
            );
            router.refresh();
          }}
        />

        <BillDetailsDrawer
          invoice={selectedInvoice ? { ...selectedInvoice, shop_logo_url: shopLogoUrl ?? null } : null}
          open={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoiceId(null)}
          onDownload={downloadInvoice}
          onEdit={() => {
            setSelectedInvoiceId(null);
            if (selectedInvoice) {
              setEditingInvoice(selectedInvoice);
            }
          }}
          onDelete={(id) => {
            setSelectedInvoiceId(null);
            setConfirmDeleteInvoiceId(id);
          }}
        />

        <AddProductModal
          open={isAddProductModalOpen}
          mode="create"
          productId={null}
          onClose={() => setIsAddProductModalOpen(false)}
          onSaved={() => router.refresh()}
          categories={categories}
          brands={brands}
          products={liveProducts as any} // Cast safely since ProductSummary implicitly matches the subset
        />

        {showScrollTop && (
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="bm-fab" aria-label="Scroll to top">
            <ChevronUp style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      {confirmDeleteInvoiceId ? (
        <DeleteConfirmationDialog
          isDeleting={isDeleting && deletingInvoiceId === confirmDeleteInvoiceId}
          title="Delete Bill"
          description="Are you sure you want to delete this bill? This action will permanently remove the invoice."
          showRestockOption={true}
          onCancel={() => setConfirmDeleteInvoiceId(null)}
          onConfirm={(restock) => confirmDeleteInvoice(restock)}
        />
      ) : null}
    </>
  );
}

function DeleteConfirmationDialog({
  isDeleting,
  title,
  description,
  showRestockOption,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  title: string;
  description: string;
  showRestockOption?: boolean;
  onCancel: () => void;
  onConfirm: (restock?: boolean) => void;
}) {
  const [restock, setRestock] = useState(true);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-stone-950/35 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <h3 className="text-lg font-semibold text-stone-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {description}
        </p>

        {showRestockOption && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:bg-stone-100">
            <input 
              type="checkbox" 
              checked={restock} 
              onChange={e => setRestock(e.target.checked)} 
              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900" 
            />
            <span className="text-sm font-medium text-stone-700">Restock deleted items back to inventory automatically</span>
          </label>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(showRestockOption ? restock : undefined)}
            disabled={isDeleting}
            className="flex items-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
