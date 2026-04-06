import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";

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
  shopSettings: ShopSettingsRecord | null;
  isOwner: boolean;
  hasWorkspaceAccess: boolean;
  canManageStaff: boolean;
  hasCompletedOnboarding: boolean;
};

export async function getUserAppState(supabase: SupabaseClient): Promise<UserAppState> {
  const { user, profile, profileSyncReady } = await syncAuthenticatedUserProfile(supabase);

  if (!user) {
    return {
      user: null,
      profile,
      profileSyncReady,
      membership: null,
      shopSettings: null,
      isOwner: false,
      hasWorkspaceAccess: false,
      canManageStaff: false,
      hasCompletedOnboarding: false,
    };
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("shop_id, role, status, full_name, email, mobile_number")
    .eq("user_id", user.id)
    .maybeSingle<MembershipRecord>();

  const { data: shopSettings } = membership
    ? await supabase
        .from("shop_settings")
        .select("invoice_prefix, currency, tax_mode, invoice_footer, opening_time, closing_time, working_days, onboarding_completed")
        .eq("shop_id", membership.shop_id)
        .maybeSingle<ShopSettingsRecord>()
    : { data: null };

  const isOwner = profile?.role === "owner" || membership?.role === "owner";
  const hasWorkspaceAccess = Boolean(membership && membership.status !== "SUSPENDED" && ["owner", "admin"].includes(membership.role));
  const canManageStaff = membership?.role === "owner" && membership?.status !== "SUSPENDED";
  const hasCompletedOnboarding = Boolean(shopSettings?.onboarding_completed);

  return {
    user,
    profile,
    profileSyncReady,
    membership,
    shopSettings,
    isOwner,
    hasWorkspaceAccess,
    canManageStaff,
    hasCompletedOnboarding,
  };
}

export function getSignedInLandingPath(state: Pick<UserAppState, "hasWorkspaceAccess" | "isOwner" | "hasCompletedOnboarding">) {
  if (state.hasWorkspaceAccess && state.hasCompletedOnboarding) {
    return "/dashboard";
  }

  if (state.isOwner) {
    return "/onboarding";
  }

  return "/";
}

export function redirectSignedInUser(
  state: Pick<UserAppState, "user" | "hasWorkspaceAccess" | "isOwner" | "hasCompletedOnboarding">
) {
  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.hasWorkspaceAccess && !state.isOwner) {
    redirect("/");
  }

  if (!state.hasCompletedOnboarding) {
    redirect("/onboarding");
  }
}
