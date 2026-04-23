import { Suspense } from "react";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { loadBillingData } from "./load-billing-data";
import { BillingManager } from "./_components/billing-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ q?: string; period?: string }>;
};

export default async function BillingPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const { user, profile, shop, membership, products, invoices, categories, brands } = await loadBillingData(query);

  return (
    <WorkspaceShell
      title="Billing"
      activeNav="billing"
      hideHeader
      shopName={shop?.name ?? "Shop"}
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
          invoices={invoices}
          categories={categories}
          brands={brands}
          shopLogoUrl={shop?.logo_url ?? null}
          shopPostalCode={shop?.postal_code ?? null}
          shopStampUrl={shop?.shop_stamp_url ?? null}
        />
      </Suspense>
    </WorkspaceShell>
  );
}
