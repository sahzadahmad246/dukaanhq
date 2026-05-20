"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelDodoSubscriptionAtPeriodEnd,
  changeDodoSubscriptionPlan,
  createDodoCustomerPortalSession,
  retrieveDodoSubscription,
  resumeDodoSubscriptionRenewal,
} from "@/lib/dodo/client";
import { getUserAppState } from "@/lib/auth/user-flow";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BillingInterval = "month" | "year";
type PlanCode = "starter" | "growth" | "pro";

function appOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function isPlanCode(value: string): value is PlanCode {
  return value === "starter" || value === "growth" || value === "pro";
}

function isBillingInterval(value: string): value is BillingInterval {
  return value === "month" || value === "year";
}

export async function cancelCurrentShopSubscriptionAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const returnPath = state.shopSlug ? buildShopRoute(state.shopSlug, "subscription") : "/subscription";

  if (!state.user || !state.membership || state.membership.role !== "owner") {
    redirect(`${returnPath}?error=owner-required`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect(`${returnPath}?error=server-config`);
  }

  const shopId = state.membership.shop_id;
  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("id, provider, provider_subscription_id, current_period_end")
    .eq("shop_id", shopId)
    .maybeSingle<{
      id: string;
      provider: string | null;
      provider_subscription_id: string | null;
      current_period_end: string | null;
    }>();

  if (!subscription?.provider_subscription_id || subscription.provider !== "dodo") {
    redirect(`${returnPath}?error=no-active-payment`);
  }

  const now = new Date().toISOString();
  try {
    const response = await cancelDodoSubscriptionAtPeriodEnd(subscription.provider_subscription_id);
    const verifiedSubscription =
      response.cancel_at_next_billing_date === true
        ? response
        : await retrieveDodoSubscription(subscription.provider_subscription_id);

    if (verifiedSubscription.cancel_at_next_billing_date !== true) {
      throw new Error("Payment provider did not confirm cancellation scheduling.");
    }

    const { error: subscriptionUpdateError } = await admin
      .from("shop_subscriptions")
      .update({
        status: "cancel_at_period_end",
        cancel_at_period_end: true,
        cancelled_at: now,
        last_webhook_event_at: now,
        updated_at: now,
      })
      .eq("id", subscription.id);

    if (subscriptionUpdateError) {
      throw new Error(`Could not save subscription cancellation: ${subscriptionUpdateError.message}`);
    }

    const { error: entitlementUpdateError } = await admin
      .from("shop_entitlements")
      .update({
        cancel_at_period_end: true,
        access_expires_at: subscription.current_period_end,
        locked_reason: null,
        updated_at: now,
      })
      .eq("shop_id", shopId);

    if (entitlementUpdateError) {
      throw new Error(`Could not save entitlement cancellation: ${entitlementUpdateError.message}`);
    }

    const { error: eventError } = await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_CANCELLED_SUBSCRIPTION",
      payload: verifiedSubscription,
      processed_status: "cancelled",
    });

    if (eventError) {
      console.error("Failed to record cancellation event", eventError);
    }
  } catch (error) {
    console.error("Subscription cancellation failed", error);
    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_CANCEL_SUBSCRIPTION_FAILED",
      payload: { provider_subscription_id: subscription.provider_subscription_id },
      processed_status: "error",
      processed_message: error instanceof Error ? error.message : "Cancellation failed",
    });
    redirect(`${returnPath}?error=cancel-failed`);
  }

  revalidatePath("/subscription");
  revalidatePath(returnPath);
  redirect(`${returnPath}?updated=1`);
}

export async function openDodoCustomerPortalAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const returnPath = state.shopSlug ? buildShopRoute(state.shopSlug, "subscription") : "/subscription";

  if (!state.user || !state.membership || state.membership.role !== "owner") {
    redirect(`${returnPath}?error=owner-required`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect(`${returnPath}?error=server-config`);
  }

  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("provider, provider_customer_id")
    .eq("shop_id", state.membership.shop_id)
    .maybeSingle<{
      provider: string | null;
      provider_customer_id: string | null;
    }>();

  const providerCustomerId = subscription?.provider === "dodo"
    ? subscription.provider_customer_id
    : state.shopEntitlement?.provider === "dodo"
      ? state.shopEntitlement.provider_customer_id
      : null;

  if (!providerCustomerId) {
    redirect(`${returnPath}?error=no-billing-customer`);
  }

  let portalUrl: string | null = null;

  try {
    const session = await createDodoCustomerPortalSession({
      customerId: providerCustomerId,
      returnUrl: `${appOrigin()}${returnPath}`,
      sendEmail: false,
    });

    if (!session.link) {
      throw new Error("Dodo did not return a customer portal link.");
    }

    portalUrl = session.link;
  } catch (error) {
    console.error("Dodo customer portal session failed", error);
    await admin.from("subscription_events").insert({
      shop_id: state.membership.shop_id,
      provider: "dodo",
      event_type: "OWNER_CUSTOMER_PORTAL_FAILED",
      payload: { provider_customer_id: providerCustomerId },
      processed_status: "error",
      processed_message: error instanceof Error ? error.message : "Customer portal failed",
    });
    redirect(`${returnPath}?error=portal-failed`);
  }

  if (!portalUrl) {
    redirect(`${returnPath}?error=portal-failed`);
  }

  redirect(portalUrl);
}

