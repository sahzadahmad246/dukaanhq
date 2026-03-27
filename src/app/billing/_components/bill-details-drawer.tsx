"use client";

import { format } from "date-fns";
import { Printer, Receipt, X } from "lucide-react";

import type { PrintableInvoice } from "./invoice-print";

type InvoiceDetails = PrintableInvoice & {
  id: string;
  notes?: string | null;
};

function money(value: number) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function buildLineMeta(parts: Array<string | null | undefined>) {
  const filtered = parts.filter(Boolean);
  return filtered.length > 0 ? filtered.join(" • ") : null;
}

export function BillDetailsDrawer({
  invoice,
  open,
  onClose,
  onReprint,
}: {
  invoice: InvoiceDetails | null;
  open: boolean;
  onClose: () => void;
  onReprint: (invoice: PrintableInvoice) => void;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[88vh] flex-col rounded-t-[2rem] bg-[#fffdf8] shadow-[0_-20px_60px_rgba(0,0,0,0.12)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-20 sm:h-[calc(100vh-6rem)] sm:w-[450px] sm:rounded-[2rem] ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"}`}
      >
        <div className="flex items-center justify-between border-b border-stone-200 bg-[#fffdf8] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Bill Details</h2>
            {invoice ? <p className="mt-1 text-xs text-stone-500">{invoice.invoice_number}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {invoice ? (
              <button
                type="button"
                onClick={() => onReprint(invoice)}
                className="flex h-10 items-center gap-2 rounded-full bg-stone-950 px-4 text-sm font-medium text-white"
              >
                <Printer className="h-4 w-4" />
                Reprint
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
              aria-label="Close bill details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!invoice ? null : (
            <div className="space-y-5">
              <section className="rounded-[1.6rem] border border-stone-200 bg-gradient-to-br from-white via-[#fff9ef] to-[#f6efe4] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Retail Bill</div>
                    <div className="mt-2 text-2xl font-semibold text-stone-950">{invoice.invoice_number}</div>
                    <div className="mt-2 text-sm text-stone-600">{format(new Date(invoice.invoice_date), "dd MMM yyyy, h:mm a")}</div>
                  </div>
                  <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-stone-700 shadow-sm">
                    {invoice.payment_method ?? "CASH"}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/80 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Customer</div>
                    <div className="mt-2 font-semibold text-stone-950">{invoice.customer_name}</div>
                    <div className="mt-1 text-stone-600">{invoice.customer_mobile || "No mobile"}</div>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Status</div>
                    <div className="mt-2 font-semibold text-stone-950">{invoice.payment_status ?? "PAID"}</div>
                    <div className="mt-1 text-stone-600">Total {money(invoice.grand_total)}</div>
                  </div>
                </div>

                {invoice.billing_address ? (
                  <div className="mt-4 rounded-2xl bg-white/70 p-3 text-sm text-stone-600">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Billing Address</div>
                    <div className="mt-2 whitespace-pre-line">{invoice.billing_address}</div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-[1.6rem] border border-stone-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <Receipt className="h-4 w-4" />
                  Bill Items
                </div>
                <div className="mt-4 space-y-3">
                  {(invoice.invoice_items ?? []).map((item, index) => (
                    <div key={`${invoice.id}-${index}`} className="rounded-2xl bg-stone-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-stone-950">{item.product_name_snapshot}</div>
                          {buildLineMeta([item.brand_name_snapshot, item.variant_name_snapshot, item.identifier_snapshot]) ? (
                            <div className="mt-1 text-xs text-stone-500">
                              {buildLineMeta([item.brand_name_snapshot, item.variant_name_snapshot, item.identifier_snapshot])}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right text-sm font-semibold text-stone-950">{money(item.line_total)}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                        <span>Qty {item.quantity}</span>
                        <span>Rate {money(item.unit_price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.6rem] border border-stone-200 bg-white p-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Subtotal</span>
                    <span>{money(invoice.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Discount</span>
                    <span>{money(invoice.discount_total)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-base font-semibold text-stone-950">
                    <span>Grand Total</span>
                    <span>{money(invoice.grand_total)}</span>
                  </div>
                </div>
              </section>

              {invoice.notes ? (
                <section className="rounded-[1.6rem] border border-stone-200 bg-white p-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Notes</div>
                  <div className="mt-2 whitespace-pre-line text-sm text-stone-600">{invoice.notes}</div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
