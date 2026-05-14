import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanCode = "starter" | "growth" | "pro";
export type BillingInterval = "month" | "year";
export type SubscriptionIntentStatus =
  | "selected"
  | "trial_approved"
  | "payment_pending"
  | "payment_approved"
  | "expired"
  | "completed"
  | "cancelled";

export type SubscriptionIntentRow = {
  id: string;
  owner_user_id: string;
  owner_email: string;
  plan_id: string;
  price_id: string | null;
  plan_code: PlanCode;
  billing_interval: BillingInterval;
  status: SubscriptionIntentStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  provider: string | null;
  provider_checkout_session_id: string | null;
  provider_checkout_url: string | null;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_payment_method: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
  last_payment_status: string | null;
  expires_at: string;
  created_shop_id: string | null;
};

export function normalizePlanCode(value: string | null | undefined): PlanCode {
  if (value === "growth" || value === "pro") {
    return value;
  }
  return "starter";
}

export function normalizeBillingInterval(value: string | null | undefined): BillingInterval {
  return value === "year" ? "year" : "month";
}

export function isApprovedSubscriptionIntent(intent: SubscriptionIntentRow | null | undefined) {
  if (!intent) {
    return false;
  }

  const now = Date.now();
  if (intent.status === "trial_approved") {
    return Boolean(intent.trial_ends_at && new Date(intent.trial_ends_at).getTime() > now);
  }

  if (intent.status === "payment_approved") {
    return Boolean(!intent.current_period_end || new Date(intent.current_period_end).getTime() > now);
  }

  return false;
}

export async function getLatestApprovedSubscriptionIntent(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionIntentRow | null> {
  const { data, error } = await supabase
    .from("subscription_intents")
    .select(
      "id, owner_user_id, owner_email, plan_id, price_id, plan_code, billing_interval, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, provider, provider_checkout_session_id, provider_checkout_url, provider_subscription_id, provider_customer_id, provider_payment_id, provider_status, provider_payment_method, next_payment_at, last_payment_at, last_payment_status, expires_at, created_shop_id",
    )
    .eq("owner_user_id", userId)
    .in("status", ["trial_approved", "payment_approved"])
    .is("created_shop_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionIntentRow>();

  if (error) {
    return null;
  }

  return isApprovedSubscriptionIntent(data) ? data : null;
}
