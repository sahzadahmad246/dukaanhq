import { redirect } from "next/navigation";

import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getWorkspaceData() {
  const supabase = await createSupabaseServerClient();
  const { user, profile, profileSyncReady } = await syncAuthenticatedUserProfile(supabase);

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  const { data: shop } = membership
    ? await supabase
        .from("shops")
        .select("id, name, slug, city, state, status, logo_url, address_line_1, address_line_2, category, latitude, longitude")
        .eq("id", membership.shop_id)
        .maybeSingle()
    : { data: null };

  const { data: shopSettings } = membership
    ? await supabase
        .from("shop_settings")
        .select("invoice_prefix, currency, tax_mode, invoice_footer, opening_time, closing_time, working_days, onboarding_completed")
        .eq("shop_id", membership.shop_id)
        .maybeSingle()
    : { data: null };

  return {
    user,
    profile,
    profileSyncReady,
    shop,
    shopSettings,
    membership,
  };
}
