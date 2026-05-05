import Link from "next/link";
import { ArrowRight, Building2, FileText, Package, Tags, Users } from "lucide-react";

import { mergePlatformSettings } from "@/lib/subscription/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShopRow = { id: string; name: string; slug: string; status: string; created_at: string };
type EntRow = {
  shop_id: string;
  billing_status: string;
  trial_ends_at: string | null;
  subscription_valid_until: string | null;
};

function StatusBadge({ value }: { value: string }) {
  const classes =
    value === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : value === "trialing"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : value === "suspended" || value === "locked"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-stone-200 bg-stone-50 text-stone-700";

  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>{value}</span>;
}

export default async function SaasAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const query = await searchParams;

  const { data: settingsRow } = await supabase.from("saas_platform_settings").select("*").eq("id", 1).maybeSingle();
  const settings = mergePlatformSettings(settingsRow ?? null);

  const [{ data: shops }, { count: totalShops }, { count: totalInvoices }, { count: totalProducts }, { count: totalMembers }] =
    await Promise.all([
      supabase.from("shops").select("id, name, slug, status, created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("shops").select("id", { count: "exact", head: true }),
      supabase.from("invoices").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("shop_members").select("id", { count: "exact", head: true }),
    ]);

  const { data: ents } = await supabase
    .from("shop_entitlements")
    .select("shop_id, billing_status, trial_ends_at, subscription_valid_until");
  const entByShop = new Map((ents ?? []).map((e: EntRow) => [e.shop_id, e]));

  const billingCounts = (ents ?? []).reduce(
    (acc, ent: EntRow) => {
      if (ent.billing_status === "trialing") acc.trialing += 1;
      if (ent.billing_status === "active") acc.active += 1;
      if (ent.billing_status === "locked") acc.locked += 1;
      return acc;
    },
    { trialing: 0, active: 0, locked: 0 },
  );

  const price = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: settings.plan_currency,
    maximumFractionDigits: 0,
  }).format(settings.plan_price_paise / 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Super admin</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-950">SaaS home</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Manage shops, subscriptions, trial access, and the plans that power DukaanHQ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/saas/shops"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Shops
          </Link>
          <Link
            href="/admin/saas/plans"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white hover:bg-stone-800"
          >
            <Tags className="h-4 w-4" aria-hidden="true" />
            Plans
          </Link>
        </div>
      </div>

      {query.saved ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Saved.</p> : null}
      {query.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total shops", value: totalShops ?? 0, icon: Building2 },
          { label: "Team members", value: totalMembers ?? 0, icon: Users },
          { label: "Products", value: totalProducts ?? 0, icon: Package },
          { label: "Invoices", value: totalInvoices ?? 0, icon: FileText },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-stone-500">{item.label}</p>
                <Icon className="h-5 w-5 text-stone-400" aria-hidden="true" />
              </div>
              <p className="mt-4 text-3xl font-bold text-stone-950">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-lg border border-stone-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-stone-950">Recent shops</h2>
              <p className="mt-1 text-sm text-stone-500">Latest tenants and their billing state.</p>
            </div>
            <Link href="/admin/saas/shops" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-700 hover:text-stone-950">
              View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-5 py-3">Shop</th>
                  <th className="px-5 py-3">Shop status</th>
                  <th className="px-5 py-3">Billing</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {(shops ?? ([] as ShopRow[])).map((shop) => {
                  const ent = entByShop.get(shop.id);
                  return (
                    <tr key={shop.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-5 py-3">
                        <Link href={`/admin/saas/shops/${shop.id}`} className="font-semibold text-stone-950 hover:underline">
                          {shop.name}
                        </Link>
                        <div className="text-xs text-stone-500">{shop.slug}</div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge value={shop.status ?? "unknown"} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge value={ent?.billing_status ?? "none"} />
                      </td>
                      <td className="px-5 py-3 text-stone-600">{new Date(shop.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  );
                })}
                {shops && shops.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-stone-600">
                      No shops are visible. Apply <code className="font-mono">db/032_superadmin_rls_read_access.sql</code> if shops exist.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-stone-950">Current default offer</h2>
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-500">{settings.plan_display_name}</p>
              <p className="mt-2 text-3xl font-bold text-stone-950">{price}</p>
              <p className="mt-1 text-sm text-stone-600">per month before tax</p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-sky-50 p-3">
                <p className="text-xl font-bold text-sky-900">{billingCounts.trialing}</p>
                <p className="text-xs font-semibold text-sky-700">Trial</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xl font-bold text-emerald-900">{billingCounts.active}</p>
                <p className="text-xs font-semibold text-emerald-700">Active</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-3">
                <p className="text-xl font-bold text-rose-900">{billingCounts.locked}</p>
                <p className="text-xs font-semibold text-rose-700">Locked</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-stone-950">Trial model</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Trial is still a platform-level setting for now. Plans now hold pricing and entitlements, and the next subscription pass can
              connect shops to the selected plan.
            </p>
            <Link href="/admin/saas/plans" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-stone-950 hover:underline">
              Manage plans <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
