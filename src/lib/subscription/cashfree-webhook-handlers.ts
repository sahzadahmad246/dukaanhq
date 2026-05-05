import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function addBillingPeriod(start: Date, interval: "month" | "year") {
  const next = new Date(start);
  if (interval === "year") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function getSubscriptionDetails(data: Record<string, unknown>) {
  const statusWebhook = asRecord(data.subscription_status_webhook);
  return statusWebhook ? asRecord(statusWebhook.subscription_details) : null;
}

function getSubscriptionTags(data: Record<string, unknown>) {
  const details = getSubscriptionDetails(data);
  const nestedTags = details ? asRecord(details.subscription_tags) : null;
  const topTags = asRecord(data.subscription_tags);
  return nestedTags ?? topTags;
}

function getCashfreeStatus(data: Record<string, unknown>) {
  const details = getSubscriptionDetails(data);
  return (
    asString(data.subscription_status) ??
    (details ? asString(details.subscription_status) : null) ??
    asString(data.payment_status)
  );
}

function getAuthorizationStatus(data: Record<string, unknown>) {
  const details = getSubscriptionDetails(data);
  const topAuth = asRecord(data.authorization_details) ?? asRecord(data.authorisation_details);
  const nestedAuth = details
    ? asRecord(details.authorization_details) ?? asRecord(details.authorisation_details)
    : null;
  return (
    asString(topAuth?.authorization_status ?? topAuth?.authorisation_status) ??
    asString(nestedAuth?.authorization_status ?? nestedAuth?.authorisation_status) ??
    getCashfreeStatus(data)
  );
}

/**
 * Find DukaanHQ shop_id from Cashfree webhook JSON after signature verification.
 * Supported sources (in order):
 * 1. subscription_tags.dukaanhq_shop_id / shop_id on subscription webhooks
 * 2. shop_entitlements.cashfree_subscription_id matching data.subscription_id
 * 3. subscription_id / customer_id formatted as dhq_<uuid> (set when you create the subscription)
 * 4. PAYMENT_SUCCESS_WEBHOOK data.order.order_tags.dukaanhq_shop_id
 */
export async function resolveShopIdFromCashfreePayload(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<string | null> {
  const data = asRecord(body.data);
  if (!data) {
    return null;
  }

  const statusWebhook = asRecord(data.subscription_status_webhook);
  const subDetails = statusWebhook ? asRecord(statusWebhook.subscription_details) : null;
  const subscriptionTags = getSubscriptionTags(data);
  if (subscriptionTags) {
    const tagId = subscriptionTags.dukaanhq_shop_id ?? subscriptionTags.shop_id;
    if (typeof tagId === "string" && isUuid(tagId)) {
      return tagId;
    }
  }

  const subscriptionId =
    (typeof data.subscription_id === "string" ? data.subscription_id : null) ??
    (subDetails && typeof subDetails.subscription_id === "string" ? subDetails.subscription_id : null);

  if (typeof subscriptionId === "string") {
    const prefix = subscriptionId.match(/^dhq_([0-9a-f-]{36})$/i);
    if (prefix && isUuid(prefix[1])) {
      return prefix[1];
    }

    const { data: entRow } = await admin
      .from("shop_entitlements")
      .select("shop_id")
      .eq("cashfree_subscription_id", subscriptionId)
      .maybeSingle();

    if (entRow?.shop_id) {
      return entRow.shop_id;
    }
  }

  const order = asRecord(data.order);
  const orderTags = order ? asRecord(order.order_tags) : null;
  if (orderTags) {
    const oid = orderTags.dukaanhq_shop_id ?? orderTags.shop_id;
    if (typeof oid === "string" && isUuid(oid)) {
      return oid;
    }
  }

  return null;
}

export async function resolveIntentIdFromCashfreePayload(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<string | null> {
  const data = asRecord(body.data);
  if (!data) {
    return null;
  }

  const subscriptionTags = getSubscriptionTags(data);
  if (subscriptionTags) {
    const tagId = subscriptionTags.dukaanhq_intent_id ?? subscriptionTags.intent_id;
    if (typeof tagId === "string" && isUuid(tagId)) {
      return tagId;
    }
  }

  const { subscriptionId, cfSubscriptionId } = extractSubscriptionIds(data);
  if (subscriptionId) {
    const { data: intent } = await admin
      .from("subscription_intents")
      .select("id")
      .eq("cashfree_subscription_id", subscriptionId)
      .maybeSingle<{ id: string }>();

    if (intent?.id) {
      return intent.id;
    }
  }

  if (cfSubscriptionId) {
    const { data: intent } = await admin
      .from("subscription_intents")
      .select("id")
      .eq("cashfree_cf_subscription_id", cfSubscriptionId)
      .maybeSingle<{ id: string }>();

    if (intent?.id) {
      return intent.id;
    }
  }

  return null;
}

export function extractSubscriptionIds(data: Record<string, unknown>): {
  subscriptionId: string | null;
  cfSubscriptionId: string | null;
} {
  const subDetails = getSubscriptionDetails(data);

  const subscriptionId =
    (typeof data.subscription_id === "string" ? data.subscription_id : null) ??
    (subDetails && typeof subDetails.subscription_id === "string" ? subDetails.subscription_id : null);

  const cfSubscriptionId =
    (typeof data.cf_subscription_id === "string" ? data.cf_subscription_id : null) ??
    (subDetails && typeof subDetails.cf_subscription_id === "string" ? subDetails.cf_subscription_id : null);

  return { subscriptionId, cfSubscriptionId };
}

export function extractCashfreeCustomerId(data: Record<string, unknown>): string | null {
  const top = asRecord(data.customer_details);
  const statusWebhook = asRecord(data.subscription_status_webhook);
  const nested = statusWebhook ? asRecord(statusWebhook.customer_details) : null;
  return (
    (top && typeof top.customer_id === "string" ? top.customer_id : null) ??
    (nested && typeof nested.customer_id === "string" ? nested.customer_id : null)
  );
}

export function extractSubscriptionValidUntil(data: Record<string, unknown>): string | null {
  const subDetails = getSubscriptionDetails(data);
  const exp =
    subDetails && typeof subDetails.subscription_expiry_time === "string"
      ? subDetails.subscription_expiry_time
      : null;
  if (exp) {
    return exp;
  }
  return null;
}

export type WebhookHandleResult =
  | { ok: true; shopId?: string; intentId?: string; message: string }
  | { ok: false; message: string };

const ACTIVATE_TYPES = new Set(["SUBSCRIPTION_PAYMENT_SUCCESS", "PAYMENT_SUCCESS_WEBHOOK"]);

const DEACTIVATE_TYPES = new Set([
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_CANCELLED",
]);

/**
 * Apply entitlement updates from a verified Cashfree webhook body.
 */
export async function applyCashfreeWebhookToEntitlement(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<WebhookHandleResult> {
  const type = typeof body.type === "string" ? body.type : "";
  const data = asRecord(body.data);
  if (!data) {
    return { ok: false, message: "missing_data" };
  }

  const intentId = await resolveIntentIdFromCashfreePayload(admin, body);
  const { subscriptionId, cfSubscriptionId } = extractSubscriptionIds(data);
  const validUntil = extractSubscriptionValidUntil(data);
  const customerId = extractCashfreeCustomerId(data);
  const authorizationStatus = getAuthorizationStatus(data);

  const intentLookup = intentId
    ? await admin
        .from("subscription_intents")
        .select("id, plan_code, billing_interval, created_shop_id")
        .eq("id", intentId)
        .maybeSingle<{
          id: string;
          plan_code: "starter" | "growth" | "pro";
          billing_interval: "month" | "year";
          created_shop_id: string | null;
        }>()
    : { data: null };

  const resolvedShopId = await resolveShopIdFromCashfreePayload(admin, body);
  const shopId = resolvedShopId ?? intentLookup.data?.created_shop_id ?? null;

  await admin.from("subscription_events").insert({
    shop_id: shopId,
    subscription_intent_id: intentLookup.data?.id ?? null,
    provider: "cashfree",
    event_type: type || "UNKNOWN",
    payload: body,
    processed_status: "received",
  });

  if (ACTIVATE_TYPES.has(type)) {
    if (type === "PAYMENT_SUCCESS_WEBHOOK") {
      const payment = asRecord(data.payment);
      const payStatus = payment && typeof payment.payment_status === "string" ? payment.payment_status : "";
      if (payStatus !== "SUCCESS") {
        return { ok: false, message: "payment_not_success" };
      }
    }

    if (type === "SUBSCRIPTION_PAYMENT_SUCCESS") {
      const payStatus = typeof data.payment_status === "string" ? data.payment_status : "";
      if (payStatus !== "SUCCESS") {
        return { ok: false, message: "subscription_payment_not_success" };
      }
    }

    const now = new Date();
    const periodStart = now;
    const periodEnd = validUntil
      ? new Date(validUntil)
      : addBillingPeriod(now, intentLookup.data?.billing_interval ?? "month");

    if (intentLookup.data) {
      const { error } = await admin
        .from("subscription_intents")
        .update({
          status: "payment_approved",
          cashfree_subscription_id: subscriptionId ?? undefined,
          cashfree_cf_subscription_id: cfSubscriptionId ?? undefined,
          cashfree_customer_id: customerId ?? undefined,
          cashfree_authorization_status: authorizationStatus,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          next_payment_at: periodEnd.toISOString(),
          last_payment_at: now.toISOString(),
          last_payment_status: "SUCCESS",
          expires_at: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", intentLookup.data.id);

      if (error) {
        return { ok: false, message: error.message };
      }
    }

    if (shopId) {
      const { error } = await admin.from("shop_entitlements").upsert(
        {
          shop_id: shopId,
          billing_status: "active",
          subscription_valid_until: periodEnd.toISOString(),
          access_expires_at: periodEnd.toISOString(),
          cashfree_subscription_id: subscriptionId ?? undefined,
          cashfree_customer_id: customerId ?? undefined,
          cancel_at_period_end: false,
          locked_reason: null,
          updated_at: now.toISOString(),
        },
        { onConflict: "shop_id" },
      );

      if (error) {
        return { ok: false, message: error.message };
      }

      await admin
        .from("shop_subscriptions")
        .update({
          status: "active",
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cashfree_subscription_id: subscriptionId ?? undefined,
          cashfree_cf_subscription_id: cfSubscriptionId ?? undefined,
          cashfree_customer_id: customerId ?? undefined,
          cashfree_authorization_status: authorizationStatus,
          next_payment_at: periodEnd.toISOString(),
          last_payment_at: now.toISOString(),
          last_payment_status: "SUCCESS",
          last_webhook_event_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("shop_id", shopId);
    }

    return { ok: true, shopId: shopId ?? undefined, intentId: intentLookup.data?.id, message: "activated" };
  }

  if (DEACTIVATE_TYPES.has(type)) {
    if (!shopId && intentLookup.data) {
      const { error } = await admin
        .from("subscription_intents")
        .update({
          status: type === "SUBSCRIPTION_PAYMENT_CANCELLED" ? "cancelled" : "payment_pending",
          last_payment_status: type === "SUBSCRIPTION_PAYMENT_CANCELLED" ? "CANCELLED" : "FAILED",
          cashfree_authorization_status: authorizationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intentLookup.data.id);

      if (error) {
        return { ok: false, message: error.message };
      }

      return { ok: true, intentId: intentLookup.data.id, message: "intent_payment_inactive" };
    }

    if (!shopId) {
      return { ok: false, message: "shop_not_resolved" };
    }

    const { error } = await admin
      .from("shop_entitlements")
      .update({
        billing_status: "locked",
        cancel_at_period_end: type === "SUBSCRIPTION_PAYMENT_CANCELLED",
        locked_reason: type,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);

    if (error) {
      return { ok: false, message: error.message };
    }

    await admin
      .from("shop_subscriptions")
      .update({
        status: type === "SUBSCRIPTION_PAYMENT_CANCELLED" ? "cancelled" : "past_due",
        cancel_at_period_end: type === "SUBSCRIPTION_PAYMENT_CANCELLED",
        last_payment_status: type === "SUBSCRIPTION_PAYMENT_CANCELLED" ? "CANCELLED" : "FAILED",
        last_webhook_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);

    return { ok: true, shopId, message: "locked_or_cancelled" };
  }

  if (type === "SUBSCRIPTION_STATUS_CHANGED") {
    const sw = asRecord(data.subscription_status_webhook);
    const details = sw ? asRecord(sw.subscription_details) : null;
    const status = details && typeof details.subscription_status === "string" ? details.subscription_status : "";
    if (status === "ACTIVE") {
      const now = new Date();
      const periodStart = now;
      const periodEnd = validUntil
        ? new Date(validUntil)
        : addBillingPeriod(now, intentLookup.data?.billing_interval ?? "month");

      if (intentLookup.data) {
        const { error } = await admin
          .from("subscription_intents")
          .update({
            status: "payment_approved",
            cashfree_subscription_id:
              details && typeof details.subscription_id === "string" ? details.subscription_id : subscriptionId,
            cashfree_cf_subscription_id:
              details && typeof details.cf_subscription_id === "string" ? details.cf_subscription_id : cfSubscriptionId,
            cashfree_customer_id: customerId ?? undefined,
            cashfree_authorization_status: status,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            next_payment_at: periodEnd.toISOString(),
            expires_at: periodEnd.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", intentLookup.data.id);

        if (error) {
          return { ok: false, message: error.message };
        }
      }

      if (shopId) {
        const { error } = await admin.from("shop_entitlements").upsert(
          {
            shop_id: shopId,
            billing_status: "active",
            subscription_valid_until: periodEnd.toISOString(),
            access_expires_at: periodEnd.toISOString(),
            cashfree_subscription_id:
              details && typeof details.subscription_id === "string" ? details.subscription_id : subscriptionId,
            cashfree_customer_id: customerId ?? undefined,
            cancel_at_period_end: false,
            locked_reason: null,
            updated_at: now.toISOString(),
          },
          { onConflict: "shop_id" },
        );
        if (error) {
          return { ok: false, message: error.message };
        }

        await admin
          .from("shop_subscriptions")
          .update({
            status: "active",
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            cashfree_subscription_id:
              details && typeof details.subscription_id === "string" ? details.subscription_id : subscriptionId,
            cashfree_cf_subscription_id:
              details && typeof details.cf_subscription_id === "string" ? details.cf_subscription_id : cfSubscriptionId,
            cashfree_customer_id: customerId ?? undefined,
            cashfree_authorization_status: status,
            next_payment_at: periodEnd.toISOString(),
            last_webhook_event_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("shop_id", shopId);
      }

      return { ok: true, shopId: shopId ?? undefined, intentId: intentLookup.data?.id, message: "status_active" };
    }
    if (status === "CANCELLED" || status === "EXPIRED") {
      if (!shopId && intentLookup.data) {
        const { error } = await admin
          .from("subscription_intents")
          .update({
            status: status === "CANCELLED" ? "cancelled" : "expired",
            cashfree_authorization_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", intentLookup.data.id);
        if (error) {
          return { ok: false, message: error.message };
        }
        return { ok: true, intentId: intentLookup.data.id, message: "intent_status_inactive" };
      }

      if (!shopId) {
        return { ok: false, message: "shop_not_resolved" };
      }

      const { error } = await admin
        .from("shop_entitlements")
        .update({
          billing_status: "locked",
          cancel_at_period_end: status === "CANCELLED",
          locked_reason: status,
          updated_at: new Date().toISOString(),
        })
        .eq("shop_id", shopId);
      if (error) {
        return { ok: false, message: error.message };
      }

      await admin
        .from("shop_subscriptions")
        .update({
          status: status === "CANCELLED" ? "cancelled" : "expired",
          cancel_at_period_end: status === "CANCELLED",
          last_webhook_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("shop_id", shopId);

      return { ok: true, shopId, message: "status_inactive" };
    }
    return { ok: true, shopId: shopId ?? undefined, intentId: intentLookup.data?.id, message: "status_ignored" };
  }

  return { ok: false, message: `unhandled_type:${type}` };
}
