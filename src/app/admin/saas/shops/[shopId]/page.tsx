import Link from "next/link";
import { FileText, Mail, Package, Phone, User, Users } from "lucide-react";

import { SaasAdminHeader } from "@/app/admin/saas/_components/saas-admin-shell";
import { ShopHeaderMore } from "./_components/shop-header-more";
import {
  setShopStatusAction,
  superadminUpdateShopInfoAction,
} from "@/app/admin/saas/actions";
import { InvoiceFooterLinesEditor } from "@/components/invoice-footer-lines-editor";
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
  await searchParams;

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
      <SaasAdminHeader
        title={shop.name}
        backHref="/admin/saas/shops"
        rightContent={<ShopHeaderMore shop={shop} shopSettings={shopSettings} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-stone-950">Overview</h2>
              <span className="text-sm text-stone-500">· {shop.status}</span>
            </div>
            <form action={setShopStatusAction}>
              <input type="hidden" name="shop_id" value={shop.id} />
              <input type="hidden" name="status" value={nextSuspendStatus} />
              <button
                type="submit"
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
              >
                {nextSuspendLabel}
              </button>
            </form>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-600">
            <span className="flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-stone-400" />
              {shop.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-stone-400" />
              {shop.email}
            </span>
          </div>

          <div className="my-4 h-px bg-stone-100" />

          <div className="flex items-center justify-between text-center">
            <div className="flex-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500">
                <Package className="h-4 w-4" /> Products
              </div>
              <div className="mt-1 text-2xl font-semibold text-stone-950">{productsCount ?? 0}</div>
            </div>
            <div className="h-8 w-px bg-stone-200" />
            <div className="flex-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500">
                <FileText className="h-4 w-4" /> Invoices
              </div>
              <div className="mt-1 text-2xl font-semibold text-stone-950">{invoicesCount ?? 0}</div>
            </div>
            <div className="h-8 w-px bg-stone-200" />
            <div className="flex-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500">
                <Users className="h-4 w-4" /> Staff
              </div>
              <div className="mt-1 text-2xl font-semibold text-stone-950">
                {staffCount} <span className="text-xs text-stone-500">(+{ownerCount})</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-stone-500" />
            <h2 className="text-lg font-semibold text-stone-950">Members</h2>
            <span className="text-sm text-stone-500">({(members ?? []).filter((m) => m.role !== "customer").length})</span>
          </div>

          <div>
            {(members ?? ([] as MemberRow[]))
              .filter((m) => m.role !== "customer")
              .map((m, index, arr) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-3 border-b border-stone-100 last:border-b-0">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-stone-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-950">{m.full_name ?? m.email ?? "—"}</div>
                      <div className="truncate text-xs text-stone-500">{m.email ?? m.mobile_number ?? "—"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <div className="font-medium text-stone-800 capitalize">{m.role}</div>
                    <div className={`text-xs ${m.status === "SUSPENDED" ? "text-red-600" : "text-stone-500"}`}>{m.status}</div>
                  </div>
                </div>
              ))}
            {members && members.length === 0 ? <p className="text-sm text-stone-600 py-2">No members found.</p> : null}
          </div>
        </section>
      </div>

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
