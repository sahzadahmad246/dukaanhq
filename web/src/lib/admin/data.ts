import "server-only";
import { getAdminReadClient } from "./auth";
import { reportStart } from "./format";

export type SalesRow = { id: string; shop_id: string; invoice_date: string; grand_total: number | string; payment_status: string };
export function checkAdminQuery(error: { message: string } | null, label: string) {
  if (error) { console.error(`Admin ${label}:`, error.message); throw new Error(`Could not load ${label}. Please try again.`); }
}

// Read every page, rather than silently using the database's first 1,000 rows.
// Only reporting columns and the selected time window travel over the network.
export async function loadSales(days: number, shopId?: string) {
  const db = await getAdminReadClient();
  const start = reportStart(days);
  const end = new Date().toISOString();
  const rows: SalesRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("invoices").select("id, shop_id, invoice_date, grand_total, payment_status")
      .gte("invoice_date", start).lte("invoice_date", end).order("invoice_date").order("id").range(offset, offset + 999);
    if (shopId) query = query.eq("shop_id", shopId);
    const { data, error } = await query;
    checkAdminQuery(error, "sales report");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}
