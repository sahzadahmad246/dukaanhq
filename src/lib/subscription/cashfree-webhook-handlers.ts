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
  const subscriptionTags = subDetails ? asRecord(subDetails.subscription_tags) : null;
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

export function extractSubscriptionIds(data: Record<string, unknown>): {
  subscriptionId: string | null;
  cfSubscriptionId: string | null;
} {
  const statusWebhook = asRecord(data.subscription_status_webhook);
  const subDetails = statusWebhook ? asRecord(statusWebhook.subscription_details) : null;

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
  const statusWebhook = asRecord(data.subscription_status_webhook);
  const subDetails = statusWebhook ? asRecord(statusWebhook.subscription_details) : null;
  const exp =
    subDetails && typeof subDetails.subscription_expiry_time === "string"
      ? subDetails.subscription_expiry_time
      : null;
  if (exp) {
    return exp;
  }
  return null;
}

export type WebhookHandleResult = { ok: true; shopId: string; message: string } | { ok: false; message: string };

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

  const shopId = await resolveShopIdFromCashfreePayload(admin, body);
  if (!shopId) {
    return { ok: false, message: "shop_not_resolved" };
  }

  const { subscriptionId } = extractSubscriptionIds(data);
  const validUntil = extractSubscriptionValidUntil(data);
  const customerId = extractCashfreeCustomerId(data);

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

    const { error } = await admin.from("shop_entitlements").upsert(
      {
        shop_id: shopId,
        billing_status: "active",
        subscription_valid_until: validUntil,
        cashfree_subscription_id: subscriptionId ?? undefined,
        cashfree_customer_id: customerId ?? undefined,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" },
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, shopId, message: "activated" };
  }

  if (DEACTIVATE_TYPES.has(type)) {
    const { error } = await admin
      .from("shop_entitlements")
      .update({
        billing_status: "locked",
        cancel_at_period_end: type === "SUBSCRIPTION_PAYMENT_CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, shopId, message: "locked_or_cancelled" };
  }

  if (type === "SUBSCRIPTION_STATUS_CHANGED") {
    const sw = asRecord(data.subscription_status_webhook);
    const details = sw ? asRecord(sw.subscription_details) : null;
    const status = details && typeof details.subscription_status === "string" ? details.subscription_status : "";
    if (status === "ACTIVE") {
      const { error } = await admin.from("shop_entitlements").upsert(
        {
          shop_id: shopId,
          billing_status: "active",
          subscription_valid_until:
            details && typeof details.subscription_expiry_time === "string"
              ? details.subscription_expiry_time
              : validUntil,
          cashfree_subscription_id:
            details && typeof details.subscription_id === "string" ? details.subscription_id : subscriptionId,
          cashfree_customer_id: customerId ?? undefined,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id" },
      );
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, shopId, message: "status_active" };
    }
    if (status === "CANCELLED" || status === "EXPIRED") {
      const { error } = await admin
        .from("shop_entitlements")
        .update({
          billing_status: "locked",
          cancel_at_period_end: status === "CANCELLED",
          updated_at: new Date().toISOString(),
        })
        .eq("shop_id", shopId);
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, shopId, message: "status_inactive" };
    }
    return { ok: true, shopId, message: "status_ignored" };
  }

  return { ok: false, message: `unhandled_type:${type}` };
}
