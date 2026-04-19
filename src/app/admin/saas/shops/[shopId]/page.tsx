import Link from "next/link";

import {
  setShopStatusAction,
  superadminUpdateShopInfoAction,
} from "@/app/admin/saas/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  phone: string;
  email: string;
  logo_url: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  created_at: string;
};

type ShopSettingsRow = {
  invoice_prefix: string;
  invoice_footer: string | null;
};

type MemberRow = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  joined_at: string | null;
  suspended_at: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_mobile: string | null;
  grand_total: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
};

export default async function SaasAdminShopDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { shopId } = await params;
  const query = await searchParams;

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "id, name, slug, status, phone, email, logo_url, address_line_1, address_line_2, city, state, postal_code, created_at",
    )
    .eq("id", shopId)
    .maybeSingle<ShopRow>();

  const { data: shopSettings } = await supabase
    .from("shop_settings")
    .select("invoice_prefix, invoice_footer")
    .eq("shop_id", shopId)
    .maybeSingle<ShopSettingsRow>();

  const { data: members } = await supabase
    .from("shop_members")
    .select("id, role, status, full_name, email, mobile_number, joined_at, suspended_at")
    .eq("shop_id", shopId)
    .order("role", { ascending: false })
    .order("joined_at", { ascending: false })
    .limit(100);

  const [{ count: productsCount }, { count: invoicesCount }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
  ]);

  const { data: recentInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, customer_mobile, grand_total, payment_method, payment_status, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(20);

  const staffCount = (members ?? ([] as MemberRow[])).filter((m) => m.role === "staff").length;
  const ownerCount = (members ?? ([] as MemberRow[])).filter((m) => m.role === "owner").length;

  if (!shop) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Link href="/admin/saas/shops" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
          ← Back to shops
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-950">Shop not found</h1>
      </div>
    );
  }

  const nextSuspendStatus = shop.status === "suspended" ? "active" : "suspended";
  const nextSuspendLabel = shop.status === "suspended" ? "Unsuspend shop" : "Suspend shop";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <Link href="/admin/saas/shops" className="text-sm font-semibold text-stone-600 underline-offset-4 hover:underline">
            ← Back to shops
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-stone-950">{shop.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            <span className="font-semibold text-stone-800">{shop.slug}</span> · {shop.city}, {shop.state}
          </p>
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

      {query.saved ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved.
        </p>
      ) : null}
      {query.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-950">Overview</h2>
              <p className="mt-1 text-sm text-stone-600">
                Status: <span className="font-semibold text-stone-800">{shop.status}</span>
              </p>
              <p className="mt-2 text-sm text-stone-700">
                Contact: <span className="font-medium">{shop.phone}</span> · <span className="font-medium">{shop.email}</span>
              </p>
            </div>
            <form action={setShopStatusAction}>
              <input type="hidden" name="shop_id" value={shop.id} />
              <input type="hidden" name="status" value={nextSuspendStatus} />
              <button
                type="submit"
                className={
                  "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition " +
                  (nextSuspendStatus === "suspended"
                    ? "border border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100")
                }
              >
                {nextSuspendLabel}
              </button>
            </form>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Products</div>
              <div className="mt-1 text-2xl font-bold text-stone-950">{productsCount ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Invoices</div>
              <div className="mt-1 text-2xl font-bold text-stone-950">{invoicesCount ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Staff</div>
              <div className="mt-1 text-2xl font-bold text-stone-950">
                {staffCount} <span className="text-sm font-semibold text-stone-600">(+{ownerCount} owners)</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950">Members</h2>
          <p className="mt-1 text-sm text-stone-600">Owners and staff (first 100).</p>
          <div className="mt-4 space-y-3">
            {(members ?? ([] as MemberRow[]))
              .filter((m) => m.role !== "customer")
              .map((m) => (
                <div key={m.id} className="rounded-xl border border-stone-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-stone-900">{m.full_name ?? m.email ?? "—"}</div>
                      <div className="truncate text-xs text-stone-500">{m.email ?? m.mobile_number ?? "—"}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="font-semibold text-stone-800">{m.role}</div>
                      <div className={m.status === "SUSPENDED" ? "text-red-700" : "text-stone-600"}>{m.status}</div>
                    </div>
                  </div>
                </div>
              ))}
            {members && members.length === 0 ? <p className="text-sm text-stone-600">No members found.</p> : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-950">Edit shop info (safe)</h2>
        <p className="mt-1 text-sm text-stone-600">Update basic shop profile + invoice prefix/footer. No billing/inventory changes.</p>

        <form action={superadminUpdateShopInfoAction} className="mt-4 grid gap-4">
          <input type="hidden" name="shop_id" value={shop.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Shop name</label>
              <input name="name" defaultValue={shop.name} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Logo URL</label>
              <input name="logo_url" defaultValue={shop.logo_url ?? ""} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Phone</label>
              <input name="phone" defaultValue={shop.phone} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Email</label>
              <input name="email" type="email" defaultValue={shop.email} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium text-stone-800">Address line 1</label>
            <input name="address_line_1" defaultValue={shop.address_line_1} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium text-stone-800">Address line 2</label>
            <input name="address_line_2" defaultValue={shop.address_line_2 ?? ""} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">City</label>
              <input name="city" defaultValue={shop.city} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">State</label>
              <input name="state" defaultValue={shop.state} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Postal code</label>
              <input name="postal_code" defaultValue={shop.postal_code} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Invoice prefix</label>
              <input
                name="invoice_prefix"
                defaultValue={shopSettings?.invoice_prefix ?? ""}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium text-stone-800">Invoice footer</label>
              <input
                name="invoice_footer"
                defaultValue={shopSettings?.invoice_footer ?? ""}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button type="submit" className="rounded-2xl bg-stone-950 py-3 text-sm font-semibold text-white hover:bg-stone-800">
            Save shop info
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-950">Recent invoices</h2>
        <p className="mt-1 text-sm text-stone-600">Last 20 invoices.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-2">Invoice</th>
                <th className="py-2 pr-2">Customer</th>
                <th className="py-2 pr-2">Amount</th>
                <th className="py-2 pr-2">Payment</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {(recentInvoices ?? ([] as InvoiceRow[])).map((inv) => (
                <tr key={inv.id} className="border-b border-stone-100">
                  <td className="py-2 pr-2 font-semibold text-stone-900">{inv.invoice_number}</td>
                  <td className="py-2 pr-2 text-stone-700">
                    {inv.customer_name}
                    <div className="text-xs text-stone-500">{inv.customer_mobile ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-2 text-stone-900">{inv.grand_total}</td>
                  <td className="py-2 pr-2 text-stone-700">
                    {inv.payment_method} · {inv.payment_status}
                  </td>
                  <td className="py-2 text-stone-600">{new Date(inv.created_at).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {recentInvoices && recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-stone-600">
                    No invoices yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

