import Link from "next/link";
import { ArrowRight, Building2, FileText, Package, Users } from "lucide-react";

import { cn } from "@/lib/utils";
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
  await searchParams;

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

  return (
    <div className="space-y-6">
      {/* Modern 2-column stat cards (match shop dashboard visual language) */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Total shops", value: totalShops ?? 0, icon: Building2, bg: "#f0fdf4", border: "#bbf7d0", color: "#166534", blob: "#22c55e" },
          { label: "Team members", value: totalMembers ?? 0, icon: Users, bg: "#f5f3ff", border: "#ddd6fe", color: "#6b21a8", blob: "#a855f7" },
          { label: "Products", value: totalProducts ?? 0, icon: Package, bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", blob: "#3b82f6" },
          { label: "Invoices", value: totalInvoices ?? 0, icon: FileText, bg: "#fff7ed", border: "#fed7aa", color: "#9a3412", blob: "#f97316" },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={index}
              className="relative overflow-hidden rounded-2xl border p-4"
              style={{ background: item.bg, borderColor: item.border }}
            >
              <div
                className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
                style={{ color: item.color }}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </div>
              <div className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-stone-950">{item.value}</div>
              <div
                className="absolute -bottom-2.5 -right-2.5 h-10 w-10 rounded-full"
                style={{ background: item.blob, opacity: 0.22 }}
              />
            </div>
          );
        })}
      </div>

      {/* Recent shops — 1 col on mobile, 2 cols on desktop.
          Each shop has top info (name/slug + ends date) + three beautiful mini cards below (value on top, label on bottom).
          Horizontal lines separate rows of shops, vertical line separates the two columns.
          Lines are single (no duplicates) thanks to the grid + strategic borders + outer container. */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-stone-500" aria-hidden="true" />
            <h2 className="text-base font-bold text-stone-950">Recent shops</h2>
          </div>
          <Link href="/admin/saas/shops" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-700 hover:text-stone-950">
            View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {(shops ?? []).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {(shops as ShopRow[]).map((shop, index, arr) => {
              const ent = entByShop.get(shop.id) as EntRow | undefined;
              const isLast = index === arr.length - 1;
              const isRightColumn = (index + 1) % 2 === 0;

              // Helper for 3-letter lowercase month (jan, feb, etc.)
              const formatShortDate = (dateStr: string) => {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return "—";
                const day = d.getDate();
                const mon = d.toLocaleString("en-IN", { month: "short" }).toLowerCase().slice(0, 3);
                const yr = d.getFullYear();
                return `${day} ${mon} ${yr}`;
              };

              const joined = formatShortDate(shop.created_at);

              let endsDate = "—";
              if (ent?.trial_ends_at) {
                endsDate = formatShortDate(ent.trial_ends_at);
              } else if (ent?.subscription_valid_until) {
                endsDate = formatShortDate(ent.subscription_valid_until);
              }

              const billingStatus = ent?.billing_status ?? "none";

              return (
                <Link
                  key={shop.id}
                  href={`/admin/saas/shops/${shop.id}`}
                  className={cn(
                    "block p-4 hover:bg-stone-50 active:bg-stone-100 transition-colors",
                    "border-b border-r border-stone-200",
                    "last:border-b-0",
                    isRightColumn && "lg:border-r-0",
                    "lg:[&:nth-last-child(-n+2)]:border-b-0"
                  )}
                >
                  {/* Top: name + slug (left) | membership ends date + arrow (right) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-950 truncate">{shop.name}</div>
                      <div className="text-xs font-mono text-stone-500">{shop.slug}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-700 flex-shrink-0 text-right">
                      {endsDate}
                      <ArrowRight className="h-4 w-4 text-stone-400" />
                    </div>
                  </div>

                  {/* Lower part: three narrower cards spread evenly across the width.
                      Equal space on sides + between cards (using flex-1 spacers).
                      Each card has reduced fixed width.
                      Different bg for value (top) vs label (bottom) + separator line between them. */}
                  <div className="mt-3 flex items-center">
                    <div className="flex-1" />
                    {/* Joined mini card — wider because date is longer (e.g. "12 jan 2026") */}
                    <div className="w-[92px] overflow-hidden rounded-lg border border-stone-200 text-center">
                      <div className="bg-white py-1.5">
                        <div className="text-sm font-semibold text-stone-950 tabular-nums">{joined}</div>
                      </div>
                      <div className="h-px bg-stone-200" />
                      <div className="bg-stone-100 py-1">
                        <div className="text-[9px] font-medium uppercase tracking-[0.6px] text-stone-400">Joined at</div>
                      </div>
                    </div>
                    <div className="flex-1" />
                    {/* Status mini card — neutral, narrower */}
                    <div className="w-[72px] overflow-hidden rounded-lg border border-stone-200 text-center">
                      <div className="bg-white py-1.5">
                        <div className="text-sm font-semibold text-stone-700">{shop.status ?? "unknown"}</div>
                      </div>
                      <div className="h-px bg-stone-200" />
                      <div className="bg-stone-100 py-1">
                        <div className="text-[9px] font-medium uppercase tracking-[0.6px] text-stone-400">Status</div>
                      </div>
                    </div>
                    <div className="flex-1" />
                    {/* Billing mini card — neutral, narrower */}
                    <div className="w-[72px] overflow-hidden rounded-lg border border-stone-200 text-center">
                      <div className="bg-white py-1.5">
                        <div className="text-sm font-semibold text-stone-700">{billingStatus}</div>
                      </div>
                      <div className="h-px bg-stone-200" />
                      <div className="bg-stone-100 py-1">
                        <div className="text-[9px] font-medium uppercase tracking-[0.6px] text-stone-400">Billing</div>
                      </div>
                    </div>
                    <div className="flex-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-stone-600 border-t border-stone-200">
            No shops are visible. Apply <code className="font-mono">db/032_superadmin_rls_read_access.sql</code> if shops exist.
          </div>
        )}
      </section>
    </div>
  );
}
