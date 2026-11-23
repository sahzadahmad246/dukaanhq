import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadBillingData } from "@/app/billing/load-billing-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildShopRoute } from "@/lib/shop-routes";
import type { SecondHandPurchase, SecondHandUnit } from "@/lib/types/second-hand";
import { SecondHandManager } from "./_components/second-hand-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SecondHandPage({ searchParams }: {
  searchParams: Promise<{ shop?: string; tab?: string; q?: string; period?: string }>;
}) {
  const query = await searchParams;
  const data = await loadBillingData(query.tab === "bills" ? query : undefined, true);
  const { user, profile, shop, membership } = data;
  if (!shop) redirect("/onboarding");
  if (query.shop !== shop.slug) {
    const params = new URLSearchParams();
    for (const key of ["tab", "q", "period"] as const) if (query[key]) params.set(key, query[key]);
    redirect(`${buildShopRoute(shop.slug, "second-hand")}${params.size ? `?${params}` : ""}`);
  }
  const supabase = await createSupabaseServerClient();
  const [purchases, units] = await Promise.all([
    supabase.from("second_hand_purchases").select("id, product_id, seller_name, seller_phone, purchase_source, purchase_date, original_invoice_path")
      .eq("shop_id", shop.id).order("created_at", { ascending: false }),
    supabase.from("inventory_items").select("id, product_id, variant_id, imei_1, imei_2, status, sold_at, product:products!inner(is_second_hand)")
      .eq("shop_id", shop.id).eq("product.is_second_hand", true),
  ]);
  if (purchases.error || units.error) throw new Error("Could not load second-hand stock. Check that migration 043 has been applied.");
  return <WorkspaceShell title="Second-hand phones" activeNav="second-hand"
    shopName={shop.name} shopSlug={shop.slug}
    shopAddress={[shop.address_line_1, shop.city, shop.state].filter(Boolean).join(", ")}
    shopLogoUrl={shop.logo_url ?? null} ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
    ownerEmail={profile?.email ?? user.email ?? ""} ownerRole={membership?.role ?? "owner"}
    saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
    userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}>
    <Suspense fallback={null}><SecondHandManager products={data.products} invoices={data.invoices}
      invoiceHistory={data.invoiceHistory} shopId={shop.id}
      categories={data.categories} brands={data.brands} planEntitlements={data.planEntitlements}
      purchases={(purchases.data ?? []) as SecondHandPurchase[]} units={(units.data ?? []) as SecondHandUnit[]}
      shopSlug={shop.slug} shopLogoUrl={shop.logo_url ?? null} shopPostalCode={shop.postal_code ?? null}
      shopStampUrl={shop.shop_stamp_url ?? null} activeTab={query.tab === "bills" ? "bills" : "stock"} /></Suspense>
  </WorkspaceShell>;
}
