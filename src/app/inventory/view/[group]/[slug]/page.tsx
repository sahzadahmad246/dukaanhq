import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { InventoryGroupView } from "@/app/inventory/_components/inventory-group-view";
import { loadInventoryData } from "@/app/inventory/load-inventory-data";
import { slugifySegment } from "@/app/inventory/inventory-utils";

type GroupType = "brand" | "category" | "profile";

export default async function InventoryGroupPage({
  params,
}: {
  params: Promise<{ group: GroupType; slug: string }>;
}) {
  const { group, slug } = await params;
  const { user, profile, shop, membership, products } = await loadInventoryData();

  const filteredProducts = products.filter((product) => {
    if (group === "brand") {
      return slugifySegment(product.brand?.name ?? "unbranded") === slug;
    }
    if (group === "category") {
      return slugifySegment(product.category?.name ?? "uncategorized") === slug;
    }
    return slugifySegment(
      product.product_kind === "MOBILE"
        ? "mobile phones"
        : product.product_kind === "SERIALIZED"
          ? "serialized products"
          : "qty based products"
    ) === slug;
  });

  const pageTitle =
    group === "brand"
      ? filteredProducts[0]?.brand?.name ?? "Brand Products"
      : group === "category"
        ? filteredProducts[0]?.category?.name ?? "Category Products"
        : filteredProducts[0]?.product_kind === "MOBILE"
          ? "Mobile Phones"
          : filteredProducts[0]?.product_kind === "SERIALIZED"
            ? "Serialized Products"
            : "Qty Based Products";

  return (
    <WorkspaceShell
      title={pageTitle}
      activeNav="inventory"
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
      <InventoryGroupView
        title={pageTitle}
        products={filteredProducts}
        userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
        avatarFallback={(shop?.name ?? "S").slice(0, 1).toUpperCase()}
      />
    </WorkspaceShell>
  );
}
