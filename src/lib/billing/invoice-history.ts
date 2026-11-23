import { z } from "zod";
import type { BillingInvoiceSummary } from "@/app/billing/load-billing-data";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export const INVOICE_BATCH_SIZE = 30;
export const InvoiceHistoryRequestSchema = z.object({
  shopId: z.string().uuid(),
  isSecondHand: z.boolean().default(false),
  search: z.string().trim().max(200).default(""),
  period: z.enum(["all", "today", "week", "month"]).default("all"),
  cursor: z.object({ date: z.iso.datetime({ offset: true }), id: z.string().uuid() }).nullable().default(null),
});
export type InvoiceHistoryRequest = z.infer<typeof InvoiceHistoryRequestSchema>;
export type InvoiceHistoryPage = {
  invoices: BillingInvoiceSummary[];
  nextCursor: { date: string; id: string } | null;
  summary: { count: number; totalValue: number; avgValue: number } | null;
};
export const EMPTY_INVOICE_HISTORY: InvoiceHistoryPage = {
  invoices: [], nextCursor: null, summary: { count: 0, totalValue: 0, avgValue: 0 },
};

export function invoiceHistoryStartDate(period: InvoiceHistoryRequest["period"], now = new Date()) {
  if (period === "all") return null;
  const indiaDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${indiaDate}T00:00:00+05:30`);
  if (period === "week") {
    const day = new Date(`${indiaDate}T00:00:00Z`).getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
  } else if (period === "month") {
    return new Date(`${indiaDate.slice(0, 8)}01T00:00:00+05:30`).toISOString();
  }
  return start.toISOString();
}

export function mergeInvoiceHistoryPages(pages: InvoiceHistoryPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.invoices.filter((invoice) => {
    if (seen.has(invoice.id)) return false;
    seen.add(invoice.id);
    return true;
  }));
}

export async function readInvoiceHistoryPage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  request: InvoiceHistoryRequest,
): Promise<InvoiceHistoryPage> {
  const { data, error } = await supabase.rpc("list_shop_invoice_history", {
    p_shop_id: request.shopId,
    p_is_second_hand: request.isSecondHand,
    p_search: request.search,
    p_from: invoiceHistoryStartDate(request.period),
    p_cursor_date: request.cursor?.date ?? null,
    p_cursor_id: request.cursor?.id ?? null,
    p_limit: INVOICE_BATCH_SIZE,
    p_include_summary: request.cursor === null,
  });
  if (error || !data) throw new Error("Could not load bill history. Please try again. Check that migration 045 has been applied.");
  const page = data as InvoiceHistoryPage;
  return {
    ...page,
    invoices: page.invoices.map((invoice) => ({ ...invoice,
      send_ready_pdf_url: (invoice as BillingInvoiceSummary & { invoice_pdf_url?: string | null }).invoice_pdf_url ?? null,
    })),
  };
}
