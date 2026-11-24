import Link from "next/link";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery, loadSales } from "@/lib/admin/data";
import { summarizeSales, salesByDay } from "@/lib/admin/sales";
import { adminDate, adminMoney, adminNumber, reportDays, reportStart } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, EmptyState, MetricCards, PeriodPicker } from "../_components/admin-ui";
import { ExportCsv } from "../_components/export-csv";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = reportDays((await searchParams).days);
  const db = await getAdminReadClient();
  const rows = await loadSales(days);
  const totals = summarizeSales(rows);
  const ids = [...new Set(rows.map(row => row.shop_id))];
  const names = new Map<string, { name: string; slug: string }>();
  // Batch long IN filters to keep query URLs bounded.
  for (let start = 0; start < ids.length; start += 100) {
    const result = await db.from("shops").select("id, name, slug").in("id", ids.slice(start, start + 100));
    checkAdminQuery(result.error, "report shops");
    result.data?.forEach(shop => names.set(shop.id, shop));
  }
  const grouped = new Map<string, typeof rows>();
  rows.forEach(row => { const group = grouped.get(row.shop_id) ?? []; group.push(row); grouped.set(row.shop_id, group); });
  const shops = [...grouped].map(([id, sales]) => ({ id, ...names.get(id), ...summarizeSales(sales) })).sort((a, b) => b.total - a.total);
  const daily = salesByDay(rows), max = Math.max(1, ...daily.map(([, amount]) => amount));
  return <div className="space-y-6">
    <AdminHeading title="Sales & usage reports" description={`Tenant invoice activity from ${adminDate(reportStart(days))}. These are shop sales, not SaaS subscription revenue.`}><PeriodPicker days={days} base="/admin/saas/reports" /></AdminHeading>
    <MetricCards items={[{ label: "Invoiced sales", value: adminMoney(totals.total), hint: "Excludes cancelled invoices" }, { label: "Invoices", value: adminNumber(totals.invoices), hint: `${totals.cancelled} cancelled invoices excluded` }, { label: "Average bill", value: adminMoney(totals.average) }, { label: "Bills needing payment", value: adminNumber(totals.pending), hint: "Unpaid and partially paid invoices" }]} />
    <AdminPanel title="Daily sales" description="Invoice value by billing date · India Standard Time">
      {daily.length ? <div className="max-h-80 space-y-3 overflow-y-auto p-5">{daily.map(([day, amount]) => <div key={day} className="grid grid-cols-[70px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[90px_minmax(0,1fr)_110px]"><span className="text-[11px] text-stone-500">{adminDate(`${day}T00:00:00+05:30`)}</span><div className="min-w-0"><div className="h-2.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-stone-800" style={{ width: `${Math.max(1, amount / max * 100)}%` }} /></div><span className="mt-1 block text-right text-[11px] tabular-nums text-stone-500 sm:hidden">{adminMoney(amount)}</span></div><span className="hidden text-right text-xs tabular-nums text-stone-700 sm:block">{adminMoney(amount)}</span></div>)}</div> : <EmptyState title="No sales in this period" />}
    </AdminPanel>
    <AdminPanel title="Sales by shop" description="Only shops with invoice activity in the selected period appear here." action={<ExportCsv filename={`shop-sales-${days}-days.csv`} headers={["Shop", "Slug", "Invoiced sales INR", "Invoices", "Paid invoice value INR", "Unpaid or partial bills", "Cancelled"]} rows={shops.map(shop => [shop.name ?? shop.id, shop.slug ?? "", shop.total, shop.invoices, shop.paid, shop.pending, shop.cancelled])} />}>
      <AdminTable headers={["Shop", "Sales", "Invoices", "Paid invoice value", "Needs payment"]} rows={shops.map(shop => ({ id: shop.id, cells: [<Link key="shop" href={`/admin/saas/shops/${shop.id}?days=${days}`} className="font-semibold text-stone-900 hover:underline">{shop.name ?? shop.id}</Link>, adminMoney(shop.total), adminNumber(shop.invoices), adminMoney(shop.paid), adminNumber(shop.pending)] }))} />
    </AdminPanel>
  </div>;
}
