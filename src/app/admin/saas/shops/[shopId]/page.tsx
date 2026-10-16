import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery, loadSales } from "@/lib/admin/data";
import { summarizeSales } from "@/lib/admin/sales";
import { accessEnd, adminDate, adminMoney, adminNumber, pageNumber, reportDays } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, MetricCards, Pagination, PeriodPicker, StatusBadge, adminButton, adminInput, adminSecondary } from "../../_components/admin-ui";
import { ConfirmForm } from "../../_components/confirm-form";
import { SubscriptionActionButton } from "../../subscriptions/_components/subscription-action-button";
import { setAdminShopPlanAction, setAdminStaffStatusAction, setShopStatusAction, superadminExtendSubscriptionAction, superadminLockSubscriptionAction, superadminUnlockSubscriptionAction } from "../../actions";
import { ShopHeaderMore } from "./_components/shop-header-more";

type Params = { tab?: string; days?: string; page?: string };
export default async function ShopDetailsPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<Params> }) {
  const { shopId } = await params;
  if (!z.string().uuid().safeParse(shopId).success) notFound();
  const filters = await searchParams;
  const days = reportDays(filters.days), page = pageNumber(filters.page);
  const tab = ["overview", "invoices", "inventory", "customers", "team", "access"].includes(filters.tab ?? "") ? filters.tab! : "overview";
  const db = await getAdminReadClient();
  const [shopResult, settingsResult, productCount, invoiceCount, customerCount, memberCount, entitlementResult, sales] = await Promise.all([
    db.from("shops").select("id, name, slug, status, phone, email, logo_url, address_line_1, address_line_2, city, state, postal_code, created_at").eq("id", shopId).maybeSingle(),
    db.from("shop_settings").select("invoice_prefix, invoice_footer").eq("shop_id", shopId).maybeSingle(),
    db.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    db.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    db.from("shop_members").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    db.from("shop_entitlements").select("shop_id, plan_id, billing_status, trial_ends_at, subscription_valid_until, access_expires_at, grace_ends_at, locked_reason, provider, cancel_at_period_end").eq("shop_id", shopId).maybeSingle(),
    tab === "overview" ? loadSales(days, shopId) : Promise.resolve([]),
  ]);
  [shopResult, settingsResult, productCount, invoiceCount, customerCount, memberCount, entitlementResult].forEach(result => checkAdminQuery(result.error, "shop details"));
  const shop = shopResult.data, ent = entitlementResult.data;
  if (!shop) notFound();
  const base = `/admin/saas/shops/${shopId}`, totals = summarizeSales(sales);
  return <div className="space-y-6">
    <Link href="/admin/saas/shops" className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-stone-500 hover:text-stone-900"><ArrowLeft className="h-4 w-4" />All shops</Link>
    <AdminHeading eyebrow={`Workspace · /${shop.slug}`} title={shop.name} description={`Joined ${adminDate(shop.created_at)} · ${shop.city}, ${shop.state}`}>
      <StatusBadge value={shop.status} /><ShopHeaderMore shop={shop} shopSettings={settingsResult.data} />
    </AdminHeading>
    <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-stone-500">
      <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{shop.phone}</a>
      <a href={`mailto:${shop.email}`} className="inline-flex min-w-0 items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0" />{shop.email}</a>
      <span className="inline-flex items-start gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{[shop.address_line_1, shop.address_line_2, shop.postal_code].filter(Boolean).join(", ")}</span>
    </div>
    <MetricCards items={[{ label: "Products", value: adminNumber(productCount.count) }, { label: "Invoices", value: adminNumber(invoiceCount.count) }, { label: "Customers", value: adminNumber(customerCount.count) }, { label: "Team members", value: adminNumber(memberCount.count) }]} />
    <nav aria-label="Shop sections" className="flex gap-1 overflow-x-auto border-b border-stone-200">{["overview", "invoices", "inventory", "customers", "team", "access"].map(value => <Link key={value} href={`${base}?${new URLSearchParams({ tab: value, days: String(days) })}`} aria-current={tab === value ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-medium capitalize ${tab === value ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-700"}`}>{value}</Link>)}</nav>
    {tab === "overview" ? <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Sales performance</h2><PeriodPicker days={days} base={base} /></div>
      <MetricCards items={[{ label: "Invoiced sales", value: adminMoney(totals.total), hint: `Last ${days} calendar days · excludes cancelled` }, { label: "Paid invoice value", value: adminMoney(totals.paid), hint: "Fully paid bills only" }, { label: "Average bill", value: adminMoney(totals.average) }, { label: "Needs payment", value: adminNumber(totals.pending), hint: "Unpaid or partially paid bills" }]} />
      <div className="grid gap-4 lg:grid-cols-2"><AdminPanel title="Workspace access" action={<Link href={`${base}?tab=access`} className="text-xs font-medium">Manage →</Link>}><dl className="grid grid-cols-2 gap-5 p-5 text-xs"><div><dt className="mb-2 text-stone-400">Billing status</dt><dd><StatusBadge value={ent?.billing_status} /></dd></div><div><dt className="mb-2 text-stone-400">Access ends</dt><dd>{ent ? adminDate(accessEnd(ent)) : "Not configured"}</dd></div><div><dt className="mb-2 text-stone-400">Provider</dt><dd className="capitalize">{ent?.provider ?? "Manual"}</dd></div><div><dt className="mb-2 text-stone-400">Auto renewal</dt><dd>{ent?.cancel_at_period_end ? "Cancelled at period end" : "See subscription"}</dd></div></dl></AdminPanel><AdminPanel title="Shop information"><dl className="grid grid-cols-2 gap-5 p-5 text-xs"><div><dt className="mb-2 text-stone-400">Invoice prefix</dt><dd>{settingsResult.data?.invoice_prefix ?? "—"}</dd></div><div><dt className="mb-2 text-stone-400">Shop status</dt><dd><StatusBadge value={shop.status} /></dd></div><div className="col-span-2"><dt className="mb-2 text-stone-400">Public shop</dt><dd><Link className="inline-flex items-center gap-1 hover:underline" href={`/${shop.slug}`} target="_blank" rel="noreferrer">/{shop.slug}<ArrowUpRight className="h-3 w-3" /></Link></dd></div></dl></AdminPanel></div>
    </> : null}
    {tab === "invoices" || tab === "overview" ? <ShopInvoices shopId={shopId} page={tab === "overview" ? 1 : page} base={base} overview={tab === "overview"} /> : null}
    {tab === "inventory" ? <ShopInventory shopId={shopId} page={page} base={base} /> : null}
    {tab === "customers" ? <ShopCustomers shopId={shopId} page={page} base={base} /> : null}
    {tab === "team" ? <ShopTeam shopId={shopId} page={page} base={base} /> : null}
    {tab === "access" ? <>
      <AdminPanel title="Shop access" description="Suspending a workspace blocks access for its members while preserving their individual staff statuses."><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><StatusBadge value={shop.status} /><p className="mt-2 text-xs text-stone-500">Shop data is retained when access is suspended.</p></div><ConfirmForm action={setShopStatusAction} message={`${shop.status === "active" ? "Suspend" : "Restore"} access for ${shop.name}?`}><input type="hidden" name="shop_id" value={shopId} /><input type="hidden" name="status" value={shop.status === "active" ? "suspended" : "active"} /><SubscriptionActionButton className={adminSecondary}>{shop.status === "active" ? "Suspend shop" : "Restore shop"}</SubscriptionActionButton></ConfirmForm></div></AdminPanel>
      <ShopAccess shopId={shopId} />
    </> : null}
  </div>;
}

async function ShopInvoices({ shopId, page, base, overview }: { shopId: string; page: number; base: string; overview: boolean }) {
  const db = await getAdminReadClient(), size = overview ? 5 : 25;
  const { data, count, error } = await db.from("invoices").select("id, invoice_number, customer_name, customer_mobile, grand_total, payment_method, payment_status, invoice_date", { count: "exact" }).eq("shop_id", shopId).order("invoice_date", { ascending: false }).order("id").range((page - 1) * size, page * size - 1);
  checkAdminQuery(error, "invoices");
  return <AdminPanel title={overview ? "Recent invoices" : "Invoices"} action={overview ? <Link className="text-xs font-medium" href={`${base}?tab=invoices`}>All invoices →</Link> : undefined}><AdminTable headers={["Invoice / customer", "Amount", "Payment", "Date"]} rows={(data ?? []).map(row => ({ id: row.id, cells: [<div key="invoice"><p className="font-semibold text-stone-900">{row.invoice_number}</p><p className="mt-1 text-xs">{row.customer_name}</p><p className="mt-1 text-xs text-stone-400">{row.customer_mobile}</p></div>, adminMoney(row.grand_total), <div key="payment" className="space-y-2"><StatusBadge value={row.payment_status} /><p className="text-xs">{row.payment_method}</p></div>, adminDate(row.invoice_date)] }))} />{!overview ? <Pagination page={page} count={count ?? 0} base={base} params={{ tab: "invoices" }} /> : null}</AdminPanel>;
}
async function ShopInventory({ shopId, page, base }: { shopId: string; page: number; base: string }) {
  const db = await getAdminReadClient();
  const { data, count, error } = await db.from("products").select("id, name, tracking_type, base_selling_price, base_purchase_price, is_active, product_variants(quantity)", { count: "exact" }).eq("shop_id", shopId).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  checkAdminQuery(error, "inventory");
  const ids = (data ?? []).filter(row => row.tracking_type === "SERIALIZED").map(row => row.id);
  const stock = new Map<string, number>();
  for (let offset = 0; ids.length; offset += 1000) {
    const result = await db.from("inventory_items").select("id, product_id").in("product_id", ids).eq("shop_id", shopId).eq("status", "IN_STOCK").order("id").range(offset, offset + 999);
    checkAdminQuery(result.error, "serialized stock");
    result.data?.forEach(row => stock.set(row.product_id, (stock.get(row.product_id) ?? 0) + 1));
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return <AdminPanel title="Inventory" description="Quantity is available stock. Purchase and selling prices are the product base prices."><AdminTable headers={["Product", "In stock", "Purchase price", "Selling price", "Status"]} rows={(data ?? []).map(row => ({ id: row.id, cells: [<div key="name"><p className="font-semibold text-stone-900">{row.name}</p><p className="mt-1 text-xs capitalize text-stone-400">{row.tracking_type.toLowerCase().replaceAll("_", " ")}</p></div>, row.tracking_type === "SERIALIZED" ? stock.get(row.id) ?? 0 : row.product_variants.reduce((sum, variant) => sum + Number(variant.quantity ?? 0), 0), adminMoney(row.base_purchase_price), adminMoney(row.base_selling_price), <StatusBadge key="status" value={row.is_active ? "active" : "inactive"} />] }))} /><Pagination page={page} count={count ?? 0} base={base} params={{ tab: "inventory" }} /></AdminPanel>;
}
async function ShopCustomers({ shopId, page, base }: { shopId: string; page: number; base: string }) {
  const db = await getAdminReadClient();
  const { data, count, error } = await db.from("customers").select("id, name, mobile, billing_address, gst_number, created_at", { count: "exact" }).eq("shop_id", shopId).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  checkAdminQuery(error, "customers");
  return <AdminPanel title="Customers"><AdminTable headers={["Customer", "Mobile", "Billing address", "GST", "Added"]} rows={(data ?? []).map(row => ({ id: row.id, cells: [<span key="name" className="font-semibold text-stone-900">{row.name}</span>, row.mobile || "—", row.billing_address || "—", row.gst_number || "—", adminDate(row.created_at)] }))} /><Pagination page={page} count={count ?? 0} base={base} params={{ tab: "customers" }} /></AdminPanel>;
}
async function ShopTeam({ shopId, page, base }: { shopId: string; page: number; base: string }) {
  const db = await getAdminReadClient();
  const { data, count, error } = await db.from("shop_members").select("id, role, status, full_name, email, mobile_number, joined_at", { count: "exact" }).eq("shop_id", shopId).order("joined_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  checkAdminQuery(error, "team");
  return <AdminPanel title="Team" description="Staff can be suspended or restored individually. Owner access is protected."><AdminTable headers={["Member", "Role", "Status", "Joined", "Manage"]} rows={(data ?? []).map(row => ({ id: row.id, cells: [<div key="member"><p className="font-semibold text-stone-900">{row.full_name || row.email || "Shop member"}</p><p className="mt-1 text-xs text-stone-400">{row.email || row.mobile_number || "—"}</p></div>, <span key="role" className="capitalize">{row.role}</span>, <StatusBadge key="status" value={row.status} />, adminDate(row.joined_at), row.role === "staff" ? <ConfirmForm key="action" action={setAdminStaffStatusAction} message={`${row.status === "ACTIVE" ? "Suspend" : "Restore"} this staff member?`}><input type="hidden" name="shop_id" value={shopId} /><input type="hidden" name="member_id" value={row.id} /><input type="hidden" name="status" value={row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><SubscriptionActionButton className={adminSecondary}>{row.status === "ACTIVE" ? "Suspend" : "Restore"}</SubscriptionActionButton></ConfirmForm> : <span key="protected" className="text-xs text-stone-400">Protected</span>] }))} /><Pagination page={page} count={count ?? 0} base={base} params={{ tab: "team" }} /></AdminPanel>;
}
async function ShopAccess({ shopId }: { shopId: string }) {
  const db = await getAdminReadClient();
  const [accessResult, plansResult] = await Promise.all([
    db.from("shop_entitlements").select("plan_id, billing_status, trial_ends_at, subscription_valid_until, access_expires_at, grace_ends_at, locked_reason").eq("shop_id", shopId).maybeSingle(),
    db.from("saas_plans").select("id, display_name").eq("is_active", true).order("sort_order"),
  ]);
  checkAdminQuery(accessResult.error, "access"); checkAdminQuery(plansResult.error, "plans");
  const ent = accessResult.data;
  return <div className="grid gap-4 xl:grid-cols-2">
    <AdminPanel title="Subscription access" description="Manual access controls do not charge the customer or change their payment-provider subscription."><div className="space-y-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge value={ent?.billing_status} /><span className="text-xs text-stone-500">Until {ent ? adminDate(accessEnd(ent)) : "not configured"}</span></div>{ent?.locked_reason ? <p className="text-xs text-stone-500">Reason: {ent.locked_reason}</p> : null}<ConfirmForm action={superadminExtendSubscriptionAction} message="Grant additional workspace access?" className="space-y-2"><input type="hidden" name="shop_id" value={shopId} /><label className="text-xs text-stone-500" htmlFor="access-days">Extend access by days</label><div className="flex gap-2"><input id="access-days" name="days" type="number" required min="1" max="3650" defaultValue="30" className={adminInput} /><SubscriptionActionButton className={adminButton}>Extend</SubscriptionActionButton></div></ConfirmForm>{ent ? <ConfirmForm action={ent.billing_status === "locked" ? superadminUnlockSubscriptionAction : superadminLockSubscriptionAction} message={`${ent.billing_status === "locked" ? "Unlock" : "Lock"} subscription access?`}><input type="hidden" name="shop_id" value={shopId} /><SubscriptionActionButton className={adminSecondary}>{ent.billing_status === "locked" ? "Unlock access" : "Lock access"}</SubscriptionActionButton></ConfirmForm> : null}</div></AdminPanel>
    <AdminPanel title="Workspace plan" description="Override the feature plan for this workspace. Provider renewals may replace this override."><form action={setAdminShopPlanAction} className="space-y-4 p-5"><input type="hidden" name="shop_id" value={shopId} /><label className="block text-xs text-stone-500">Feature plan<select required name="plan_id" defaultValue={ent?.plan_id ?? ""} className={`${adminInput} mt-2`}><option value="" disabled>Choose a plan</option>{plansResult.data?.map(plan => <option key={plan.id} value={plan.id}>{plan.display_name}</option>)}</select></label><SubscriptionActionButton className={adminButton}>Save plan</SubscriptionActionButton><Link href="/admin/saas/subscriptions" className="block text-xs text-stone-500 hover:underline">View subscription records →</Link></form></AdminPanel>
  </div>;
}
