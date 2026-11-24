import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicPlanPriceRow = {
  id?: string;
  interval: "month" | "year";
  regular_price_paise: number;
  discounted_price_paise: number | null;
  discount_enabled: boolean;
  discount_type?: "none" | "percent" | "amount";
  discount_value?: number;
  discount_ends_at?: string | null;
  provider_trial_days?: number | null;
};

export type PublicPlanRow = {
  id: string;
  code: "starter" | "growth" | "pro";
  display_name: string;
  tagline: string;
  description?: string | null;
  features: string[] | null;
  limits?: {
    products?: number | null;
    invoices_per_month?: number | null;
    staff?: number | null;
  } | null;
  entitlements?: Record<string, boolean> | null;
  support_level: "standard" | "priority";
  saas_plan_prices: PublicPlanPriceRow[] | null;
};

const trialFallback: Record<string, number> = {
  "starter:month": 7,
  "starter:year": 7,
};

function withTrialFallback<T extends PublicPlanRow>(plan: T): T {
  return {
    ...plan,
    saas_plan_prices: (plan.saas_plan_prices ?? []).map((price) => ({
      ...price,
      provider_trial_days: price.provider_trial_days ?? trialFallback[`${plan.code}:${price.interval}`] ?? 0,
    })),
  };
}

export async function fetchActiveSaasPlans<T extends PublicPlanRow>(
  supabase: SupabaseClient,
  columns: string,
) {
  const withTrial = await supabase
    .from("saas_plans")
    .select(columns)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!withTrial.error) {
    return {
      data: ((withTrial.data ?? []) as unknown as T[]).map(withTrialFallback),
      error: null,
    };
  }

  if (!withTrial.error.message.includes("provider_trial_days")) {
    return { data: null, error: withTrial.error };
  }

  const withoutTrial = await supabase
    .from("saas_plans")
    .select(columns.replace(/,\s*provider_trial_days/g, ""))
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return {
    data: withoutTrial.error ? null : ((withoutTrial.data ?? []) as unknown as T[]).map(withTrialFallback),
    error: withoutTrial.error,
  };
}

export async function fetchActiveSaasPlanByCode<T extends PublicPlanRow>(
  supabase: SupabaseClient,
  code: string,
  columns: string,
) {
  const withTrial = await supabase
    .from("saas_plans")
    .select(columns)
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle<T>();

  if (!withTrial.error) {
    return {
      data: withTrial.data ? withTrialFallback(withTrial.data) : null,
      error: null,
    };
  }

  if (!withTrial.error.message.includes("provider_trial_days")) {
    return { data: null, error: withTrial.error };
  }

  const withoutTrial = await supabase
    .from("saas_plans")
    .select(columns.replace(/,\s*provider_trial_days/g, ""))
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle<T>();

  return {
    data: withoutTrial.data ? withTrialFallback(withoutTrial.data) : null,
    error: withoutTrial.error,
  };
}
