import { NextResponse } from "next/server";

import { fetchCashfreeSubscription, manageCashfreeSubscription } from "@/lib/cashfree/client";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function appRedirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getAuthorizationStatus(subscription: Record<string, unknown>) {
  const auth =
    nestedRecord(subscription.authorization_details) ??
    nestedRecord(subscription.authorisation_details);
  return asString(auth?.authorization_status ?? auth?.authorisation_status);
}

function getAuthorizationTime(subscription: Record<string, unknown>) {
  const auth =
    nestedRecord(subscription.authorization_details) ??
    nestedRecord(subscription.authorisation_details);
  return asString(auth?.authorization_time ?? auth?.authorisation_time);
}

function approvalLooksSuccessful(subscription: Record<string, unknown>) {
  const subscriptionStatus = asString(subscription.subscription_status)?.toUpperCase() ?? "";
  const authorizationStatus = getAuthorizationStatus(subscription)?.toUpperCase() ?? "";

  return (
    ["ACTIVE", "BANK_APPROVAL_PENDING"].includes(subscriptionStatus) ||
    ["SUCCESS", "ACTIVE", "APPROVED", "AUTHORIZED", "AUTHORISED"].includes(authorizationStatus)
  );
}

async function handleReturn(request: Request) {
  const url = new URL(request.url);
  const intentId = url.searchParams.get("intent");

  if (!intentId) {
    return appRedirect(request, "/subscribe/start?error=missing_intent");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return appRedirect(request, "/subscribe/start?error=server_not_configured");
  }

  const { data: intent, error: intentError } = await admin
    .from("subscription_intents")
    .select("id, owner_user_id, plan_id, price_id, plan_code, billing_interval, cashfree_subscription_id, created_shop_id")
    .eq("id", intentId)
    .maybeSingle<{
      id: string;
      owner_user_id: string;
      plan_id: string;
      price_id: string | null;
      plan_code: string;
      billing_interval: string;
      cashfree_subscription_id: string | null;
      created_shop_id: string | null;
    }>();

  if (intentError || !intent?.cashfree_subscription_id) {
    return appRedirect(
      request,
      `/subscribe/start?error=${encodeURIComponent(intentError?.message ?? "subscription_intent_not_found")}`,
    );
  }

  try {
    const subscription = await fetchCashfreeSubscription(intent.cashfree_subscription_id);
    const now = new Date();
    const authTime = getAuthorizationTime(subscription);
    const periodStart = authTime ? new Date(authTime) : now;
    const periodEnd = new Date(periodStart.getTime() + (intent.billing_interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000);
    const approved = approvalLooksSuccessful(subscription);

    await admin.from("subscription_events").insert({
      subscription_intent_id: intent.id,
      provider: "cashfree",
      event_type: "SUBSCRIPTION_RETURN_VERIFY",
      payload: subscription,
      processed_status: approved ? "approved" : "pending",
      processed_message: `subscription_status:${asString(subscription.subscription_status) ?? "unknown"}`,
    });

    await admin
      .from("subscription_intents")
      .update({
        status: approved ? "payment_approved" : "payment_pending",
        cashfree_cf_subscription_id: asString(subscription.cf_subscription_id),
        cashfree_authorization_status: getAuthorizationStatus(subscription) ?? asString(subscription.subscription_status),
        current_period_start: approved ? periodStart.toISOString() : null,
        current_period_end: approved ? periodEnd.toISOString() : null,
        next_payment_at: approved ? periodEnd.toISOString() : null,
        last_payment_at: approved ? periodStart.toISOString() : null,
        last_payment_status: approved ? "AUTHORIZED" : "PENDING",
        expires_at: approved ? periodEnd.toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          cashfree_fetch_response: subscription,
          verified_at: now.toISOString(),
        },
        updated_at: now.toISOString(),
      })
      .eq("id", intent.id);

    if (approved) {
      if (intent.created_shop_id) {
        const { data: shop } = await admin
          .from("shops")
          .select("id, slug")
          .eq("id", intent.created_shop_id)
          .maybeSingle<{ id: string; slug: string | null }>();

        const subscriptionPayload = {
          shop_id: intent.created_shop_id,
          owner_user_id: intent.owner_user_id,
          plan_id: intent.plan_id,
          price_id: intent.price_id,
          source_intent_id: intent.id,
          status: "active",
          billing_interval: intent.billing_interval,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cashfree_subscription_id: intent.cashfree_subscription_id,
          cashfree_cf_subscription_id: asString(subscription.cf_subscription_id),
          cashfree_authorization_status: getAuthorizationStatus(subscription) ?? asString(subscription.subscription_status),
          next_payment_at: periodEnd.toISOString(),
          last_payment_at: periodStart.toISOString(),
          last_payment_status: "AUTHORIZED",
          updated_at: now.toISOString(),
        };

        const { data: existingSub } = await admin
          .from("shop_subscriptions")
          .select("id, cashfree_subscription_id")
          .eq("shop_id", intent.created_shop_id)
          .maybeSingle<{ id: string; cashfree_subscription_id: string | null }>();

        const subscriptionResult = existingSub?.id
          ? await admin
              .from("shop_subscriptions")
              .update(subscriptionPayload)
              .eq("id", existingSub.id)
              .select("id")
              .single<{ id: string }>()
          : await admin
              .from("shop_subscriptions")
              .insert(subscriptionPayload)
              .select("id")
              .single<{ id: string }>();

        await admin.from("shop_entitlements").upsert(
          {
            shop_id: intent.created_shop_id,
            billing_status: "active",
            subscription_valid_until: periodEnd.toISOString(),
            plan_id: intent.plan_id,
            subscription_id: subscriptionResult.data?.id ?? null,
            access_expires_at: periodEnd.toISOString(),
            cashfree_subscription_id: intent.cashfree_subscription_id,
            cancel_at_period_end: false,
            locked_reason: null,
            updated_at: now.toISOString(),
          },
          { onConflict: "shop_id" },
        );

        const previousSubscriptionId = existingSub?.cashfree_subscription_id;
        if (
          previousSubscriptionId &&
          previousSubscriptionId !== intent.cashfree_subscription_id
        ) {
          try {
            const cancelResponse = await manageCashfreeSubscription(previousSubscriptionId, "CANCEL");
            await admin.from("subscription_events").insert({
              shop_id: intent.created_shop_id,
              subscription_intent_id: intent.id,
              subscription_id: subscriptionResult.data?.id ?? null,
              provider: "cashfree",
              event_type: "PREVIOUS_SUBSCRIPTION_CANCELLED",
              payload: cancelResponse,
              processed_status: "cancelled",
              processed_message: `cancelled:${previousSubscriptionId}`,
            });
          } catch (cancelError) {
            await admin.from("subscription_events").insert({
              shop_id: intent.created_shop_id,
              subscription_intent_id: intent.id,
              subscription_id: subscriptionResult.data?.id ?? null,
              provider: "cashfree",
              event_type: "PREVIOUS_SUBSCRIPTION_CANCEL_FAILED",
              payload: { previousSubscriptionId },
              processed_status: "error",
              processed_message: cancelError instanceof Error ? cancelError.message : "Previous subscription cancellation failed",
            });
          }
        }

        await admin
          .from("subscription_intents")
          .update({
            status: "completed",
            updated_at: now.toISOString(),
          })
          .eq("id", intent.id);

        return appRedirect(
          request,
          shop?.slug ? `${buildShopRoute(shop.slug, "subscription")}?updated=1` : "/subscription?updated=1",
        );
      }

      return appRedirect(request, "/onboarding");
    }

    return appRedirect(
      request,
      `/subscribe/start?plan=${intent.plan_code}&billing=${intent.billing_interval}&error=${encodeURIComponent("Cashfree authorization is still pending. Try again after completing the authorization.")}`,
    );
  } catch (error) {
    return appRedirect(
      request,
      `/subscribe/start?plan=${intent.plan_code}&billing=${intent.billing_interval}&error=${encodeURIComponent(error instanceof Error ? error.message : "Cashfree verification failed")}`,
    );
  }
}

export async function GET(request: Request) {
  return handleReturn(request);
}

export async function POST(request: Request) {
  return handleReturn(request);
}
