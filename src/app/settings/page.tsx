import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { SettingsEditor } from "@/app/settings/_components/settings-editor";
import { ShopStampCard } from "@/app/settings/_components/shop-stamp-card";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 5);
}

export default async function SettingsPage() {
  const { user, profile, membership, shop, shopSettings } = await getWorkspaceData({ requireOwner: false });

  return (
    <WorkspaceShell
      title="Settings"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state, shop?.postal_code].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={membership?.role ?? profile?.role ?? "customer"}
      saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <div className="grid gap-5">
        <SettingsEditor
          initialState={{
            shopName: shop?.name ?? "",
            ownerName: profile?.full_name ?? user.user_metadata.full_name ?? "-",
            slug: shop?.slug ?? "",
            status: shop?.status ? `${shop.status.charAt(0).toUpperCase()}${shop.status.slice(1)}` : "-",
            category: shop?.category ?? "",
            addressLine1: shop?.address_line_1 ?? "",
            addressLine2: shop?.address_line_2 ?? "",
            city: shop?.city ?? "",
            state: shop?.state ?? "",
            postalCode: shop?.postal_code ?? "",
            invoicePrefix: shopSettings?.invoice_prefix ?? "",
            currency: shopSettings?.currency ?? "",
            taxMode: shopSettings?.tax_mode ?? "",
            onboarding: shopSettings?.onboarding_completed ? "Completed" : "Pending",
            openingTime: shopSettings?.opening_time ? formatTime(shopSettings.opening_time) : "",
            closingTime: shopSettings?.closing_time ? formatTime(shopSettings.closing_time) : "",
            workingDays: shopSettings?.working_days?.join(", ") ?? "",
            invoiceFooter: shopSettings?.invoice_footer ?? "",
            ownerEmail: profile?.email ?? user.email ?? "-",
            latitude: shop?.latitude ? Number(shop.latitude) : null,
            longitude: shop?.longitude ? Number(shop.longitude) : null,
          }}
        />
        <ShopStampCard initialStampUrl={shop?.shop_stamp_url ?? null} />
      </div>
    </WorkspaceShell>
  );
}
