import { Suspense } from "react";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadBillingData } from "./load-billing-data";
import { BillingManager } from "./_components/billing-manager";
import { buildShopRoute } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ q?: string; period?: string; shop?: string }>;
};

export default async function BillingPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const { user, profile, shop, membership, products, invoiceHistory, categories, brands, planEntitlements } = await loadBillingData(query);

  if (shop?.slug) {
    if (!query.shop) {
      redirect(buildShopRoute(shop.slug, "billing"));
    }

    if (query.shop !== shop.slug) {
      redirect(buildShopRoute(shop.slug, "billing"));
    }
  }

  return (
    <WorkspaceShell
      title="Billing"
      activeNav="billing"
      hideHeader
      shopName={shop?.name ?? "Shop"}
      shopSlug={shop?.slug ?? null}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={membership?.role ?? profile?.role ?? "customer"}
      saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <Suspense fallback={null}>
        <BillingManager
          products={products}
          invoiceHistory={invoiceHistory}
          shopId={shop?.id ?? ""}
          categories={categories}
          brands={brands}
          shopLogoUrl={shop?.logo_url ?? null}
          shopPostalCode={shop?.postal_code ?? null}
          shopStampUrl={shop?.shop_stamp_url ?? null}
          settingsHref={shop?.slug ? `${buildShopRoute(shop.slug, "settings")}#stamp` : "/settings#stamp"}
          allowDigitalInvoiceAssets={
            planEntitlements
              ? planEntitlements.customer_signature === true && planEntitlements.shop_stamp === true
              : true
          }
          allowWhatsappInvoiceSending={planEntitlements ? planEntitlements.whatsapp_invoice_sending === true : true}
        />
      </Suspense>
    </WorkspaceShell>
  );
}
