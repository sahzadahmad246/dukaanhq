export type SaaSPlatformSettingsRow = {
  id: number;
  trial_enabled: boolean;
  trial_duration_days: number;
  plan_display_name: string;
  plan_price_paise: number;
  plan_currency: string;
};

export type ShopEntitlementRow = {
  shop_id: string;
  plan_id?: string | null;
  subscription_id?: string | null;
  billing_status: "trialing" | "active" | "locked";
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_valid_until: string | null;
  cashfree_subscription_id?: string | null;
  cashfree_customer_id?: string | null;
  cancel_at_period_end?: boolean | null;
};

const defaultPlatform: Pick<
  SaaSPlatformSettingsRow,
  "trial_enabled" | "trial_duration_days" | "plan_display_name" | "plan_price_paise" | "plan_currency"
> = {
  trial_enabled: true,
  trial_duration_days: 30,
  plan_display_name: "DukaanHQ Pro",
  plan_price_paise: 49900,
  plan_currency: "INR",
};

export function mergePlatformSettings(
  row: SaaSPlatformSettingsRow | null | undefined,
): SaaSPlatformSettingsRow {
  if (!row) {
    return { id: 1, ...defaultPlatform };
  }
  return row;
}

/** Whether the shop may use DukaanHQ workspace features (inventory, billing, etc.). */
export function shopHasProductAccess(
  entitlement: ShopEntitlementRow | null | undefined,
  platform: SaaSPlatformSettingsRow | null | undefined,
): boolean {
  if (!entitlement) {
    return true;
  }

  const p = mergePlatformSettings(platform);
  const now = Date.now();

  if (entitlement.billing_status === "active") {
    if (entitlement.subscription_valid_until == null) {
      return true;
    }
    return new Date(entitlement.subscription_valid_until).getTime() > now;
  }

  if (entitlement.billing_status === "trialing") {
    if (!p.trial_enabled) {
      return false;
    }
    if (!entitlement.trial_ends_at) {
      return false;
    }
    return new Date(entitlement.trial_ends_at).getTime() > now;
  }

  return false;
}

export function subscriptionBlockReason(
  entitlement: ShopEntitlementRow | null | undefined,
  platform: SaaSPlatformSettingsRow | null | undefined,
): "trial_ended" | "trial_disabled" | "locked" | "subscription_ended" | null {
  if (!entitlement) {
    return null;
  }
  const p = mergePlatformSettings(platform);
  const now = Date.now();

  if (entitlement.billing_status === "active") {
    if (entitlement.subscription_valid_until != null && new Date(entitlement.subscription_valid_until).getTime() <= now) {
      return "subscription_ended";
    }
    return null;
  }

  if (entitlement.billing_status === "trialing") {
    if (!p.trial_enabled) {
      return "trial_disabled";
    }
    if (entitlement.trial_ends_at && new Date(entitlement.trial_ends_at).getTime() <= now) {
      return "trial_ended";
    }
    return null;
  }

  if (entitlement.billing_status === "locked") {
    return "locked";
  }

  return "locked";
}
