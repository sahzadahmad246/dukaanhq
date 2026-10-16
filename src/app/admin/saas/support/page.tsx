import Link from "next/link";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { adminDate, pageNumber } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, MetricCards, Pagination, StatusBadge } from "../_components/admin-ui";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ page?: string; queue?: string }> }) {
  const db = await getAdminReadClient(), params = await searchParams;
  const page = pageNumber(params.page), queue = params.queue === "all" ? "all" : "attention";
  let eventQuery = db.from("subscription_events").select("id, event_type, processed_status, processed_message, shop_id, created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  if (queue === "attention") eventQuery = eventQuery.in("processed_status", ["received", "failed", "error", "locked", "pricing_mismatch"]);
  const [events, overdue, intents, lockedCount, failedCount] = await Promise.all([
    eventQuery,
    db.from("shop_subscriptions").select("id, shop_id, status, last_payment_status, next_payment_at, shops(name, email)").or("status.eq.past_due,last_payment_status.eq.FAILED").order("updated_at", { ascending: false }).limit(25),
    db.from("subscription_intents").select("id, owner_email, plan_code, status, expires_at").in("status", ["selected", "payment_pending"]).order("created_at", { ascending: false }).limit(10),
    db.from("shop_entitlements").select("shop_id", { count: "exact", head: true }).eq("billing_status", "locked"),
    db.from("shop_subscriptions").select("id", { count: "exact", head: true }).or("status.eq.past_due,last_payment_status.eq.FAILED"),
  ]);
  [events, overdue, intents, lockedCount, failedCount].forEach(result => checkAdminQuery(result.error, "operations"));
  return <div className="space-y-6"><AdminHeading title="Support & operations" description="Investigate payment problems, access locks, incomplete checkouts, and provider events." />
    <MetricCards items={[{ label: "Locked workspaces", value: lockedCount.count ?? 0 }, { label: "Payment issues", value: failedCount.count ?? 0 }, { label: queue === "all" ? "Provider events" : "Events to review", value: events.count ?? 0 }, { label: "Recent checkouts", value: intents.data?.length ?? 0, hint: "Latest 10 selected or payment-pending intents" }]} />
    <AdminPanel title="Payment issues" description="Latest 25 subscriptions needing attention."><AdminTable headers={["Shop", "Subscription", "Last payment", "Next payment"]} rows={(overdue.data ?? []).map(row => { const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops; return { id: row.id, cells: [<Link key="shop" href={`/admin/saas/shops/${row.shop_id}?tab=access`} className="font-semibold text-stone-900 hover:underline">{shop?.name ?? row.shop_id}<span className="mt-1 block text-xs font-normal text-stone-400">{shop?.email}</span></Link>, <StatusBadge key="status" value={row.status} />, <StatusBadge key="payment" value={row.last_payment_status} />, adminDate(row.next_payment_at)] }; })} empty="No payment issues found" /></AdminPanel>
    <AdminPanel title="Incomplete checkouts" description="Latest pending selections. Expired checkouts may remain pending until reconciliation."><AdminTable headers={["Owner", "Plan", "Status", "Expires"]} rows={(intents.data ?? []).map(row => ({ id: row.id, cells: [row.owner_email, row.plan_code, <StatusBadge key="status" value={row.status} />, adminDate(row.expires_at, true)] }))} /></AdminPanel>
    <AdminPanel title="Provider event log" description="Review event outcomes before changing shop access. Events are read-only." action={<div className="flex gap-3 text-xs"><Link className={queue === "attention" ? "font-semibold" : "text-stone-400"} href="/admin/saas/support">Needs review</Link><Link className={queue === "all" ? "font-semibold" : "text-stone-400"} href="/admin/saas/support?queue=all">All events</Link></div>}>
      <AdminTable headers={["Event", "Result", "Details", "Shop", "Received"]} rows={(events.data ?? []).map(row => ({ id: row.id, cells: [<span key="event" className="font-medium text-stone-900">{row.event_type}</span>, <StatusBadge key="status" value={row.processed_status} />, row.processed_message ?? "—", row.shop_id ? <Link key="shop" href={`/admin/saas/shops/${row.shop_id}`} className="text-xs underline underline-offset-2">Open shop</Link> : "Pre-shop event", adminDate(row.created_at, true)] }))} />
      <Pagination page={page} count={events.count ?? 0} base="/admin/saas/support" params={{ queue }} />
    </AdminPanel>
  </div>;
}
