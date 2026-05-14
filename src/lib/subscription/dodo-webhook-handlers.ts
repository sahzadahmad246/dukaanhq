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
  const activeEvent = eventType === "subscription.active" || eventType === "subscription.renewed" || status === "active";
  const holdOrFailedEvent = eventType === "subscription.on_hold" || eventType === "subscription.failed" || eventType === "payment.failed" || status === "on_hold" || status === "failed";
  const { data: productPrice } = productId
    ? await admin
        .from("saas_plan_prices")
        .select("id, plan_id, interval")
        .eq("provider", "dodo")
        .eq("provider_product_id", productId)
        .maybeSingle<{ id: string; plan_id: string; interval: string }>()
    : { data: null };
  const effectivePlanId = productPrice?.plan_id ?? intent.plan_id;
  const effectivePriceId = productPrice?.id ?? intent.price_id;
  const effectiveBillingInterval = productPrice?.interval ?? intent.billing_interval;
  const periodEnd = getPeriodEnd(data, periodStart, effectiveBillingInterval);

  await admin.from("subscription_intents").update({
    status: activeEvent ? "payment_approved" : holdOrFailedEvent ? "cancelled" : "payment_pending",
    provider: "dodo",
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    provider_status: status,
    current_period_start: activeEvent ? periodStart.toISOString() : undefined,
    current_period_end: activeEvent ? periodEnd.toISOString() : undefined,
    next_payment_at: activeEvent ? periodEnd.toISOString() : undefined,
    last_payment_at: eventType === "payment.succeeded" ? nowIso : undefined,
    last_payment_status: eventType === "payment.succeeded" ? "SUCCESS" : eventType === "payment.failed" ? "FAILED" : undefined,
    expires_at: activeEvent ? periodEnd.toISOString() : nowIso,
    updated_at: nowIso,
  }).eq("id", intent.id);

  if (!shopId) {
    if (eventId) {
      await admin.from("subscription_events").update({
        processed_status: activeEvent ? "approved" : "pending",
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
      last_payment_at: eventType === "payment.succeeded" ? nowIso : periodStart.toISOString(),
      last_payment_status: eventType === "payment.failed" ? "FAILED" : "SUCCESS",
      cancel_at_period_end: data.cancel_at_next_billing_date === true,
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
        cancel_at_period_end: data.cancel_at_next_billing_date === true,
        locked_reason: null,
        updated_at: nowIso,
      },
      { onConflict: "shop_id" },
    );

    await admin.from("subscription_intents").update({ status: "completed", updated_at: nowIso }).eq("id", intent.id);

    if (eventId) {
      await admin.from("subscription_events").update({
        subscription_id: subscriptionResult.data?.id ?? null,
        processed_status: "approved",
        processed_message: "shop_entitlement_active",
      }).eq("id", eventId);
    }

    return { ok: true, shopId, intentId: intent.id, message: "shop_entitlement_active" };
  }

  if (holdOrFailedEvent && shopId) {
    await admin.from("shop_entitlements").update({
      billing_status: "locked",
      locked_reason: eventType,
      updated_at: nowIso,
    }).eq("shop_id", shopId);

    await admin.from("shop_subscriptions").update({
      status: "past_due",
      last_payment_status: "FAILED",
      last_webhook_event_at: nowIso,
      updated_at: nowIso,
    }).eq("shop_id", shopId);
  }

  if (eventId) {
    await admin.from("subscription_events").update({
      processed_status: holdOrFailedEvent ? "locked" : "ignored",
      processed_message: status,
    }).eq("id", eventId);
  }

  return { ok: true, shopId, intentId: intent.id, message: holdOrFailedEvent ? "subscription_locked" : "event_recorded" };
}
