import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { getUserAppState } from "@/lib/auth/user-flow";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getWorkspaceData(options?: { requireOwner?: boolean }) {
  noStore();

  const supabase = await createSupabaseServerClient();
  const {
    user,
    profile,
    profileSyncReady,
    membership,
    shopSettings,
    shopSlug,
    hasWorkspaceAccess,
    isSuspendedMembership,
    canManageStaff,
    hasCompletedOnboarding,
    canUseShopProduct,
    saasPlatform,
    shopEntitlement,
  } = await getUserAppState(supabase);

  if (!user) {
    redirect("/auth/login");
  }

  if (isSuspendedMembership) {
    redirect("/suspended");
  }

  if (!hasWorkspaceAccess) {
    redirect("/");
  }

  if (!hasCompletedOnboarding || !membership) {
    redirect("/onboarding");
  }

  if (!canUseShopProduct) {
    redirect(shopSlug ? buildShopRoute(shopSlug, "subscribe") : "/subscribe");
  }

  if (options?.requireOwner && !canManageStaff) {
    redirect(shopSlug ? buildShopRoute(shopSlug, "dashboard") : "/dashboard");
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, city, state, postal_code, status, logo_url, shop_stamp_url, address_line_1, address_line_2, category, latitude, longitude")
    .eq("id", membership.shop_id)
    .maybeSingle();

  const { data: fullShopSettings } = await supabase
    .from("shop_settings")
    .select("invoice_prefix, currency, tax_mode, invoice_footer, opening_time, closing_time, working_days, onboarding_completed")
    .eq("shop_id", membership.shop_id)
    .maybeSingle();

  return {
    user,
    profile,
    profileSyncReady,
    shop,
    shopSettings: fullShopSettings ?? shopSettings,
    membership,
    saasPlatform,
    shopEntitlement,
    canUseShopProduct,
  };
}
