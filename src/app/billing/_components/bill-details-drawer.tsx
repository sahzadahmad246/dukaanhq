"use client";

import { format } from "date-fns";
import { Download, MoreVertical, Pencil, PhoneCall, Receipt, Trash2, X } from "lucide-react";
import { useState } from "react";

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

function buildPaymentMeta(invoice: InvoiceDetails) {
  const methods = invoice.payment_details?.methods?.filter(Boolean) ?? [];
  const methodText = methods.length > 0 ? methods.join(", ") : invoice.payment_method ?? "CASH";
  const extra = [
    invoice.payment_details?.loan_provider ? `Provider: ${invoice.payment_details.loan_provider}` : null,
    invoice.payment_details?.loan_number ? `Loan No: ${invoice.payment_details.loan_number}` : null,
  ].filter(Boolean);

  return { methodText, extra };
}

function isFreeQuickItem(item: NonNullable<InvoiceDetails["invoice_items"]>[number]) {
  return !item.product_id && Number(item.line_total ?? 0) === 0 && Number(item.unit_price ?? 0) > 0;
}

export function BillDetailsDrawer({
  invoice,
  open,
  onClose,
  onDownload,
  onEdit,
  onDelete,
  onProductClick,
  onProductHover,
}: {
  invoice: InvoiceDetails | null;
  open: boolean;
  onClose: () => void;
  onDownload: (invoice: PrintableInvoice) => void;
  onEdit: (invoice: InvoiceDetails) => void;
  onDelete: (invoiceId: string) => void;
  onProductClick?: (productId: string) => void;
  onProductHover?: (productId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

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
              <>
                {invoice.customer_mobile ? (
                  <a
                    href={`tel:${invoice.customer_mobile}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
                    aria-label="Call customer"
                    title="Call customer"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => onDownload(invoice)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
                  aria-label="Download bill"
                  title="Download bill"
                >
                  <Download className="h-4 w-4" />
                </button>
                
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
                    aria-label="More options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-12 z-[60] w-36 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onEdit(invoice);
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
                          setShowMenu(false);
                          onDelete(invoice.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                  {showMenu && (
                    <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)} />
                  )}
                </div>
              </>
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
              {(() => {
                const paymentMeta = buildPaymentMeta(invoice);

                return (
              <section className="rounded-[1.6rem] border border-stone-200 bg-gradient-to-br from-white via-[#fff9ef] to-[#f6efe4] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Retail Bill</div>
                    <div className="mt-2 text-2xl font-semibold text-stone-950">{invoice.invoice_number}</div>
                    <div className="mt-2 text-sm text-stone-600">{format(new Date(invoice.invoice_date), "dd MMM yyyy, h:mm a")}</div>
                  </div>
                  <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-stone-700 shadow-sm">
                    {paymentMeta.methodText}
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
                );
              })()}

              <section className="rounded-[1.6rem] border border-stone-200 bg-white p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Payment Details</div>
                <div className="mt-3 rounded-2xl bg-stone-50 p-3">
                  <div className="text-sm font-semibold text-stone-950">{buildPaymentMeta(invoice).methodText}</div>
                  {buildPaymentMeta(invoice).extra.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-stone-600">
                      {buildPaymentMeta(invoice).extra.map((entry) => (
                        <div key={entry}>{entry}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
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
                          <div className="flex flex-wrap items-center gap-2">
                            <button 
                              type="button" 
                              className={`text-sm font-semibold text-left transition ${item.product_id ? "text-stone-900 hover:text-stone-600 hover:underline cursor-pointer" : "text-stone-950"}`}
                              onClick={() => { if (item.product_id && onProductClick) onProductClick(item.product_id); }}
                              onMouseEnter={() => { if (item.product_id && onProductHover) onProductHover(item.product_id); }}
                            >
                              {item.product_name_snapshot}
                            </button>
                            {!item.product_id ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                                Quick Add
                              </span>
                            ) : null}
                            {isFreeQuickItem(item) ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                Free
                              </span>
                            ) : null}
                          </div>
                          {buildLineMeta([item.brand_name_snapshot, item.variant_name_snapshot, item.identifier_snapshot]) ? (
                            <div className="mt-1 text-xs text-stone-500">
                              {buildLineMeta([item.brand_name_snapshot, item.variant_name_snapshot, item.identifier_snapshot])}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          {isFreeQuickItem(item) ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-stone-400 line-through">
                                {money(item.quantity * item.unit_price)}
                              </div>
                              <div className="text-sm font-semibold text-emerald-700">Free</div>
                            </div>
                          ) : (
                            <div className="text-sm font-semibold text-stone-950">{money(item.line_total)}</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                        <span>Qty {item.quantity}</span>
                        {isFreeQuickItem(item) ? (
                          <span className="font-medium">
                            <span className="line-through text-stone-400">{money(item.unit_price)}</span>{" "}
                            <span className="text-emerald-700">Free</span>
                          </span>
                        ) : (
                          <span>Rate {money(item.unit_price)}</span>
                        )}
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
