"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createCashfreeSubscription } from "@/lib/cashfree/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeBillingInterval,
  normalizePlanCode,
} from "@/lib/subscription/intents";

const STARTER_TRIAL_DAYS = 7;

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function safeCustomerId(userId: string) {
  return `dhq_${userId.replace(/-/g, "").slice(0, 32)}`;
}

function normalizeCustomerPhone(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 10);
}

export async function startStarterTrialAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?plan=starter&billing=month");
  }

  const planCode = normalizePlanCode(String(formData.get("plan") ?? "starter"));
  const billingInterval = normalizeBillingInterval(String(formData.get("billing") ?? "month"));

  if (planCode !== "starter") {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=trial_only_starter`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/subscribe/start?plan=starter&error=server_not_configured");
  }

  const { data: membership } = await admin
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.shop_id) {
    redirect("/");
  }

  const { data: usedTrial } = await admin
    .from("trial_grants")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("plan_code", "starter")
    .maybeSingle();

  if (usedTrial) {
    redirect("/subscribe/start?plan=starter&error=trial_already_used");
  }

  const { data: plan, error: planError } = await admin
    .from("saas_plans")
    .select("id, code")
    .eq("code", "starter")
    .maybeSingle<{ id: string; code: string }>();

  if (planError || !plan) {
    redirect(`/subscribe/start?plan=starter&error=${encodeURIComponent(planError?.message ?? "starter_plan_missing")}`);
  }

  const { data: price } = await admin
    .from("saas_plan_prices")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("interval", billingInterval)
    .eq("interval_count", 1)
    .maybeSingle<{ id: string }>();

  const now = new Date();
  const trialEnds = new Date(now.getTime() + STARTER_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const ownerEmail = user.email?.trim().toLowerCase() ?? "";

  const { data: intent, error: intentError } = await admin
    .from("subscription_intents")
    .insert({
      owner_user_id: user.id,
      owner_email: ownerEmail,
      plan_id: plan.id,
      price_id: price?.id ?? null,
      plan_code: "starter",
      billing_interval: billingInterval,
      status: "trial_approved",
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
      expires_at: trialEnds.toISOString(),
      metadata: {
        source: "public_pricing",
        trial_days: STARTER_TRIAL_DAYS,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (intentError || !intent) {
    redirect(`/subscribe/start?plan=starter&error=${encodeURIComponent(intentError?.message ?? "trial_intent_failed")}`);
  }

  const { error: grantError } = await admin.from("trial_grants").insert({
    owner_user_id: user.id,
    owner_email: ownerEmail,
    subscription_intent_id: intent.id,
    plan_code: "starter",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    source: "self_serve",
  });

  if (grantError) {
    await admin.from("subscription_intents").update({ status: "cancelled" }).eq("id", intent.id);
    redirect(`/subscribe/start?plan=starter&error=${encodeURIComponent(grantError.message)}`);
  }

  const cookieStore = await cookies();
  cookieStore.delete("dukaanhq_selected_plan");
  cookieStore.delete("dukaanhq_selected_billing");

  redirect("/onboarding");
}

export async function createPaidSubscriptionIntentAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const planCode = normalizePlanCode(String(formData.get("plan") ?? "growth"));
  const billingInterval = normalizeBillingInterval(String(formData.get("billing") ?? "month"));
  const customerPhone = normalizeCustomerPhone(formData.get("customerPhone"));

  if (!user) {
    redirect(`/auth/login?plan=${planCode}&billing=${billingInterval}`);
  }

  if (planCode === "starter") {
    redirect(`/subscribe/start?plan=starter&billing=${billingInterval}`);
  }

  if (!/^\d{10}$/.test(customerPhone)) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=valid_phone_required`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=server_not_configured`);
  }

  const { data: membership } = await admin
    .from("shop_members")
    .select("shop_id, role, status")
    .eq("user_id", user.id)
    .maybeSingle<{ shop_id: string; role: string; status: string }>();

  if (membership && (membership.role !== "owner" || membership.status !== "ACTIVE")) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=owner_required`);
  }

  const { data: plan, error: planError } = await admin
    .from("saas_plans")
    .select("id, code, display_name")
    .eq("code", planCode)
    .maybeSingle<{ id: string; code: string; display_name: string }>();

  if (planError || !plan) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(planError?.message ?? "plan_missing")}`);
  }

  const { data: price, error: priceError } = await admin
    .from("saas_plan_prices")
    .select("id, regular_price_paise, discounted_price_paise, discount_enabled")
    .eq("plan_id", plan.id)
    .eq("interval", billingInterval)
    .eq("interval_count", 1)
    .maybeSingle<{ id: string; regular_price_paise: number; discounted_price_paise: number | null; discount_enabled: boolean }>();

  if (priceError || !price) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(priceError?.message ?? "price_missing")}`);
  }

  const amountPaise = price.discount_enabled && price.discounted_price_paise !== null
    ? price.discounted_price_paise
    : price.regular_price_paise;
  const amount = Math.max(1, Math.round(amountPaise / 100));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const ownerEmail = user.email?.trim().toLowerCase() ?? "";

  const { data: intent, error: intentError } = await admin
    .from("subscription_intents")
    .insert({
      owner_user_id: user.id,
      owner_email: ownerEmail,
      plan_id: plan.id,
      price_id: price.id,
      plan_code: planCode,
      billing_interval: billingInterval,
      status: "payment_pending",
      expires_at: expiresAt.toISOString(),
      created_shop_id: membership?.shop_id ?? null,
      metadata: {
        source: "public_pricing",
        customer_phone: customerPhone,
        mode: membership?.shop_id ? "shop_plan_change" : "pre_onboarding",
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (intentError || !intent) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(intentError?.message ?? "intent_failed")}`);
  }

  const cashfreeSubscriptionId = `dhq_intent_${intent.id.replace(/-/g, "").slice(0, 20)}_${planCode}`;

  try {
    const response = await createCashfreeSubscription({
      subscription_id: cashfreeSubscriptionId,
      customer_details: {
        customer_id: safeCustomerId(user.id),
        customer_name: user.user_metadata.full_name ?? user.user_metadata.name ?? ownerEmail,
        customer_email: ownerEmail,
        customer_phone: customerPhone,
      },
      plan_details: {
        plan_name: `${plan.display_name} ${billingInterval}`,
        plan_type: "PERIODIC",
        plan_amount: amount,
        plan_currency: "INR",
        plan_interval_type: billingInterval === "year" ? "YEAR" : "MONTH",
        plan_intervals: 1,
      },
      subscription_meta: {
        return_url: `${appUrl()}/api/cashfree/subscription-return?intent=${intent.id}`,
      },
      subscription_tags: {
        dukaanhq_intent_id: intent.id,
        dukaanhq_owner_user_id: user.id,
        dukaanhq_plan_code: planCode,
        dukaanhq_price_id: price.id,
      },
    });

    await admin
      .from("subscription_intents")
      .update({
        cashfree_subscription_id: typeof response.subscription_id === "string" ? response.subscription_id : cashfreeSubscriptionId,
        cashfree_cf_subscription_id: typeof response.cf_subscription_id === "string" ? response.cf_subscription_id : null,
        cashfree_subscription_session_id: typeof response.subscription_session_id === "string" ? response.subscription_session_id : null,
        cashfree_authorization_status: typeof response.subscription_status === "string" ? response.subscription_status : null,
        metadata: {
          source: "public_pricing",
          customer_phone: customerPhone,
          mode: membership?.shop_id ? "shop_plan_change" : "pre_onboarding",
          cashfree_create_response: response,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", intent.id);

    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&intent=${intent.id}&cashfree=created`);
  } catch (error) {
    await admin
      .from("subscription_intents")
      .update({
        status: "cancelled",
        metadata: {
          source: "public_pricing",
          cashfree_error: error instanceof Error ? error.message : "Cashfree subscription failed",
        },
      })
      .eq("id", intent.id);

    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(error instanceof Error ? error.message : "Cashfree subscription failed")}`);
  }
}
