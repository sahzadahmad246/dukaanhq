import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { SettingsEditor } from "@/app/settings/_components/settings-editor";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 5);
}

export default async function SettingsPage() {
  const { user, profile, membership, shop, shopSettings } = await getWorkspaceData({ requireOwner: true });

  return (
    <WorkspaceShell
      title="Settings"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole={membership?.role ?? profile?.role ?? "customer"}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
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
    </WorkspaceShell>
  );
}
