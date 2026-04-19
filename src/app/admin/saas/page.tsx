import Link from "next/link";

import { updateSaasSettingsAction } from "@/app/admin/saas/actions";
import { mergePlatformSettings } from "@/lib/subscription/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShopRow = { id: string; name: string; slug: string; status: string; created_at: string };
type EntRow = {
  shop_id: string;
  billing_status: string;
  trial_ends_at: string | null;
  subscription_valid_until: string | null;
};

export default async function SaasAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const query = await searchParams;

  const { data: settingsRow } = await supabase.from("saas_platform_settings").select("*").eq("id", 1).maybeSingle();
  const settings = mergePlatformSettings(settingsRow ?? null);

  const [{ data: shops }, { count: totalShops }, { count: totalInvoices }, { count: totalProducts }] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("shops").select("id", { count: "exact", head: true }),
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);

  const { data: ents } = await supabase
    .from("shop_entitlements")
    .select("shop_id, billing_status, trial_ends_at, subscription_valid_until");

  const entByShop = new Map((ents ?? []).map((e: EntRow) => [e.shop_id, e]));

  const priceRupees = settings.plan_price_paise / 100;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">DukaanHQ</p>
            <h1 className="text-2xl font-bold text-stone-950">SaaS admin</h1>
            <p className="mt-1 text-sm text-stone-600">Multi-tenant overview for your platform.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/saas/shops"
              className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm hover:bg-stone-50"
            >
              Manage shops
            </Link>
            <Link href="/" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
              Home
            </Link>
          </div>
        </div>

        {query.saved ? (
          <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Settings saved.
          </p>
        ) : null}
        {query.error ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Total shops</div>
            <div className="mt-1 text-3xl font-black text-stone-950">{totalShops ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Total products</div>
            <div className="mt-1 text-3xl font-black text-stone-950">{totalProducts ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Total invoices</div>
            <div className="mt-1 text-3xl font-black text-stone-950">{totalInvoices ?? 0}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-950">Recent shops</h2>
                <p className="mt-1 text-sm text-stone-600">Quick jump into the latest onboarded shops.</p>
              </div>
              <Link href="/admin/saas/shops" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
                View all
              </Link>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-2">Shop</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Billing</th>
                  </tr>
                </thead>
                <tbody>
                  {(shops ?? ([] as ShopRow[])).map((shop) => {
                    const ent = entByShop.get(shop.id);
                    return (
                      <tr key={shop.id} className="border-b border-stone-100">
                        <td className="py-2 pr-2">
                          <Link href={`/admin/saas/shops/${shop.id}`} className="font-semibold text-stone-900 hover:underline">
                            {shop.name}
                          </Link>
                          <div className="text-xs text-stone-500">{shop.slug}</div>
                        </td>
                        <td className="py-2 pr-2 text-stone-700">{shop.status ?? "—"}</td>
                        <td className="py-2 text-stone-700">{ent?.billing_status ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {shops && shops.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-sm text-stone-600">
                        No shops are visible. If you know shops exist, apply <code className="font-mono">db/032_superadmin_rls_read_access.sql</code>.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-stone-950">Plans &amp; trial</h2>
            <p className="mt-1 text-sm text-stone-600">
              Controls how new shops get a free trial. Cashfree billing will respect the list price when you wire payments.
            </p>

            <form action={updateSaasSettingsAction} className="mt-6 grid gap-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-stone-900">
                <input type="checkbox" name="trial_enabled" defaultChecked={settings.trial_enabled} className="h-4 w-4 rounded border-stone-300" />
                Free trial enabled for new shop owners
              </label>

              <div>
                <label htmlFor="trial_duration_days" className="text-sm font-medium text-stone-800">
                  Trial length (days)
                </label>
                <input
                  id="trial_duration_days"
                  name="trial_duration_days"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={settings.trial_duration_days}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="plan_display_name" className="text-sm font-medium text-stone-800">
                  Plan name
                </label>
                <input
                  id="plan_display_name"
                  name="plan_display_name"
                  type="text"
                  defaultValue={settings.plan_display_name}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="plan_price_rupees" className="text-sm font-medium text-stone-800">
                  Price (INR / month, before tax)
                </label>
                <input
                  id="plan_price_rupees"
                  name="plan_price_rupees"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={priceRupees}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                />
              </div>

              <button type="submit" className="rounded-2xl bg-stone-950 py-3 text-sm font-semibold text-white transition hover:bg-stone-800">
                Save changes
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
