import type { SalesRow } from "./data";
export function summarizeSales(rows: SalesRow[]) {
  const included = rows.filter(row => row.payment_status !== "CANCELLED");
  const total = included.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  return {
    invoices: included.length, total,
    paid: included.filter(row => row.payment_status === "PAID").reduce((sum, row) => sum + Number(row.grand_total || 0), 0),
    pending: included.filter(row => ["UNPAID", "PARTIAL"].includes(row.payment_status)).length,
    cancelled: rows.length - included.length,
    average: included.length ? total / included.length : 0,
  };
}
export function salesByDay(rows: SalesRow[]) {
  const days = new Map<string, number>();
  for (const row of rows) {
    if (row.payment_status === "CANCELLED") continue;
    const day = new Date(new Date(row.invoice_date).getTime() + 330 * 60000).toISOString().slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + Number(row.grand_total || 0));
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}
