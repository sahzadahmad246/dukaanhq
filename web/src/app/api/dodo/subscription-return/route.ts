import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { retrieveDodoCheckoutSession, retrieveDodoSubscription } from "@/lib/dodo/client";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyDodoWebhookToEntitlement } from "@/lib/subscription/dodo-webhook-handlers";

export const runtime = "nodejs";

function appRedirect(request: Request, path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin = appUrl || new URL(request.url).origin;
  return NextResponse.redirect(new URL(path, origin));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeStatus(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function reconcileReturnedSubscription(input: {
  admin: SupabaseClient;
  intent: {
    id: string;
    owner_email: string | null;
    provider_checkout_session_id: string | null;
    provider_subscription_id: string | null;
  };
  returnedSubscriptionId: string | null;
  returnedStatus: string;
}) {
  const subscriptionId = input.returnedSubscriptionId ?? input.intent.provider_subscription_id;

  if (subscriptionId) {
    const subscription = await retrieveDodoSubscription(subscriptionId);
    const providerStatus = normalizeStatus(
      typeof subscription.status === "string" ? subscription.status : input.returnedStatus,
    );
    const eventType =
      providerStatus === "active" || providerStatus === "succeeded" || providerStatus === "trialing"
        ? "subscription.active"
        : providerStatus === "on_hold"
          ? "subscription.on_hold"
          : providerStatus === "failed"
            ? "subscription.failed"
            : providerStatus === "cancelled"
              ? "subscription.cancelled"
              : "subscription.updated";

    const subscriptionMetadata = asRecord(subscription.metadata);
    await applyDodoWebhookToEntitlement(
      input.admin,
      {
        type: eventType,
        data: {
          ...subscription,
          subscription_id: subscription.subscription_id ?? subscriptionId,
          metadata: {
            ...subscriptionMetadata,
            dukaanhq_intent_id: input.intent.id,
          },
          customer: {
            ...asRecord(subscription.customer),
            email:
              (asRecord(subscription.customer).email as string | undefined) ??
              input.intent.owner_email ??
              undefined,
          },
        },
      },
      `return.${input.intent.id}.${subscriptionId}.${eventType}`,
    );
    return;
  }

  if (!input.intent.provider_checkout_session_id) {
    return;
  }

  const checkout = await retrieveDodoCheckoutSession(input.intent.provider_checkout_session_id);
  if (checkout.payment_status !== "failed" && checkout.payment_status !== "cancelled") {
    return;
  }

  await input.admin
    .from("subscription_intents")
    .update({
      status: "cancelled",
      provider_status: checkout.payment_status,
      provider_payment_id: checkout.payment_id ?? undefined,
      last_payment_status: checkout.payment_status.toUpperCase(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.intent.id);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intentId = url.searchParams.get("intent");
  const returnedSubscriptionId = url.searchParams.get("subscription_id");
  const returnedStatus = normalizeStatus(url.searchParams.get("status"));

  if (!intentId) {
    return appRedirect(request, "/subscribe/start?error=missing_intent");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return appRedirect(request, "/subscribe/start?error=server_not_configured");
  }

  const { data: intent, error } = await admin
    .from("subscription_intents")
    .select("id, owner_email, plan_code, billing_interval, status, created_shop_id, provider_checkout_session_id, provider_subscription_id")
    .eq("id", intentId)
    .maybeSingle<{
      id: string;
      owner_email: string | null;
      plan_code: string;
      billing_interval: string;
      status: string;
      created_shop_id: string | null;
      provider_checkout_session_id: string | null;
      provider_subscription_id: string | null;
    }>();

  if (error || !intent) {
    return appRedirect(
      request,
      `/subscribe/start?error=${encodeURIComponent(error?.message ?? "subscription_intent_not_found")}`,
    );
  }

  if (intent.status === "payment_pending" || intent.status === "payment_approved") {
    try {
      await reconcileReturnedSubscription({
        admin,
        intent,
        returnedSubscriptionId,
        returnedStatus,
      });

      const { data: refreshedIntent } = await admin
        .from("subscription_intents")
        .select("id, plan_code, billing_interval, status, created_shop_id")
        .eq("id", intent.id)
        .maybeSingle<{
          id: string;
          plan_code: string;
          billing_interval: string;
          status: string;
          created_shop_id: string | null;
        }>();

      if (refreshedIntent) {
        intent.status = refreshedIntent.status;
        intent.created_shop_id = refreshedIntent.created_shop_id;
      }
    } catch (reconcileError) {
      console.warn("Could not reconcile Dodo subscription return", {
        intentId: intent.id,
        returnedSubscriptionId,
        returnedStatus,
        message: reconcileError instanceof Error ? reconcileError.message : "unknown_error",
      });
    }
  }

  if (intent.status === "completed" || intent.status === "payment_approved") {
    if (!intent.created_shop_id) {
      return appRedirect(request, "/onboarding");
    }

    const { data: shop } = await admin
      .from("shops")
      .select("slug")
      .eq("id", intent.created_shop_id)
      .maybeSingle<{ slug: string | null }>();

    return appRedirect(
      request,
      shop?.slug ? `${buildShopRoute(shop.slug, "subscription")}?updated=1` : "/subscription?updated=1",
    );
  }

  return appRedirect(
    request,
    `/subscribe/start?plan=${intent.plan_code}&billing=${intent.billing_interval}&intent=${intent.id}&checkout=returned`,
  );
}
