import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
};

type EntRow = {
  shop_id: string;
  billing_status: string;
  trial_ends_at: string | null;
  subscription_valid_until: string | null;
};

export default async function SaasAdminShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const query = await searchParams;
  const q = (query.q ?? "").trim();

  let shopsQuery = supabase
    .from("shops")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) {
    shopsQuery = shopsQuery.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data: shops } = await shopsQuery;
  const { data: ents } = await supabase
    .from("shop_entitlements")
    .select("shop_id, billing_status, trial_ends_at, subscription_valid_until");

  const entByShop = new Map((ents ?? []).map((e: EntRow) => [e.shop_id, e]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Tenants</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-950">Shops</h1>
          <p className="mt-2 text-sm text-stone-600">Search shops, open details, and suspend or restore access.</p>
        </div>
      </div>

      <form className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by shop name or slug…"
          className="h-10 w-full rounded-lg border border-stone-200 px-3 text-sm outline-none focus:border-stone-400"
        />
        <button type="submit" className="h-10 rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white hover:bg-stone-800">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Shop status</th>
              <th className="px-4 py-3">Billing</th>
              <th className="px-4 py-3">Trial / renewal</th>
            </tr>
          </thead>
          <tbody>
            {(shops ?? ([] as ShopRow[])).map((shop) => {
              const ent = entByShop.get(shop.id);
              const end =
                ent?.billing_status === "trialing" && ent.trial_ends_at
                  ? new Date(ent.trial_ends_at).toLocaleDateString("en-IN")
                  : ent?.billing_status === "active" && ent.subscription_valid_until
                    ? new Date(ent.subscription_valid_until).toLocaleDateString("en-IN")
                    : "—";

              return (
                <tr key={shop.id} className="border-b border-stone-100">
                  <td className="px-4 py-3">
                    <Link href={`/admin/saas/shops/${shop.id}`} className="font-semibold text-stone-900 hover:underline">
                      {shop.name}
                    </Link>
                    <div className="text-xs text-stone-500">{shop.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{shop.status}</td>
                  <td className="px-4 py-3 text-stone-700">{ent?.billing_status ?? "—"}</td>
                  <td className="px-4 py-3 text-stone-600">{end}</td>
                </tr>
              );
            })}
            {shops && shops.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-stone-600">
                  No shops found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
