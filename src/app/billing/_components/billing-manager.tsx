"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronUp, Printer, Receipt, Wallet } from "lucide-react";
import { format } from "date-fns";

import type { Product } from "@/lib/types/inventory";
import { matchesSearch } from "@/app/inventory/inventory-utils";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showHeader, setShowHeader] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) =>
        matchesSearch(
          [invoice.invoice_number, invoice.customer_name, invoice.customer_mobile, invoice.payment_method].filter(Boolean).join(" "),
          searchQuery
        )
      ),
    [invoices, searchQuery]
  );

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId]
  );

  const stats = useMemo(
    () => ({
      count: invoices.length,
      totalValue: invoices.reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0),
      paidCount: invoices.filter((invoice) => invoice.payment_status === "PAID").length,
    }),
    [invoices]
  );

  function reprintInvoice(invoice: PrintableInvoice) {
    printInvoice({ ...(invoice as PrintableInvoice), shop_logo_url: shopLogoUrl ?? null });
  }

  return (
    <>
      <div className={`fixed inset-x-0 top-0 z-40 transition-transform duration-300 ${showHeader ? "translate-y-0" : "-translate-y-full"}`}>
        <div className="mx-auto w-full max-w-lg border-b border-stone-200 bg-[#f7f8fb]/95 px-3 py-3 backdrop-blur">
          <InventoryTopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} onBack={() => router.back()} onAdd={() => setIsAddBillOpen(true)} />
        </div>
      </div>

      <div className="h-14" />

      <section className="space-y-4">
        <div className="rounded-[1.8rem] border border-stone-200 bg-gradient-to-br from-[#fffdf8] via-[#fef6eb] to-[#efe9ff] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Billing Desk</p>
              <h1 className="mt-2 text-2xl font-semibold text-stone-950">Invoices and reprints</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Open any bill to inspect line items, customer details, and print a clean copy from saved invoice data.
              </p>
            </div>
            <div className="rounded-2xl bg-white/85 px-4 py-3 text-right shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Collected</div>
              <div className="mt-1 text-lg font-semibold text-stone-950">Rs {stats.totalValue.toFixed(2)}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                <Receipt className="h-3.5 w-3.5" />
                Bills
              </div>
              <div className="mt-2 text-xl font-semibold text-stone-950">{stats.count}</div>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                <Wallet className="h-3.5 w-3.5" />
                Paid
              </div>
              <div className="mt-2 text-xl font-semibold text-stone-950">{stats.paidCount}</div>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Search</div>
              <div className="mt-2 text-sm font-medium text-stone-950">{searchQuery ? "Filtered" : "All bills"}</div>
            </div>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-stone-300 bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-sm font-medium text-stone-900">No bills found</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Create a bill from the plus button, then come back here to view details and print copies later.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <article
                key={invoice.id}
                className="rounded-[1.6rem] border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                          {invoice.payment_status}
                        </span>
                        <span className="text-[11px] text-stone-500">{format(new Date(invoice.invoice_date), "dd MMM yyyy")}</span>
                      </div>
                      <div className="mt-3 text-base font-semibold text-stone-950">{invoice.invoice_number}</div>
                      <div className="mt-1 text-sm text-stone-700">{invoice.customer_name}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {[invoice.customer_mobile, `${invoice.invoice_items?.length ?? 0} items`].filter(Boolean).join(" • ")}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-semibold text-stone-950">Rs {Number(invoice.grand_total).toFixed(2)}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">{invoice.payment_method}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
                    <span>Tap to view full bill</span>
                    <span className="inline-flex items-center gap-1 font-medium text-stone-700">
                      View details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => reprintInvoice(invoice)}
                    className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-200"
                  >
                    <Printer className="h-4 w-4" />
                    Reprint
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AddBillModal
        open={isAddBillOpen}
        onClose={() => setIsAddBillOpen(false)}
        products={products}
        shopLogoUrl={shopLogoUrl}
        onInvoiceCreated={() => router.refresh()}
      />

      <BillDetailsDrawer
        invoice={selectedInvoice ? { ...selectedInvoice, shop_logo_url: shopLogoUrl ?? null } : null}
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoiceId(null)}
        onReprint={reprintInvoice}
      />

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
