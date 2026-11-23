"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Plus, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BillingManager } from "@/app/billing/_components/billing-manager";
import { AddBillModal, type InitialBillStock } from "@/app/billing/_components/add-bill-modal";
import type { loadBillingData } from "@/app/billing/load-billing-data";
import type { SecondHandPurchase, SecondHandUnit } from "@/lib/types/second-hand";
import { buildShopRoute } from "@/lib/shop-routes";
import { matchesSearch } from "@/app/inventory/inventory-utils";
import { useBillFormSession } from "@/lib/hooks/use-bill-form-session";
import { AddPhoneModal } from "./add-phone-modal";
import { getPurchaseInvoiceAction } from "../actions";

type BillingData = Awaited<ReturnType<typeof loadBillingData>>;
type Props = Pick<BillingData, "products" | "invoices" | "invoiceHistory" | "categories" | "brands" | "planEntitlements"> & {
  shopId: string;
  purchases: SecondHandPurchase[];
  units: SecondHandUnit[];
  shopSlug: string;
  shopLogoUrl: string | null;
  shopPostalCode: string | null;
  shopStampUrl: string | null;
  activeTab: "stock" | "bills";
};

const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

export function SecondHandManager({ products, invoices, invoiceHistory, shopId, categories, brands, planEntitlements, purchases, units,
  shopSlug, shopLogoUrl, shopPostalCode, shopStampUrl, activeTab }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("IN_STOCK");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openingInvoice, setOpeningInvoice] = useState<string | null>(null);
  const [initialStock, setInitialStock] = useState<InitialBillStock>();
  const [billOpen, setBillOpen, resumeDraft] = useBillFormSession();
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const baseHref = buildShopRoute(shopSlug, "second-hand");
  const allowDigital = planEntitlements ? planEntitlements.customer_signature === true && planEntitlements.shop_stamp === true : true;
  const allowWhatsapp = planEntitlements ? planEntitlements.whatsapp_invoice_sending === true : true;
  const settingsHref = `${buildShopRoute(shopSlug, "settings")}#stamp`;
  const rows = useMemo(() => purchases.flatMap((purchase) => {
    const product = products.find((product) => product.id === purchase.product_id);
    const unit = units.find((unit) => unit.product_id === purchase.product_id);
    if (!product || !unit) return [];
    return [{ purchase, product, unit, status: unit.status }];
  }), [purchases, products, units]);
  const visible = rows.filter(({ purchase, product, unit, status }) => (filter === "ALL" || status === filter) &&
    matchesSearch([product.name, product.brand?.name, product.variants?.[0]?.storage_label, product.variants?.[0]?.color,
      unit.imei_1, unit.imei_2, purchase.seller_name, purchase.seller_phone].filter(Boolean).join(" "), query));

  async function openOriginalInvoice(purchase: SecondHandPurchase) {
    // Open synchronously so browsers do not block the tab after the server response.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpeningInvoice(purchase.id);
    try {
      const result = await getPurchaseInvoiceAction(purchase.id);
      if (result.url) { if (tab) tab.location.href = result.url; else window.location.assign(result.url); }
      else { tab?.close(); toast.error(result.message); }
    } catch { tab?.close(); toast.error("Could not open the original invoice."); }
    finally { setOpeningInvoice(null); }
  }

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Second-hand phones</h1><p className="mt-1 text-sm text-stone-500">Purchases, stock and bills in one place.</p></div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0"><Plus className="mr-1 h-4 w-4" />Add phone</Button>
      </div>
      <div className="grid grid-cols-2 rounded-2xl bg-stone-200/60 p-1" aria-label="Second-hand phone sections">
        {([['stock', 'Stock'], ['bills', 'Bills']] as const).map(([tab, label]) => (
          <Link key={tab} href={tab === "stock" ? baseHref : `${baseHref}?tab=bills`} aria-current={activeTab === tab ? "page" : undefined}
            className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${activeTab === tab ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"}`}>{label}</Link>
        ))}
      </div>
      {activeTab === "bills" ? (
        <BillingManager products={products} invoiceHistory={invoiceHistory} shopId={shopId} categories={categories} brands={brands}
          shopLogoUrl={shopLogoUrl} shopPostalCode={shopPostalCode} shopStampUrl={shopStampUrl}
          settingsHref={settingsHref} allowDigitalInvoiceAssets={allowDigital} allowWhatsappInvoiceSending={allowWhatsapp}
          isSecondHand embedded onAddStock={() => setAddOpen(true)} />
      ) : <>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">Available</p><p className="mt-1 text-2xl font-bold">{rows.filter((row) => row.status === "IN_STOCK").length}</p></div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">Sold</p><p className="mt-1 text-2xl font-bold">{rows.filter((row) => row.status === "SOLD").length}</p></div>
        </div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" /><Input aria-label="Search second-hand phones" value={query} onChange={(event) => setQuery(event.target.value)} className="bg-white pl-9" placeholder="Search phone, IMEI or seller" /></div>
        <div className="flex gap-2" aria-label="Stock status">
          {([['IN_STOCK', 'Available'], ['SOLD', 'Sold'], ['ALL', 'All']] as const).map(([id, label]) => <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`rounded-full px-4 py-2 text-sm font-medium ${filter === id ? "bg-stone-950 text-white" : "border border-stone-200 bg-white text-stone-600"}`}>{label}</button>)}
        </div>
        <div className="space-y-3">
          {visible.map(({ purchase, product, unit, status }) => {
            const variant = product.variants?.[0];
            const sale = invoices.find((invoice) => invoice.invoice_items?.some((item) => item.inventory_item_id === unit.id));
            const expanded = expandedId === purchase.id;
            return <article key={purchase.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{[product.brand?.name, product.name].filter(Boolean).join(" ")}</h2><p className="mt-1 text-sm text-stone-500">{[variant?.storage_label, variant?.color].filter(Boolean).join(" · ")}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status === "IN_STOCK" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{status === "IN_STOCK" ? "Available" : status.replaceAll("_", " ").toLowerCase()}</span></div>
                <div className="text-sm text-stone-600"><p>IMEI 1: <span className="font-mono">{unit.imei_1}</span></p>{unit.imei_2 && <p>IMEI 2: <span className="font-mono">{unit.imei_2}</span></p>}</div>
                <div className="flex items-center justify-between gap-2"><p className="text-lg font-bold">{currency(product.base_selling_price)}</p>{status === "IN_STOCK" && <Button onClick={() => {
                  setInitialStock({ product_id: product.id, variant_id: unit.variant_id ?? "", inventory_item_id: unit.id,
                    imei_1: unit.imei_1 ?? "", imei_2: unit.imei_2 ?? "", unit_price: String(product.base_selling_price) });
                  setBillOpen(true);
                }}><FileText className="mr-1.5 h-4 w-4" />Create bill</Button>}</div>
                {sale && <Link href={`${baseHref}?tab=bills&q=${encodeURIComponent(sale.invoice_number)}`} className="block text-sm font-medium text-emerald-700">Bill {sale.invoice_number} · {sale.customer_name}</Link>}
                {status === "SOLD" && !sale && <Link href={`${baseHref}?tab=bills&q=${encodeURIComponent(unit.imei_1 ?? "")}`} className="block text-sm font-medium text-emerald-700">View sale bill</Link>}
                <button onClick={() => setExpandedId(expanded ? null : purchase.id)} aria-expanded={expanded} aria-controls={`purchase-${purchase.id}`} className="text-sm font-medium text-stone-600 underline underline-offset-4">{expanded ? "Hide purchase details" : "View purchase details"}</button>
              </div>
              {expanded && <div id={`purchase-${purchase.id}`} className="space-y-2 border-t border-stone-100 bg-stone-50 p-4 text-sm">
                <p><span className="text-stone-500">Seller: </span>{purchase.seller_name} · <a href={`tel:${purchase.seller_phone}`}>{purchase.seller_phone}</a></p>
                <p><span className="text-stone-500">Purchased from: </span>{purchase.purchase_source}</p>
                <p><span className="text-stone-500">Purchase date: </span>{purchase.purchase_date.split("-").reverse().join("/")}</p>
                <p><span className="text-stone-500">Purchase price: </span>{currency(product.base_purchase_price)}</p>
                {purchase.original_invoice_path && <button disabled={openingInvoice === purchase.id} onClick={() => openOriginalInvoice(purchase)} className="inline-flex items-center gap-2 font-medium text-emerald-700">{openingInvoice === purchase.id && <Loader2 className="h-4 w-4 animate-spin" />}View original invoice</button>}
              </div>}
            </article>;
          })}
          {!visible.length && <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center"><Smartphone className="mx-auto mb-3 h-8 w-8 text-stone-400" /><p className="font-semibold">{rows.length ? "No matching phones" : "Add your first second-hand phone"}</p><p className="mt-1 text-sm text-stone-500">{rows.length ? "Try a different search or stock filter." : "Record the seller and phone details to get started."}</p>{!rows.length && <Button className="mt-4" onClick={() => setAddOpen(true)}>Add phone</Button>}</div>}
        </div>
        <AddBillModal open={billOpen} resumeDraft={resumeDraft} initialStock={initialStock} isSecondHand
          onClose={() => { setBillOpen(false); setInitialStock(undefined); }} products={products}
          shopLogoUrl={shopLogoUrl} shopPostalCode={shopPostalCode} shopStampUrl={shopStampUrl}
          settingsHref={settingsHref} allowDigitalInvoiceAssets={allowDigital} allowWhatsappInvoiceSending={allowWhatsapp}
          onInvoiceCreated={() => router.refresh()} />
      </>}
      {addOpen && <AddPhoneModal open brands={brands.map((brand) => brand.name)} purchaseSources={purchases.map((purchase) => purchase.purchase_source)} onClose={closeAdd} onSaved={() => router.refresh()} />}
    </div>
  );
}
