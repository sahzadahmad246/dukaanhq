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
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">DukaanHQ</p>
          <h1 className="text-2xl font-bold text-stone-950">Manage shops</h1>
          <p className="mt-1 text-sm text-stone-600">Search shops, open details, and suspend/unsuspend access.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/saas" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
            SaaS admin
          </Link>
          <Link href="/" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
            Home
          </Link>
        </div>
      </div>

      {query.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</p>
      ) : null}

      <form className="mb-5 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by shop name or slug…"
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <button type="submit" className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
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

