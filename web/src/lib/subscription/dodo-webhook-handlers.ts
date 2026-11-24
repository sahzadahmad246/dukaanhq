import { validateRecordedSubscription, type ExpectedDodoPrice, type RecordedSubscriptionPrice } from "@/lib/dodo/price-validation";
import type { SupabaseClient } from "@supabase/supabase-js";

type DodoWebhookResult =
  | { ok: true; shopId?: string; intentId?: string; message: string }
  | { ok: false; shopId?: string; intentId?: string; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function addBillingPeriod(start: Date, interval: string | null | undefined) {
  const next = new Date(start);
  if (interval === "year") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function getMetadata(data: Record<string, unknown>) {
  return asRecord(data.metadata) ?? {};
}

function getDodoSubscriptionId(data: Record<string, unknown>) {
  return asString(data.subscription_id) ?? asString(data.id);
}

function getDodoCustomerId(data: Record<string, unknown>) {
  const customer = asRecord(data.customer);
  return asString(data.customer_id) ?? asString(customer?.customer_id) ?? asString(customer?.id);
}

function getDodoCustomerEmail(data: Record<string, unknown>) {
  const customer = asRecord(data.customer);
  return (
    asString(data.email) ??
    asString(data.customer_email) ??
    asString(customer?.email)
  )?.toLowerCase() ?? null;
}

function getDodoProductId(data: Record<string, unknown>) {
  const product = asRecord(data.product);
  return asString(data.product_id) ?? asString(product?.id);
}

function getPeriodStart(data: Record<string, unknown>, now: Date) {
  const value = asString(data.previous_billing_date) ?? asString(data.current_period_start) ?? asString(data.created_at);
  return value ? new Date(value) : now;
}

function getPeriodEnd(data: Record<string, unknown>, start: Date, interval: string) {
  const value = asString(data.next_billing_date) ?? asString(data.current_period_end);
  return value ? new Date(value) : addBillingPeriod(start, interval);
}

function getSubscriptionStatusForEvent(eventType: string, status: string) {
  if (eventType === "subscription.on_hold" || eventType === "subscription.failed" || status === "on_hold" || status === "failed") {
    return "past_due";
  }

  if (eventType === "subscription.cancelled" || status === "cancelled") {
    return "cancelled";
  }

  if (eventType === "subscription.expired" || status === "expired") {
    return "expired";
  }

  if (status === "active" || eventType === "subscription.active" || eventType === "subscription.renewed" || eventType === "subscription.plan_changed") {
    return "active";
  }

  return null;
}

async function resolveIntent(
  admin: SupabaseClient,
  data: Record<string, unknown>,
) {
  const metadata = getMetadata(data);
  const metadataIntentId = asString(metadata.dukaanhq_intent_id);

  if (metadataIntentId) {
    const { data: intent } = await admin
      .from("subscription_intents")
      .select("id, owner_user_id, plan_id, price_id, plan_code, billing_interval, created_shop_id")
      .eq("id", metadataIntentId)
      .maybeSingle<{
        id: string;
        owner_user_id: string;
        plan_id: string;
        price_id: string | null;
        plan_code: string;
        billing_interval: string;
        created_shop_id: string | null;
      }>();
    if (intent) return intent;
  }

  const subscriptionId = getDodoSubscriptionId(data);
  if (subscriptionId) {
    const { data: intent } = await admin
      .from("subscription_intents")
      .select("id, owner_user_id, plan_id, price_id, plan_code, billing_interval, created_shop_id")
      .eq("provider", "dodo")
      .eq("provider_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        owner_user_id: string;
        plan_id: string;
        price_id: string | null;
        plan_code: string;
        billing_interval: string;
        created_shop_id: string | null;
      }>();

    if (intent) return intent;
  }

  const customerEmail = getDodoCustomerEmail(data);
  if (!customerEmail) return null;

  const { data: intent } = await admin
    .from("subscription_intents")
    .select("id, owner_user_id, plan_id, price_id, plan_code, billing_interval, created_shop_id")
    .eq("provider", "dodo")
    .eq("owner_email", customerEmail)
    .in("status", ["payment_pending", "payment_approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      owner_user_id: string;
      plan_id: string;
      price_id: string | null;
      plan_code: string;
      billing_interval: string;
      created_shop_id: string | null;
    }>();

  return intent ?? null;
}

export async function applyDodoWebhookToEntitlement(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  providerEventId?: string | null,
): Promise<DodoWebhookResult> {
  const eventType = asString(body.type) ?? "unknown";
  const data = asRecord(body.data) ?? body;
  const subscriptionId = getDodoSubscriptionId(data);
  const productId = getDodoProductId(data);
  const customerId = getDodoCustomerId(data);
  const customerEmail = getDodoCustomerEmail(data);
  const status = asString(data.status) ?? eventType.replace("subscription.", "");
  const intent = await resolveIntent(admin, data);
  const shopId = asString(data.shop_id) ?? intent?.created_shop_id ?? null;

  if (providerEventId) {
    const { data: existingEvent } = await admin
      .from("subscription_events")
      .select("id")
      .eq("provider", "dodo")
      .eq("provider_event_id", providerEventId)
      .maybeSingle<{ id: string }>();

    if (existingEvent) {
      return { ok: true, shopId: shopId ?? undefined, intentId: intent?.id, message: "duplicate_ignored" };
    }
  }

  const eventInsert = await admin.from("subscription_events").insert({
    shop_id: shopId,
    subscription_intent_id: intent?.id ?? null,
    provider: "dodo",
    event_type: eventType,
    provider_event_id: providerEventId ?? null,
    payload: body,
    processed_status: "received",
  }).select("id").single<{ id: string }>();

  const eventId = eventInsert.data?.id ?? null;

  if (!intent) {
    if (eventId) {
      await admin.from("subscription_events").update({
        processed_status: "ignored",
        processed_message: `intent_not_found subscription=${subscriptionId ?? "-"} email=${customerEmail ?? "-"}`,
      }).eq("id", eventId);
    }
    console.warn("Dodo webhook could not resolve intent", {
      eventType,
      subscriptionId,
      customerId,
      customerEmail,
      dataKeys: Object.keys(data).slice(0, 30),
      metadataKeys: Object.keys(getMetadata(data)).slice(0, 30),
    });
    return { ok: false, shopId: shopId ?? undefined, message: "intent_not_found" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const periodStart = getPeriodStart(data, now);
  const isPaymentSucceededEvent = eventType === "payment.succeeded";
  const isPaymentFailedEvent = eventType === "payment.failed";
  const providerSubscriptionStatus = getSubscriptionStatusForEvent(eventType, status);
  const activeEvent = providerSubscriptionStatus === "active";
  const holdOrFailedEvent = providerSubscriptionStatus === "past_due" || isPaymentFailedEvent;
  const terminalEvent = providerSubscriptionStatus === "cancelled" || providerSubscriptionStatus === "expired";
  const cancelAtPeriodEnd = data.cancel_at_next_billing_date === true;
  const { data: productPrice } = productId
    ? await admin
        .from("saas_plan_prices")
        .select("id, plan_id, interval, interval_count, currency, regular_price_paise, discounted_price_paise, discount_enabled, discount_ends_at, provider_product_id")
        .eq("provider", "dodo")
        .eq("provider_product_id", productId)
        .maybeSingle<ExpectedDodoPrice & { id: string; plan_id: string }>()
    : { data: null };
  const pricingIssue = activeEvent && productPrice && typeof data.recurring_pre_tax_amount === "number"
    ? validateRecordedSubscription(productPrice, data as RecordedSubscriptionPrice)
    : null;
  const effectivePlanId = productPrice?.plan_id ?? intent.plan_id;
  const effectivePriceId = productPrice?.id ?? intent.price_id;
  const effectiveBillingInterval = productPrice?.interval ?? intent.billing_interval;
  const periodEnd = getPeriodEnd(data, periodStart, effectiveBillingInterval);

  const intentUpdate: Record<string, unknown> = {
    provider: "dodo",
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    provider_status: status,
    updated_at: nowIso,
  };

  if (activeEvent) {
    intentUpdate.status = "payment_approved";
    intentUpdate.current_period_start = periodStart.toISOString();
    intentUpdate.current_period_end = periodEnd.toISOString();
    intentUpdate.next_payment_at = periodEnd.toISOString();
    intentUpdate.expires_at = periodEnd.toISOString();
  } else if (terminalEvent || holdOrFailedEvent) {
    intentUpdate.status = "cancelled";
    intentUpdate.expires_at = nowIso;
  }

  if (isPaymentSucceededEvent) {
    intentUpdate.last_payment_at = nowIso;
    intentUpdate.last_payment_status = "SUCCESS";
  } else if (isPaymentFailedEvent) {
    intentUpdate.last_payment_status = "FAILED";
  }

  await admin.from("subscription_intents").update(intentUpdate).eq("id", intent.id);

  if (!shopId) {
    if (eventId) {
      await admin.from("subscription_events").update({
        processed_status: activeEvent ? "approved" : terminalEvent || holdOrFailedEvent ? "cancelled" : "pending",
        processed_message: "pre_onboarding_intent_updated",
      }).eq("id", eventId);
    }
    return { ok: true, intentId: intent.id, message: "pre_onboarding_intent_updated" };
  }

  if (activeEvent) {
    const subscriptionPayload = {
      shop_id: shopId,
    owner_user_id: intent.owner_user_id,
      plan_id: effectivePlanId,
      price_id: effectivePriceId,
      source_intent_id: intent.id,
      status: "active",
      billing_interval: effectiveBillingInterval,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      provider: "dodo",
      provider_subscription_id: subscriptionId,
      provider_customer_id: customerId,
      provider_status: status,
      next_payment_at: periodEnd.toISOString(),
      last_payment_at: isPaymentSucceededEvent ? nowIso : periodStart.toISOString(),
      last_payment_status: isPaymentFailedEvent ? "FAILED" : "SUCCESS",
      cancel_at_period_end: cancelAtPeriodEnd,
      last_webhook_event_at: nowIso,
      updated_at: nowIso,
    };

    const { data: existingSub } = await admin
      .from("shop_subscriptions")
      .select("id")
      .eq("shop_id", shopId)
      .maybeSingle<{ id: string }>();

    const subscriptionResult = existingSub?.id
      ? await admin.from("shop_subscriptions").update(subscriptionPayload).eq("id", existingSub.id).select("id").single<{ id: string }>()
      : await admin.from("shop_subscriptions").insert(subscriptionPayload).select("id").single<{ id: string }>();

    await admin.from("shop_entitlements").upsert(
      {
        shop_id: shopId,
        billing_status: "active",
        subscription_valid_until: periodEnd.toISOString(),
        plan_id: effectivePlanId,
        subscription_id: subscriptionResult.data?.id ?? null,
        access_expires_at: periodEnd.toISOString(),
        provider: "dodo",
        provider_subscription_id: subscriptionId,
        provider_customer_id: customerId,
        cancel_at_period_end: cancelAtPeriodEnd,
        locked_reason: null,
        updated_at: nowIso,
      },
      { onConflict: "shop_id" },
    );

    await admin.from("subscription_intents").update({ status: "completed", updated_at: nowIso }).eq("id", intent.id);

    if (eventId) {
      await admin.from("subscription_events").update({
        subscription_id: subscriptionResult.data?.id ?? null,
        processed_status: pricingIssue ? "pricing_mismatch" : "approved",
        processed_message: pricingIssue ? `Billing review required: ${pricingIssue}` : "shop_entitlement_active",
      }).eq("id", eventId);
    }

    return { ok: true, shopId, intentId: intent.id, message: "shop_entitlement_active" };
  }

  if ((terminalEvent || holdOrFailedEvent) && shopId) {
    const nextSubscriptionStatus = terminalEvent
      ? providerSubscriptionStatus
      : "past_due";
    const nextLockReason = terminalEvent ? eventType : isPaymentFailedEvent ? "payment.failed" : eventType;

    await admin.from("shop_entitlements").update({
      billing_status: "locked",
      cancel_at_period_end: false,
      locked_reason: nextLockReason,
      updated_at: nowIso,
    }).eq("shop_id", shopId);

    await admin.from("shop_subscriptions").update({
      status: nextSubscriptionStatus,
      provider_status: status,
      cancel_at_period_end: false,
      cancelled_at: terminalEvent ? nowIso : undefined,
      last_payment_status: isPaymentFailedEvent || holdOrFailedEvent ? "FAILED" : undefined,
      last_webhook_event_at: nowIso,
      updated_at: nowIso,
    }).eq("shop_id", shopId);
  }

  if (isPaymentSucceededEvent && shopId) {
    await admin.from("shop_subscriptions").update({
      last_payment_at: nowIso,
      last_payment_status: "SUCCESS",
      last_webhook_event_at: nowIso,
      updated_at: nowIso,
    }).eq("shop_id", shopId);
  }

  if (eventId) {
    await admin.from("subscription_events").update({
      processed_status: terminalEvent || holdOrFailedEvent ? "locked" : isPaymentSucceededEvent ? "paid" : "ignored",
      processed_message: status,
    }).eq("id", eventId);
  }

  return {
    ok: true,
    shopId,
    intentId: intent.id,
    message: terminalEvent || holdOrFailedEvent ? "subscription_locked" : isPaymentSucceededEvent ? "payment_recorded" : "event_recorded",
  };
}
