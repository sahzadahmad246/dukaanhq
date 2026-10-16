import Link from "next/link";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { accessEnd, adminDate, pageNumber } from "@/lib/admin/format";
import { AdminHeading, AdminPanel, AdminTable, Pagination, StatusBadge, adminButton, adminInput, adminSecondary } from "../_components/admin-ui";
import { ConfirmForm } from "../_components/confirm-form";
import { superadminExtendSubscriptionAction, superadminLockSubscriptionAction, superadminUnlockSubscriptionAction } from "../actions";
import { SubscriptionActionButton } from "./_components/subscription-action-button";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const params = await searchParams, page = pageNumber(params.page);
  const status = ["active", "trialing", "locked"].includes(params.status ?? "") ? params.status! : "";
  const db = await getAdminReadClient();
  let query = db.from("shop_entitlements").select("shop_id, billing_status, trial_ends_at, subscription_valid_until, access_expires_at, grace_ends_at, locked_reason, provider, cancel_at_period_end, shops(name, slug), saas_plans(display_name)", { count: "exact" }).order("updated_at", { ascending: false }).order("shop_id").range((page - 1) * 25, page * 25 - 1);
  if (status) query = query.eq("billing_status", status);
  const { data, count, error } = await query;
  checkAdminQuery(error, "subscriptions");
  const ids = (data ?? []).map(row => row.shop_id);
  const { data: subscriptions, error: subError } = ids.length ? await db.from("shop_subscriptions").select("shop_id, status, billing_interval, next_payment_at, last_payment_status").in("shop_id", ids) : { data: [], error: null };
  checkAdminQuery(subError, "provider subscriptions");
  const byShop = new Map(subscriptions?.map(row => [row.shop_id, row]));
  return <div className="space-y-6"><AdminHeading title="Subscriptions & access" description="Review workspace plans, provider billing status, and manual access grants."><Link href="/admin/saas/subscriptions/health" className={adminSecondary}>Billing health</Link><Link href="/admin/saas/support?queue=all" className={adminSecondary}>Event log</Link></AdminHeading>
    <form className="flex flex-wrap items-end gap-3"><label className="text-xs text-stone-500">Billing status<select name="status" defaultValue={status} className={`${adminInput} mt-2`}><option value="">All billing statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="locked">Locked</option></select></label><button className={adminButton}>Apply filter</button></form>
    <AdminPanel title="Workspace subscriptions" description="Manual grants change app access; they do not collect payment or cancel provider billing."><AdminTable headers={["Shop", "Plan / provider", "Access", "Expires / grace", "Billing", "Manage"]} rows={(data ?? []).map(row => {
      const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops, plan = Array.isArray(row.saas_plans) ? row.saas_plans[0] : row.saas_plans, sub = byShop.get(row.shop_id), locked = row.billing_status === "locked";
      return { id: row.shop_id, cells: [<Link key="shop" href={`/admin/saas/shops/${row.shop_id}?tab=access`} className="font-semibold text-stone-900 hover:underline">{shop?.name ?? row.shop_id}<span className="mt-1 block text-xs font-normal text-stone-400">/{shop?.slug}</span></Link>, <div key="plan"><p>{plan?.display_name ?? "No plan assigned"}</p><p className="mt-1 text-xs capitalize text-stone-400">{row.provider ?? "Manual"}{sub?.billing_interval ? ` · ${sub.billing_interval}` : ""}</p></div>, <div key="access" className="space-y-2"><StatusBadge value={row.billing_status} />{row.locked_reason ? <p className="text-xs">{row.locked_reason}</p> : null}</div>, <div key="expiry"><p>{adminDate(accessEnd(row))}</p>{row.grace_ends_at ? <p className="mt-1 text-xs text-amber-700">Grace: {adminDate(row.grace_ends_at)}</p> : null}</div>, <div key="billing" className="space-y-2"><StatusBadge value={sub?.status ?? "manual"} /><p className="text-xs text-stone-400">Next: {adminDate(sub?.next_payment_at)}</p>{row.cancel_at_period_end ? <p className="text-xs text-amber-700">Renewal cancelled</p> : null}</div>, <div key="manage" className="flex flex-col gap-2"><ConfirmForm action={superadminExtendSubscriptionAction} message="Extend workspace access by the entered number of days?" className="flex gap-2"><input type="hidden" name="shop_id" value={row.shop_id} /><input aria-label="Additional access days" name="days" type="number" required min="1" max="3650" defaultValue="30" className={`${adminInput} max-w-20`} /><SubscriptionActionButton className={adminButton}>Extend</SubscriptionActionButton></ConfirmForm><ConfirmForm action={locked ? superadminUnlockSubscriptionAction : superadminLockSubscriptionAction} message={`${locked ? "Unlock" : "Lock"} access for this shop?`}><input type="hidden" name="shop_id" value={row.shop_id} /><SubscriptionActionButton className={adminSecondary}>{locked ? "Unlock" : "Lock"} access</SubscriptionActionButton></ConfirmForm></div>] };
    })} /><Pagination page={page} count={count ?? 0} base="/admin/saas/subscriptions" params={{ status }} /></AdminPanel>
  </div>;
}
