import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { accessEnd, adminDate, pageNumber, searchText } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, Pagination, StatusBadge, adminButton, adminInput, adminSecondary } from "../_components/admin-ui";

type ShopDirectoryRow = { id: string; name: string; slug: string; city: string; state: string; email: string; status: string; created_at: string };
type Entitlement = { shop_id: string; billing_status: string; trial_ends_at: string | null; subscription_valid_until: string | null; access_expires_at: string | null; saas_plans: { display_name: string } | { display_name: string }[] | null };
export default async function SaasAdminShopsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; billing?: string; page?: string }> }) {
  const db = await getAdminReadClient();
  const params = await searchParams;
  const q = searchText(params.q), page = pageNumber(params.page);
  const status = ["active", "suspended", "inactive"].includes(params.status ?? "") ? params.status! : "";
  const billing = ["active", "trialing", "locked"].includes(params.billing ?? "") ? params.billing! : "";
  let query = db.from("shops").select(billing ? "id, name, slug, city, state, email, status, created_at, shop_entitlements!inner(billing_status)" : "id, name, slug, city, state, email, status, created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  if (billing) query = query.eq("shop_entitlements.billing_status", billing);
  const { data: shops, count, error } = await query.overrideTypes<ShopDirectoryRow[], { merge: false }>();
  checkAdminQuery(error, "shops");
  const ids = (shops ?? []).map(shop => shop.id);
  const { data: entitlements, error: entitlementError } = ids.length
    ? await db.from("shop_entitlements").select("shop_id, billing_status, trial_ends_at, subscription_valid_until, access_expires_at, saas_plans(display_name)").in("shop_id", ids)
    : { data: [], error: null };
  checkAdminQuery(entitlementError, "shop access");
  const byShop = new Map((entitlements as Entitlement[] ?? []).map(row => [row.shop_id, row]));
  return <div className="space-y-6">
    <AdminHeading title="Shops" description="Find any tenant, review their plan, and open a complete workspace profile." />
    <form className="grid grid-cols-2 gap-2.5 rounded-[1.4rem] border border-white bg-white p-3.5 shadow-[0_3px_16px_rgba(33,62,44,0.035)] sm:gap-3 lg:rounded-2xl lg:border-stone-200 lg:p-4 lg:shadow-none xl:grid-cols-[1fr_160px_160px_auto_auto]">
      <label className="relative col-span-2 xl:col-span-1"><span className="sr-only">Search shops</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-stone-400" /><input name="q" defaultValue={q} placeholder="Shop, email, city or slug" className={`${adminInput} pl-9`} /></label>
      <label><span className="sr-only">Shop status</span><select name="status" defaultValue={status} className={adminInput}><option value="">All shop statuses</option><option value="active">Active shops</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></label>
      <label><span className="sr-only">Billing status</span><select name="billing" defaultValue={billing} className={adminInput}><option value="">All billing statuses</option><option value="active">Active billing</option><option value="trialing">Trialing</option><option value="locked">Locked</option></select></label>
      <button className={adminButton}>Search</button><Link href="/admin/saas/shops" className={adminSecondary}>Reset</Link>
    </form>
    <AdminPanel title="Shop directory" description={`${(count ?? 0).toLocaleString("en-IN")} matching workspaces`}>
      <AdminTable headers={["Shop", "Location", "Access", "Plan / billing", "Access ends", "Joined"]} rows={(shops ?? []).map(shop => {
        const ent = byShop.get(shop.id), plan = Array.isArray(ent?.saas_plans) ? ent.saas_plans[0] : ent?.saas_plans;
        return { id: shop.id, cells: [<Link key="shop" href={`/admin/saas/shops/${shop.id}`} className="font-semibold text-stone-900 hover:underline"><span className="flex items-center gap-2">{shop.name}<ArrowUpRight className="h-3 w-3 shrink-0 text-stone-400" /></span><span className="mt-1 block text-xs font-normal text-stone-500">{shop.email}</span><span className="mt-1 block text-xs font-normal text-stone-400">/{shop.slug}</span></Link>, `${shop.city}, ${shop.state}`, <StatusBadge key="access" value={shop.status} />, <div key="billing" className="space-y-2"><p className="text-xs">{plan?.display_name ?? "No plan assigned"}</p><StatusBadge value={ent?.billing_status} /></div>, ent ? adminDate(accessEnd(ent)) : "—", adminDate(shop.created_at)] };
      })} empty="No shops match these filters" />
      <Pagination page={page} count={count ?? 0} base="/admin/saas/shops" params={{ q, status, billing }} />
    </AdminPanel>
  </div>;
}
