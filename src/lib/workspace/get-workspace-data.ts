import { redirect } from "next/navigation";

import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getWorkspaceData() {
  const supabase = await createSupabaseServerClient();
  const { user, profile, profileSyncReady, membership, shopSettings, isOwner, hasCompletedOnboarding } =
    await getUserAppState(supabase);

  if (!user) {
    redirect("/auth/login");
  }

  if (!isOwner) {
    redirect("/");
  }

  if (!hasCompletedOnboarding || !membership) {
    redirect("/onboarding");
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, city, state, status, logo_url, address_line_1, address_line_2, category, latitude, longitude")
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
  };
}