export async function resumeCurrentShopSubscriptionRenewalAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user || !state.membership || state.membership.role !== "owner") {
    return;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const shopId = state.membership.shop_id;
  const returnPath = state.shopSlug ? buildShopRoute(state.shopSlug, "subscription") : "/subscription";
  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("id, provider, provider_subscription_id")
    .eq("shop_id", shopId)
    .maybeSingle<{
      id: string;
      provider: string | null;
      provider_subscription_id: string | null;
    }>();

  if (!subscription?.provider_subscription_id || subscription.provider !== "dodo") {
    redirect(`${returnPath}?error=no-active-payment`);
  }

  const now = new Date().toISOString();
  try {
    const response = await resumeDodoSubscriptionRenewal(subscription.provider_subscription_id);

    await admin
      .from("shop_subscriptions")
      .update({
        status: "active",
        cancel_at_period_end: false,
        cancelled_at: null,
        last_webhook_event_at: now,
        updated_at: now,
      })
      .eq("id", subscription.id);

    await admin
      .from("shop_entitlements")
      .update({
        cancel_at_period_end: false,
        locked_reason: null,
        updated_at: now,
      })
      .eq("shop_id", shopId);

    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_RESUMED_SUBSCRIPTION_RENEWAL",
      payload: response,
      processed_status: "resumed",
    });
  } catch (error) {
    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_RESUME_SUBSCRIPTION_FAILED",
      payload: { provider_subscription_id: subscription.provider_subscription_id },
      processed_status: "error",
      processed_message: error instanceof Error ? error.message : "Resume renewal failed",
    });
    redirect(`${returnPath}?error=resume-failed`);
  }

  revalidatePath("/subscription");
  revalidatePath(returnPath);
  redirect(`${returnPath}?updated=1&resumed=1`);
}

export async function changeCurrentShopSubscriptionPlanAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user || !state.membership || state.membership.role !== "owner") {
    return;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const planCodeValue = String(formData.get("plan_code") ?? "");
  const billingIntervalValue = String(formData.get("billing_interval") ?? "");
  const returnPath = state.shopSlug ? buildShopRoute(state.shopSlug, "subscription") : "/subscription";

  if (!isPlanCode(planCodeValue) || !isBillingInterval(billingIntervalValue)) {
    redirect(`${returnPath}?error=invalid-plan`);
  }

  const shopId = state.membership.shop_id;
  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("id, provider, provider_subscription_id, plan_id, price_id, billing_interval, current_period_end")
    .eq("shop_id", shopId)
    .maybeSingle<{
      id: string;
      provider: string | null;
      provider_subscription_id: string | null;
      plan_id: string | null;
      price_id: string | null;
      billing_interval: BillingInterval;
      current_period_end: string | null;
    }>();

  if (!subscription?.provider_subscription_id || subscription.provider !== "dodo") {
    redirect(`${returnPath}?error=no-active-payment`);
  }

  const { data: targetPlan } = await admin
    .from("saas_plans")
    .select("id, code, display_name, saas_plan_prices(id, interval, provider_product_id, is_active)")
    .eq("code", planCodeValue)
    .eq("is_active", true)
    .maybeSingle<{
      id: string;
      code: PlanCode;
      display_name: string;
      saas_plan_prices: Array<{
        id: string;
        interval: BillingInterval;
        provider_product_id: string | null;
        is_active: boolean;
      }> | null;
    }>();

  const targetPrice = targetPlan?.saas_plan_prices?.find(
    (price) => price.interval === billingIntervalValue && price.is_active,
  ) ?? null;

  if (!targetPlan || !targetPrice?.provider_product_id) {
    redirect(`${returnPath}?error=plan-not-configured`);
  }

  if (targetPlan.id === subscription.plan_id && targetPrice.id === subscription.price_id) {
    redirect(`${returnPath}?updated=1`);
  }

  const now = new Date().toISOString();

  try {
    const response = await changeDodoSubscriptionPlan(subscription.provider_subscription_id, {
      product_id: targetPrice.provider_product_id,
      quantity: 1,
      proration_billing_mode: "do_not_bill",
      effective_at: "next_billing_date",
    });

    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_SCHEDULED_PLAN_CHANGE",
      payload: {
        response,
        current_plan_id: subscription.plan_id,
        current_price_id: subscription.price_id,
        target_plan_id: targetPlan.id,
        target_price_id: targetPrice.id,
        target_plan_code: targetPlan.code,
        target_plan_name: targetPlan.display_name,
        target_billing_interval: billingIntervalValue,
        effective_at: "next_billing_date",
        current_period_end: subscription.current_period_end,
      },
      processed_status: "scheduled",
      processed_message: "Plan change scheduled for next billing date.",
    });

    await admin
      .from("shop_subscriptions")
      .update({ last_webhook_event_at: now, updated_at: now })
      .eq("id", subscription.id);
  } catch (error) {
    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "dodo",
      event_type: "OWNER_PLAN_CHANGE_FAILED",
      payload: {
        target_plan_code: planCodeValue,
        target_billing_interval: billingIntervalValue,
      },
      processed_status: "error",
      processed_message: error instanceof Error ? error.message : "Plan change failed",
    });
    redirect(`${returnPath}?error=plan-change-failed`);
  }

  revalidatePath("/subscription");
  revalidatePath(returnPath);
  redirect(`${returnPath}?updated=1&scheduled=1`);
}
