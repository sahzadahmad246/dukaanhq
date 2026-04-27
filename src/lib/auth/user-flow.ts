import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";
import {
  shopHasProductAccess,
  type SaaSPlatformSettingsRow,
  type ShopEntitlementRow,
} from "@/lib/subscription/access";
import { buildShopRoute } from "@/lib/shop-routes";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

type MembershipRecord = {
  shop_id: string;
  role: string;
  status?: "ACTIVE" | "SUSPENDED" | null;
  full_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
};

export type ShopSettingsRecord = {
  invoice_prefix?: string | null;
  currency?: string | null;
  tax_mode?: string | null;
  invoice_footer?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  working_days?: string[] | null;
  onboarding_completed: boolean;
};

type ProfileRecord = Awaited<ReturnType<typeof syncAuthenticatedUserProfile>>["profile"];

export type UserAppState = {
  user: User | null;
  profile: ProfileRecord;
  profileSyncReady: boolean;
  membership: MembershipRecord | null;
  shopSlug: string | null;
  shopSettings: ShopSettingsRecord | null;
  isOwner: boolean;
  isSuperAdmin: boolean;
  isSuspendedMembership: boolean;
  hasWorkspaceAccess: boolean;
  canManageStaff: boolean;
  hasCompletedOnboarding: boolean;
  saasPlatform: SaaSPlatformSettingsRow | null;
  shopEntitlement: ShopEntitlementRow | null;
  subscriptionTablesReady: boolean;
  canUseShopProduct: boolean;
};

export async function getUserAppState(supabase: SupabaseClient): Promise<UserAppState> {
  noStore();

  const { user, profile, profileSyncReady } = await syncAuthenticatedUserProfile(supabase);

  if (!user) {
    return {
      user: null,
      profile,
      profileSyncReady,
      membership: null,
      shopSlug: null,
      shopSettings: null,
      isOwner: false,
      isSuperAdmin: false,
      isSuspendedMembership: false,
      hasWorkspaceAccess: false,
      canManageStaff: false,
      hasCompletedOnboarding: false,
      saasPlatform: null,
      shopEntitlement: null,
      subscriptionTablesReady: false,
      canUseShopProduct: true,
    };
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("shop_id, role, status, full_name, email, mobile_number")
    .eq("user_id", user.id)
    .maybeSingle<MembershipRecord>();

  const { data: shopRow } = membership
    ? await supabase
        .from("shops")
        .select("slug")
        .eq("id", membership.shop_id)
        .maybeSingle<{ slug: string }>()
    : { data: null };

  const { data: shopSettings } = membership
    ? await supabase
        .from("shop_settings")
        .select("invoice_prefix, currency, tax_mode, invoice_footer, opening_time, closing_time, working_days, onboarding_completed")
        .eq("shop_id", membership.shop_id)
        .maybeSingle<ShopSettingsRecord>()
    : { data: null };

  const isOwner = profile?.role === "owner" || membership?.role === "owner";
  const isSuperAdmin = profile?.role === "superadmin";
  const isSuspendedMembership = membership?.status === "SUSPENDED";
  const hasWorkspaceAccess = Boolean(
    membership && !isSuspendedMembership && ["owner", "staff"].includes(membership.role),
  );
  const canManageStaff = membership?.role === "owner" && !isSuspendedMembership;
  const hasCompletedOnboarding = Boolean(shopSettings?.onboarding_completed);

  let saasPlatform: SaaSPlatformSettingsRow | null = null;
  let shopEntitlement: ShopEntitlementRow | null = null;
  let subscriptionTablesReady = true;

  const { data: platRow, error: platErr } = await supabase
    .from("saas_platform_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle<SaaSPlatformSettingsRow>();

  if (platErr?.code && MISSING_TABLE_CODES.has(platErr.code)) {
    subscriptionTablesReady = false;
  } else if (!platErr) {
    saasPlatform = platRow ?? null;
  }

  if (subscriptionTablesReady && membership && hasCompletedOnboarding) {
    const { data: entRow, error: entErr } = await supabase
      .from("shop_entitlements")
      .select(
        "shop_id, billing_status, trial_started_at, trial_ends_at, subscription_valid_until, cashfree_subscription_id, cashfree_customer_id",
      )
      .eq("shop_id", membership.shop_id)
      .maybeSingle<ShopEntitlementRow>();

    if (entErr?.code && MISSING_TABLE_CODES.has(entErr.code)) {
      subscriptionTablesReady = false;
    } else if (!entErr) {
      shopEntitlement = entRow ?? null;
    }
  }

  let canUseShopProduct = true;
  if (!subscriptionTablesReady) {
    canUseShopProduct = true;
  } else if (membership && hasCompletedOnboarding) {
    canUseShopProduct =
      shopEntitlement != null && shopHasProductAccess(shopEntitlement, saasPlatform);
  }

  return {
    user,
    profile,
    profileSyncReady,
    membership,
    shopSlug: shopRow?.slug ?? null,
    shopSettings,
    isOwner,
    isSuperAdmin,
    isSuspendedMembership,
    hasWorkspaceAccess,
    canManageStaff,
    hasCompletedOnboarding,
    saasPlatform,
    shopEntitlement,
    subscriptionTablesReady,
    canUseShopProduct,
  };
}

export function getSignedInLandingPath(
  state: Pick<
    UserAppState,
    | "hasWorkspaceAccess"
    | "isOwner"
    | "hasCompletedOnboarding"
    | "canUseShopProduct"
    | "isSuperAdmin"
    | "isSuspendedMembership"
    | "shopSlug"
  >,
) {
  if (state.isSuspendedMembership) {
    return "/suspended";
  }

  if (state.hasWorkspaceAccess && state.hasCompletedOnboarding) {
    if (!state.canUseShopProduct) {
      return state.shopSlug ? buildShopRoute(state.shopSlug, "subscribe") : "/subscribe";
    }
    return state.shopSlug ? buildShopRoute(state.shopSlug, "dashboard") : "/dashboard";
  }

  if (state.isOwner) {
    return "/onboarding";
  }

  if (state.isSuperAdmin) {
    return "/admin/saas";
  }

  return "/";
}

export function redirectSignedInUser(
  state: Pick<UserAppState, "user" | "hasWorkspaceAccess" | "isOwner" | "hasCompletedOnboarding" | "isSuspendedMembership">,
) {
  if (!state.user) {
    redirect("/auth/login");
  }

  if (state.isSuspendedMembership) {
    redirect("/suspended");
  }

  if (!state.hasWorkspaceAccess && !state.isOwner) {
    redirect("/");
  }

  if (!state.hasCompletedOnboarding) {
    redirect("/onboarding");
  }
}
