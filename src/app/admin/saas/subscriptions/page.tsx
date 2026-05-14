import Link from "next/link";

import {
  superadminExtendSubscriptionAction,
  superadminLockSubscriptionAction,
} from "@/app/admin/saas/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateText(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN");
}

function statusClass(status: string | null | undefined) {
  if (status === "active" || status === "trialing") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "past_due" || status === "cancel_at_period_end") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "locked" || status === "expired" || status === "cancelled") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

export default async function SaasSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  await searchParams;

  const { data: entitlements } = await supabase
    .from("shop_entitlements")
    .select(`
      shop_id,
      billing_status,
      trial_ends_at,
      subscription_valid_until,
      access_expires_at,
      grace_ends_at,
      locked_reason,
      cancel_at_period_end,
      provider,
      provider_subscription_id,
      plan_id,
      shops ( name, slug ),
      saas_plans ( display_name, code )
    `)
    .order("updated_at", { ascending: false })
    .limit(100);

  const { data: subscriptions } = await supabase
    .from("shop_subscriptions")
    .select(`
      id,
      shop_id,
      status,
      billing_interval,
      current_period_end,
      next_payment_at,
      last_payment_status,
      provider,
      provider_subscription_id,
      shops ( name, slug ),
      saas_plans ( display_name, code )
    `)
    .order("updated_at", { ascending: false })
    .limit(50);

  const { data: intents } = await supabase
    .from("subscription_intents")
    .select("id, owner_email, plan_code, billing_interval, status, created_shop_id, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: events } = await supabase
    .from("subscription_events")
    .select("id, event_type, processed_status, processed_message, shop_id, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-500">SaaS Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-950">Subscriptions</h1>
        <p className="mt-2 text-sm text-stone-600">
          Monitor shop access, payment references, pre-shop intents, and webhook events.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-lg font-bold text-stone-950">Shop Access</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Access until</th>
                <th className="px-4 py-3">Grace</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(entitlements ?? []).map((row) => {
                const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
                const plan = Array.isArray(row.saas_plans) ? row.saas_plans[0] : row.saas_plans;
                return (
                  <tr key={row.shop_id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-950">{shop?.name ?? "Unknown shop"}</div>
                      <div className="text-xs text-stone-500">{shop?.slug ?? row.shop_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(row.billing_status)}`}>
                        {row.billing_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{plan?.display_name ?? "Manual/free access"}</td>
                    <td className="px-4 py-3 text-stone-700">{dateText(row.subscription_valid_until ?? row.access_expires_at)}</td>
                    <td className="px-4 py-3 text-stone-700">{dateText(row.grace_ends_at)}</td>
                    <td className="px-4 py-3 text-stone-600">{row.locked_reason ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <form action={superadminExtendSubscriptionAction} className="flex gap-2">
                          <input type="hidden" name="shop_id" value={row.shop_id} />
                          <input
                            name="days"
                            defaultValue="365"
                            className="h-9 w-20 rounded-lg border border-stone-200 px-2 text-sm"
                          />
                          <button className="h-9 rounded-lg bg-stone-950 px-3 text-xs font-bold text-white">
                            Extend
                          </button>
                        </form>
                        <form action={superadminLockSubscriptionAction}>
                          <input type="hidden" name="shop_id" value={row.shop_id} />
                          <button className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700">
                            Lock
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-bold text-stone-950">Latest Shop Subscriptions</h2>
          <div className="mt-4 space-y-3">
            {(subscriptions ?? []).map((sub) => {
              const shop = Array.isArray(sub.shops) ? sub.shops[0] : sub.shops;
              const plan = Array.isArray(sub.saas_plans) ? sub.saas_plans[0] : sub.saas_plans;
              return (
                <div key={sub.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-stone-950">{shop?.name ?? sub.shop_id}</p>
                      <p className="text-xs text-stone-500">{plan?.display_name ?? "No plan"} · {sub.billing_interval}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(sub.status)}`}>
                      {sub.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">Next payment: {dateText(sub.next_payment_at)}</p>
                  <p className="mt-1 text-xs text-stone-600">Last payment: {sub.last_payment_status ?? "-"}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-bold text-stone-950">Latest Intents</h2>
          <div className="mt-4 space-y-3">
            {(intents ?? []).map((intent) => (
              <div key={intent.id} className="rounded-lg border border-stone-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-950">{intent.owner_email}</p>
                    <p className="text-xs text-stone-500">{intent.plan_code} · {intent.billing_interval}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(intent.status)}`}>
                    {intent.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-600">Expires: {dateText(intent.expires_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-stone-950">Latest Webhook Events</h2>
          <Link href="/admin/saas" className="text-sm font-semibold text-stone-600 hover:text-stone-950">Back to admin</Link>
        </div>
        <div className="mt-4 grid gap-2">
          {(events ?? []).map((event) => (
            <div key={event.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-stone-950">{event.event_type}</span>
                <span className="text-xs text-stone-500">{dateText(event.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-stone-600">{event.processed_status} · {event.processed_message ?? "-"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
