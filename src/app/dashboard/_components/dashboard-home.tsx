"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { format, isValid, isToday, isYesterday, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  Wallet,
  Receipt,
  Package,
  Archive,
  Users,
  AlertTriangle,
  ShoppingBag,
  CalendarDays,
  ArrowRight,
  Plus,
  Download,
  PhoneCall,
  User,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Stamp,
  Send,
} from "lucide-react";

import type { DashboardStats, RecentInvoice, RecentProduct, SubscriptionNotice } from "../load-dashboard-data";
import type { BillingInvoiceSummary } from "@/app/billing/load-billing-data";
import type { Brand, Category } from "@/lib/types/inventory";
import { useBillFormSession } from "@/lib/hooks/use-bill-form-session";
import { AddBillModal } from "@/app/billing/_components/add-bill-modal";
import { AddProductModal } from "@/app/inventory/_components/add-product-modal";
import { ProductDetailsDrawer } from "@/app/inventory/_components/product-details-drawer";
import { productDetailsQueryOptions } from "@/app/inventory/queries";
import { BillDetailsDrawer } from "@/app/billing/_components/bill-details-drawer";
import { downloadInvoicePdf, downloadExternalPdf, type PrintableInvoice } from "@/app/billing/_components/invoice-print";
import { sendInvoiceWhatsappWithFreshPdf } from "@/app/billing/_components/invoice-whatsapp-client";
import { ProductCard, type InventoryProduct } from "@/app/inventory/_components/product-list";
import { RecordSaleModal } from "@/app/inventory/_components/record-sale-modal";
import { StockAdjustmentModal } from "@/app/inventory/_components/stock-adjustment-modal";
import { deleteProductAction } from "@/app/inventory/actions";
import { deleteInvoiceAction } from "@/app/billing/actions";
import { InviteStaffModal } from "@/app/staff/_components/invite-staff-modal";
type ProductSummary = InventoryProduct;
type SendableInvoiceInput = PrintableInvoice & {
  id: string;
  customer_mobile?: string | null;
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

function getDisplayFirstName(name: string) {
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  return firstName || "there";
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

function formatSafeAmount(value: number | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(0) : "0";
}

function getBillPaymentLabel(invoice: RecentInvoice) {
  const methods = invoice.payment_details?.methods?.filter(Boolean) ?? [];
  if (methods.includes("LOAN")) return "Loan";
  return methods[0] || invoice.payment_method || "Cash";
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

type DashboardNoticeCard = {
  id: string;
  tone: SubscriptionNotice["tone"];
  title: string;
  message: string;
  href?: string;
  actionLabel?: string;
  icon: typeof AlertTriangle;
};

const NOTICE_TONES: Record<SubscriptionNotice["tone"], { background: string; border: string; color: string; button: string; iconBg: string }> = {
  danger: { background: "#fef2f2", border: "#fecaca", color: "#991b1b", button: "#dc2626", iconBg: "#fee2e2" },
  warning: { background: "#fffbeb", border: "#fde68a", color: "#92400e", button: "#92400e", iconBg: "#fef3c7" },
  success: { background: "#f0fdf4", border: "#bbf7d0", color: "#166534", button: "#15803d", iconBg: "#dcfce7" },
  info: { background: "#eff6ff", border: "#bfdbfe", color: "#1e40af", button: "#2563eb", iconBg: "#dbeafe" },
};

function DashboardNoticeCarousel({
  notices,
  activeIndex,
  onSelect,
}: {
  notices: DashboardNoticeCard[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const activeNotice = notices[activeIndex] ?? notices[0];
  const tone = NOTICE_TONES[activeNotice.tone];
  const Icon = activeNotice.icon;

  return (
    <div style={{ margin: "0 0 14px" }}>
      <div
        style={{
          alignItems: "center",
          background: tone.background,
          border: `1.5px solid ${tone.border}`,
          borderRadius: 18,
          color: tone.color,
          display: "flex",
          gap: 10,
          padding: "12px 12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: tone.iconBg,
            borderRadius: 14,
            display: "flex",
            flexShrink: 0,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          <Icon style={{ width: 17, height: 17 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.2, margin: 0 }}>{activeNotice.title}</p>
          <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.45, margin: "3px 0 0", opacity: 0.86 }}>
            {activeNotice.message}
          </p>
        </div>
        {activeNotice.href && activeNotice.actionLabel ? (
          <Link href={activeNotice.href} className="dash-notice-action" style={{ background: tone.button }}>
            {activeNotice.actionLabel}
            <ArrowRight style={{ width: 13, height: 13 }} />
          </Link>
        ) : null}
      </div>

      {notices.length > 1 ? (
        <div style={{
          background: "transparent",
          display: "flex",
          justifyContent: "center",
          gap: 5,
          marginTop: 8,
        }}>
          {notices.map((notice, index) => (
            <button
              key={notice.id}
              type="button"
              aria-label={`Show ${notice.title}`}
              onClick={() => onSelect(index)}
              style={{
                background: index === activeIndex ? "#18181b" : "#d4d4d8",
                border: 0,
                borderRadius: 999,
                height: 6,
                padding: 0,
                transition: "width 0.18s ease, background 0.18s ease",
                width: index === activeIndex ? 18 : 6,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardHome({
  ownerName,
  shopLogoUrl,
  shopPostalCode,
  stats,
  recentInvoices,
  recentProducts,
  products,
  categories,
  brands,
  shopStampUrl,
  shopSlug,
  subscriptionNotice,
  planEntitlements,
  loadError,
}: {
  ownerName: string;
  shopLogoUrl: string | null;
  shopPostalCode: string | null;
  stats: DashboardStats;
  recentInvoices: RecentInvoice[];
  recentProducts: RecentProduct[];
  products: ProductSummary[];
  categories: Category[];
  brands: Brand[];
  shopStampUrl: string | null;
  shopSlug?: string | null;
  subscriptionNotice?: SubscriptionNotice | null;
  planEntitlements?: Record<string, boolean> | null;
  loadError?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isAddBillOpen, setIsAddBillOpen, resumeBillDraft] = useBillFormSession();
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isInviteStaffOpen, setIsInviteStaffOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [saleProductId, setSaleProductId] = useState<string | null>(null);
  const [adjustmentProductId, setAdjustmentProductId] = useState<string | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<"ADJUSTMENT_ADD" | "ADJUSTMENT_REMOVE">("ADJUSTMENT_REMOVE");
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const [editingInvoice, setEditingInvoice] = useState<BillingInvoiceSummary | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [openDownloadDropdownId, setOpenDownloadDropdownId] = useState<string | null>(null);
  const [confirmDeleteInvoiceId, setConfirmDeleteInvoiceId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [sendingWhatsappInvoiceId, setSendingWhatsappInvoiceId] = useState<string | null>(null);
  const [deletedInvoiceIds, setDeletedInvoiceIds] = useState<Set<string>>(new Set());
  const [dashboardNoticeIndex, setDashboardNoticeIndex] = useState(0);

  const recentProductCards = useMemo(
    () => recentProducts.map((recentProduct) => products.find((product) => product.id === recentProduct.id)).filter(Boolean) as ProductSummary[],
    [products, recentProducts]
  );
  const selectedInvoice = useMemo(
    () => recentInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [recentInvoices, selectedInvoiceId]
  );
  const greetingName = useMemo(() => getDisplayFirstName(ownerName), [ownerName]);
  const allowStaffAccess = planEntitlements ? planEntitlements.staff_access === true : true;
  const allowWhatsappInvoiceSending = planEntitlements ? planEntitlements.whatsapp_invoice_sending === true : true;
  const allowDigitalInvoiceAssets = planEntitlements
    ? planEntitlements.customer_signature === true && planEntitlements.shop_stamp === true
    : true;
  const dashboardNotices = useMemo<DashboardNoticeCard[]>(() => {
    const notices: DashboardNoticeCard[] = [];

    if (stats.lowStockProducts > 0) {
      notices.push({
        id: "low-stock",
        tone: "warning",
        title: "Low stock alert",
        message: `${stats.lowStockProducts} product${stats.lowStockProducts !== 1 ? "s" : ""} running low on stock.`,
        href: shopSlug ? `/${shopSlug}/inventory?filter=low-stock` : "/inventory?filter=low-stock",
        actionLabel: "Add stock",
        icon: Package,
      });
    }

    if (subscriptionNotice) {
      notices.push({
        id: "subscription",
        tone: subscriptionNotice.tone,
        title: subscriptionNotice.title,
        message: subscriptionNotice.message,
        href: subscriptionNotice.href,
        actionLabel: subscriptionNotice.href ? "Manage" : subscriptionNotice.actionLabel,
        icon: CalendarDays,
      });
    }

    return notices;
  }, [shopSlug, stats.lowStockProducts, subscriptionNotice]);

  useEffect(() => {
    setDashboardNoticeIndex((current) => {
      if (dashboardNotices.length === 0) return 0;
      return Math.min(current, dashboardNotices.length - 1);
    });
  }, [dashboardNotices.length]);

  useEffect(() => {
    if (dashboardNotices.length <= 1) return;

    const timer = window.setInterval(() => {
      setDashboardNoticeIndex((current) => (current + 1) % dashboardNotices.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [dashboardNotices.length]);

  useEffect(() => {
    if (!loadError) return;
    toast.error(loadError);
  }, [loadError]);

  // ─── Stamp feature announcement bottom-sheet logic ─────────────────────
  const [showStampDrawer, setShowStampDrawer] = useState(false);

  useEffect(() => {
    const oneHour = 60 * 60 * 1000;

    if (shopStampUrl || !allowDigitalInvoiceAssets) {
      setShowStampDrawer(false);
      return;
    }

    setShowStampDrawer(true);

    const reminderId = window.setInterval(() => {
      setShowStampDrawer(true);
    }, oneHour);

    return () => window.clearInterval(reminderId);
  }, [shopStampUrl, allowDigitalInvoiceAssets]);

  function dismissStampDrawer() {
    setShowStampDrawer(false);
  }

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

  function handleRecordSale(productId: string) {
    prefetchProduct(productId);
    setSaleProductId(productId);
  }

  function handleAddStock(productId: string) {
    prefetchProduct(productId);
    setAdjustmentMode("ADJUSTMENT_ADD");
    setAdjustmentProductId(productId);
  }

  function handleAdjustStock(productId: string) {
    prefetchProduct(productId);
    setAdjustmentMode("ADJUSTMENT_REMOVE");
    setAdjustmentProductId(productId);
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


  function confirmDeleteInvoice(restockItems: boolean = true) {
    if (!confirmDeleteInvoiceId) return;
    const invoiceId = confirmDeleteInvoiceId;
    setDeletingInvoiceId(invoiceId);
    startDeleteTransition(async () => {
      const result = await deleteInvoiceAction(invoiceId, restockItems);
      if (result.status === "success") {
        toast.success(result.message);
        if (selectedInvoiceId === invoiceId) {
          setSelectedInvoiceId(null);
        }
        setDeletedInvoiceIds((prev) => new Set(prev).add(invoiceId));
        setConfirmDeleteInvoiceId(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setDeletingInvoiceId(null);
    });
  }

  async function handleDownloadInvoice(invoice: PrintableInvoice, withAssets = false) {
    try {
      await downloadInvoicePdf({
        ...invoice,
        shop_logo_url: shopLogoUrl ?? null,
        shop_postal_code: shopPostalCode ?? null,
        shop_stamp_url: withAssets ? (shopStampUrl ?? null) : null,
        customer_signature_url: withAssets ? (invoice.customer_signature_url ?? null) : null,
      });
    } catch (err) {
      console.error("[Download] PDF generation failed:", err);
      toast.error(`Download failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function sendInvoiceToCustomer(invoice: SendableInvoiceInput) {
    if (!allowWhatsappInvoiceSending) {
      toast.error("WhatsApp invoice sending is included in Pro only.");
      return;
    }
    setSendingWhatsappInvoiceId(invoice.id);
    try {
      const result = await sendInvoiceWhatsappWithFreshPdf({
        invoice,
        shopLogoUrl,
        shopPostalCode,
        shopStampUrl,
      });

      if (result.status === "success") {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error("[WhatsApp] Invoice send failed:", err);
      toast.error(`WhatsApp send failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSendingWhatsappInvoiceId(null);
    }
  }

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

        .dash-bill-list {
          overflow: visible;
          border-radius: 20px;
          border: 1px solid #f1f1f3;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          margin-bottom: 20px;
        }
        .dash-card {
          background: #ffffff;
          padding: 15px 14px 13px;
          position: relative;
          overflow: visible;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .dash-card:hover {
          background: #fafafa;
        }
        .dash-card + .dash-card {
          border-top: 1px solid #f1f1f3;
        }
        .dash-card:active { background: #f6f6f7; }

        .dash-card-topbar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 3.5px;
          border-radius: 2px;
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
        .dash-subscription-alert {
          border-radius: 18px;
          padding: 13px 14px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 14px;
          border: 1.5px solid;
        }
        .dash-notice-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 32px;
          border-radius: 999px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 900;
          color: #ffffff;
          text-decoration: none;
          white-space: nowrap;
          box-shadow: 0 8px 18px rgba(15,23,42,0.12);
        }
      `}</style>

      {dashboardNotices.length > 0 ? (
        <div className="dash-root px-2 pb-1">
          <DashboardNoticeCarousel
            notices={dashboardNotices}
            activeIndex={dashboardNoticeIndex}
            onSelect={setDashboardNoticeIndex}
          />
        </div>
      ) : null}

      <div className="dash-root -mx-3 px-2">
        {/* Greeting — same row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "10px 2px 18px", minWidth: 0, flexWrap: "nowrap" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#a1a1aa", whiteSpace: "nowrap", flexShrink: 0 }}>
            {getGreeting()}
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: "#18181b",
              letterSpacing: "-0.02em",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {greetingName}
          </span>
        </div>

        {/* Low Stock Alert */}
        {loadError ? (
          <div className="dash-alert" style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#b91c1c", marginBottom: 14 }}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{loadError}</span>
          </div>
        ) : null}

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
            onClick={() => {
              setEditingProductId(null);
              setIsAddProductOpen(true);
            }}
            className="dash-chip"
            style={{ background: "#f4f4f5", color: "#18181b", border: "1.5px solid #e4e4e7" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add Product
          </button>
          <button
            type="button"
            onClick={() => {
              if (!allowStaffAccess) {
                toast.error("Staff access is included in Growth and Pro.");
                return;
              }
              setIsInviteStaffOpen(true);
            }}
            disabled={!allowStaffAccess}
            className="dash-chip"
            style={{
              background: "#f4f4f5",
              color: allowStaffAccess ? "#18181b" : "#a1a1aa",
              border: "1.5px solid #e4e4e7",
              opacity: allowStaffAccess ? 1 : 0.7,
            }}
          >
            <Plus style={{ width: 14, height: 14 }} /> {allowStaffAccess ? "Add Staff" : "Staff in Growth"}
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
              <Link href={shopSlug ? `/${shopSlug}/billing` : "/billing"} style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                View all <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>
            <div className="dash-bill-list">
              {recentInvoices.filter(i => !deletedInvoiceIds.has(i.id)).map((invoice, i) => {
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <article key={invoice.id} className="dash-card" style={{ zIndex: (openDropdownId === invoice.id || openDownloadDropdownId === invoice.id) ? 50 : 1 }} onClick={() => setSelectedInvoiceId(invoice.id)}>
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
                        {formatRelativeInvoiceDate(invoice.invoice_date)}
                      </span>
                    </div>

                    {/* Row 2 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                          <ShoppingBag style={{ width: 12, height: 12, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {invoice.invoice_items?.[0]?.product_name_snapshot ?? "Unknown item"}
                            {(invoice.invoice_items?.length ?? 0) > 1 ? ` +${invoice.invoice_items!.length - 1}` : ""}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, paddingLeft: 17, fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {getBillPaymentLabel(invoice)}
                        </div>
                      </div>
                      <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.025em", color: "#18181b", flexShrink: 0 }}>
                        ₹{formatSafeAmount(invoice.grand_total)}
                      </div>
                    </div>
                    {/* Row 3 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, marginTop: 12 }}>
                      {invoice.customer_mobile ? (
                        <a
                          href={`tel:${invoice.customer_mobile}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Call customer"
                          title="Call customer"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, background: "#eff6ff", color: "#2563eb", textDecoration: "none" }}
                        >
                          <PhoneCall style={{ width: 11, height: 11 }} />
                        </a>
                      ) : null}

                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Download bill"
                          title="Download options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDownloadDropdownId(openDownloadDropdownId === invoice.id ? null : invoice.id);
                          }}
                          style={{ display: "inline-flex", alignItems: "center", justifyItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, background: "#f4f4f5", color: "#52525b", border: "none" }}
                        >
                          <Download style={{ width: 12, height: 12 }} />
                        </button>
                        {openDownloadDropdownId === invoice.id && (
                          <div className="absolute right-0 top-10 z-[60] w-52 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setOpenDownloadDropdownId(null);
                                const safeName = (invoice.customer_name || "customer").trim().toLowerCase().replace(/[^a-z0-9]/g, "-");
                                const success = invoice.send_ready_pdf_url 
                                  ? await downloadExternalPdf(invoice.send_ready_pdf_url, `${safeName}-bill.pdf`)
                                  : false;
                                
                                if (!success) {
                                  console.log("[Download] Online copy failed, falling back to local generation...");
                                  handleDownloadInvoice(invoice, true);
                                }
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
                                handleDownloadInvoice(invoice, false);
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId(openDropdownId === invoice.id ? null : invoice.id);
                          }}
                          style={{ padding: "8px", background: "transparent", color: "#52525b", border: "none", cursor: "pointer" }}
                          aria-label="More options"
                        >
                          <MoreVertical style={{ width: 14, height: 14 }} />
                        </button>
                        {openDropdownId === invoice.id && (
                          <div className="absolute right-0 top-10 z-[60] w-52 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
                            <button
                              type="button"
                              disabled={!allowWhatsappInvoiceSending || sendingWhatsappInvoiceId === invoice.id}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (allowWhatsappInvoiceSending) {
                                  await sendInvoiceToCustomer(invoice);
                                }
                                setOpenDropdownId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {sendingWhatsappInvoiceId === invoice.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              {allowWhatsappInvoiceSending
                                ? sendingWhatsappInvoiceId === invoice.id
                                  ? "Sending..."
                                  : "Send invoice"
                                : "Pro only"}
                            </button>
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

        {/* Recently Added Products — same card as inventory page */}
        {recentProducts.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p className="dash-section-label" style={{ marginBottom: 0 }}>Recent Products</p>
              <Link href={shopSlug ? `/${shopSlug}/inventory` : "/inventory"} style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                View all <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>
            <div className="overflow-visible rounded-2xl border border-stone-100 bg-white shadow-sm" style={{ marginBottom: 20 }}>
              {recentProductCards.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isLast={index === recentProductCards.length - 1}
                  deletingProductId={isDeleting ? deletingProductId : null}
                  onProductClick={handleProductClick}
                  onProductHover={prefetchProduct}
                  onProductEdit={handleProductEdit}
                  onProductDelete={handleDelete}
                  onAddStock={handleAddStock}
                  onRecordSale={handleRecordSale}
                  onAdjustStock={handleAdjustStock}
                />
              ))}
            </div>
          </>
        )}

        {/* Spacer for bottom nav */}
        <div style={{ height: 20 }} />
      </div>

      {/* Modals */}
      <AddBillModal
          resumeDraft={resumeBillDraft}
        open={isAddBillOpen || !!editingInvoice}
        onClose={() => {
          setIsAddBillOpen(false);
          setEditingInvoice(null);
        }}
        invoiceToEdit={editingInvoice}
        products={products}
        shopLogoUrl={shopLogoUrl}
        shopPostalCode={shopPostalCode}
        shopStampUrl={shopStampUrl}
        settingsHref={shopSlug ? `/${shopSlug}/settings#stamp` : "/settings#stamp"}
        allowDigitalInvoiceAssets={allowDigitalInvoiceAssets}
        allowWhatsappInvoiceSending={allowWhatsappInvoiceSending}
        onInvoiceCreated={() => router.refresh()}
        onOpenAddProduct={() => setIsAddProductOpen(true)}
      />

      {isAddProductOpen ? (
        <AddProductModal
          open={isAddProductOpen}
          mode={editingProductId ? "edit" : "create"}
          productId={editingProductId}
          onClose={() => {
            setIsAddProductOpen(false);
            setEditingProductId(null);
          }}
          onSaved={async () => {
            router.refresh();
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
        onAdjustStock={handleAdjustStock}
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

      {adjustmentProductId ? (
        <StockAdjustmentModal
          key={`${adjustmentProductId}-${adjustmentMode}`}
          open
          productId={adjustmentProductId}
          initialAdjustmentType={adjustmentMode}
          onClose={() => setAdjustmentProductId(null)}
          onAdjusted={async () => {
            router.refresh();
            if (adjustmentProductId) {
              await queryClient.invalidateQueries({ queryKey: ["inventory", "product-details", adjustmentProductId] });
            }
          }}
        />
      ) : null}

      <BillDetailsDrawer
        invoice={selectedInvoice ? { ...selectedInvoice, shop_logo_url: shopLogoUrl ?? null } : null}
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoiceId(null)}
        onDownload={handleDownloadInvoice}
        onSendInvoice={allowWhatsappInvoiceSending ? sendInvoiceToCustomer : undefined}
        isSendingInvoice={selectedInvoice ? sendingWhatsappInvoiceId === selectedInvoice.id : false}
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
        onProductClick={handleProductClick}
        onProductHover={prefetchProduct}
      />

      {confirmDeleteProductId ? (
        <DeleteConfirmationDialog
          isDeleting={isDeleting && deletingProductId === confirmDeleteProductId}
          title="Delete Product"
          description="This will permanently remove the product and its related data. This action cannot be undone."
          onCancel={() => setConfirmDeleteProductId(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

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

      <InviteStaffModal
        isOpen={isInviteStaffOpen}
        onClose={() => setIsInviteStaffOpen(false)}
      />

      {/* Stamp feature announcement — bottom sheet */}
      {showStampDrawer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {/* Backdrop */}
          <div
            onClick={dismissStampDrawer}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(28, 25, 23, 0.5)",
              backdropFilter: "blur(4px)",
            }}
          />
          {/* Sheet */}
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 480,
              background: "#ffffff",
              borderRadius: "24px 24px 0 0",
              padding: "28px 24px 32px",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.12)",
              animation: "slideUp 0.3s ease-out",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d6d3d1" }} />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)",
                flexShrink: 0,
              }}>
                <Stamp style={{ width: 22, height: 22, color: "#7c3aed" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1c1917", lineHeight: 1.3 }}>
                  New Feature: Shop Stamp & Signature
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>
                  Upload your official stamp and signature to automatically affix them on all your PDF invoices. Make your bills look professional!
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={dismissStampDrawer}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1.5px solid #e7e5e4",
                  background: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#57534e",
                  cursor: "pointer",
                }}
              >
                Maybe Later
              </button>
              <Link
                href={shopSlug ? `/${shopSlug}/settings#stamp` : "/settings#stamp"}
                onClick={dismissStampDrawer}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "none",
                  background: "#1c1917",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#ffffff",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Set Up Now
                <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </div>
          </div>

          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
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
