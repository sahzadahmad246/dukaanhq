import Link from "next/link";
import { ArrowUpRight, Building2, CreditCard, TriangleAlert } from "lucide-react";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { adminDate, adminNumber } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, MetricCards, StatusBadge, adminSecondary } from "./_components/admin-ui";

export default async function SaasAdminPage() {
  const db = await getAdminReadClient();
  const count = (table: string) => db.from(table).select("id", { count: "exact", head: true });
  const results = await Promise.all([
    count("shops"), count("products"), count("invoices"), count("shop_members"),
    db.from("shop_entitlements").select("shop_id", { count: "exact", head: true }).eq("billing_status", "active"),
    db.from("shop_entitlements").select("shop_id", { count: "exact", head: true }).eq("billing_status", "trialing"),
    db.from("shops").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    db.from("shop_subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
    db.from("shops").select("id, name, slug, city, status, created_at").order("created_at", { ascending: false }).limit(8),
    db.from("subscription_events").select("id, event_type, processed_status, shop_id, created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  results.forEach(result => checkAdminQuery(result.error, "platform overview"));
  const [shops, products, invoices, members, active, trials, suspended, pastDue, recent, events] = results;
  // Each query has its own row shape; keep the two list results separate.
  const recentShops = recent.data as unknown as { id: string; name: string; slug: string; city: string; status: string; created_at: string }[];
  const recentEvents = events.data as unknown as { id: string; event_type: string; processed_status: string; shop_id: string | null; created_at: string }[];
  return <div className="space-y-6">
    <AdminHeading eyebrow="DukaanHQ · Admin" title="Platform overview" description="A live view of your shops, workspace usage, and subscription health."><Link href="/admin/saas/reports" className={adminSecondary}>View reports <ArrowUpRight className="h-4 w-4" /></Link></AdminHeading>
    <MetricCards items={[
      { label: "Total shops", value: adminNumber(shops.count), hint: "All registered workspaces" },
      { label: "Products", value: adminNumber(products.count), hint: "Across all shop inventories" },
      { label: "Invoices", value: adminNumber(invoices.count), hint: "Across all shops · all time" },
      { label: "Team members", value: adminNumber(members.count), hint: "Owners and shop members" },
    ]} />
    <div className="grid gap-3 sm:grid-cols-3">{[
      { title: "Subscriptions", value: active.count ?? 0, detail: `${trials.count ?? 0} trial workspaces`, href: "/admin/saas/subscriptions", icon: CreditCard },
      { title: "Suspended shops", value: suspended.count ?? 0, detail: "Review shop access", href: "/admin/saas/shops?status=suspended", icon: Building2 },
      { title: "Payments past due", value: pastDue.count ?? 0, detail: "Review billing issues", href: "/admin/saas/support", icon: TriangleAlert },
    ].map(item => <Link key={item.title} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 hover:border-stone-400"><item.icon className="h-5 w-5 shrink-0 text-stone-400" /><div className="min-w-0 flex-1"><p className="text-xs text-stone-500">{item.title}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-[11px] text-stone-400">{item.detail}</p></div><ArrowUpRight className="h-4 w-4 text-stone-400" /></Link>)}</div>
    <AdminPanel title="Newest shops" description="Open a workspace to inspect its usage, sales, team, and access." action={<Link className="text-xs font-semibold text-stone-600 hover:underline" href="/admin/saas/shops">All shops →</Link>}>
      <AdminTable headers={["Shop", "Location", "Status", "Joined"]} rows={(recentShops ?? []).map(shop => ({ id: shop.id, cells: [<Link key="name" href={`/admin/saas/shops/${shop.id}`} className="block font-semibold text-stone-900 hover:underline">{shop.name}<span className="mt-1 block text-xs font-normal text-stone-400">/{shop.slug}</span></Link>, shop.city, <StatusBadge key="status" value={shop.status} />, adminDate(shop.created_at)] }))} />
    </AdminPanel>
    <AdminPanel title="Subscription activity" action={<Link href="/admin/saas/support" className="text-xs font-semibold text-stone-600 hover:underline">Operations →</Link>}>
      <AdminTable headers={["Event", "Result", "Received"]} rows={(recentEvents ?? []).map(event => ({ id: event.id, cells: [event.event_type, <StatusBadge key="status" value={event.processed_status} />, adminDate(event.created_at, true)] }))} empty="No subscription events yet" />
    </AdminPanel>
  </div>;
}
