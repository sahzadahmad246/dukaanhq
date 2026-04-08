import { createSupabaseServerClient } from "@/lib/supabase/server";

type PwaBranding = {
  name: string;
  shortName: string;
  description: string;
  iconUrl: string | null;
  startUrl: string;
};

const DEFAULT_BRANDING: PwaBranding = {
  name: "DukaanHQ",
  shortName: "DukaanHQ",
  description: "Mobile-first SaaS for retail shops, billing, inventory, and storefronts.",
  iconUrl: null,
  startUrl: "/",
};

export async function getPwaBranding(): Promise<PwaBranding> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      return DEFAULT_BRANDING;
    }

    const { data: membership } = await supabase
      .from("shop_members")
      .select("shop_id, status")
      .eq("user_id", user.id)
      .neq("status", "SUSPENDED")
      .maybeSingle<{ shop_id: string; status?: string | null }>();

    if (!membership?.shop_id) {
      return DEFAULT_BRANDING;
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("name, logo_url")
      .eq("id", membership.shop_id)
      .maybeSingle<{ name?: string | null; logo_url?: string | null }>();

    if (!shop?.name?.trim()) {
      return DEFAULT_BRANDING;
    }

    return {
      name: shop.name.trim(),
      shortName: shop.name.trim().slice(0, 48),
      description: `Open ${shop.name.trim()} on your home screen with DukaanHQ.`,
      iconUrl: shop.logo_url ?? null,
      startUrl: "/dashboard",
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}
