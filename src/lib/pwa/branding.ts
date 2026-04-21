import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserAppState } from "@/lib/auth/user-flow";

type PwaBranding = {
  name: string;
  shortName: string;
  description: string;
  iconUrl: string;
  startUrl: string;
};

const DEFAULT_BRANDING: PwaBranding = {
  name: "DukaanHQ",
  shortName: "DukaanHQ",
  description: "DukaanHQ is a SaaS for electronics shops to manage products, create bills, and generate invoices faster.",
  iconUrl: "/logo.png",
  startUrl: "https://dukaanhq.com/",
};

export async function getPwaBranding(): Promise<PwaBranding> {
  try {
    const supabase = await createSupabaseServerClient();
    const { user, membership, hasWorkspaceAccess } = await getUserAppState(supabase);

    if (user && hasWorkspaceAccess && membership?.shop_id) {
      const { data: shop } = await supabase
        .from("shops")
        .select("name, logo_url")
        .eq("id", membership.shop_id)
        .maybeSingle();

      if (shop) {
        return {
          name: shop.name || DEFAULT_BRANDING.name,
          shortName: shop.name || DEFAULT_BRANDING.shortName,
          description: `Manage ${shop.name} with DukaanHQ.`,
          iconUrl: shop.logo_url || DEFAULT_BRANDING.iconUrl,
          startUrl: "https://dukaanhq.com/dashboard",
        };
      }
    }
  } catch (error) {
    console.error("[PWA Manifest] Failed to load dynamic branding:", error);
  }

  return DEFAULT_BRANDING;
}
