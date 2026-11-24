"use server";

import { redirect } from "next/navigation";

import type { ExpectedDodoPrice } from "@/lib/dodo/price-validation";
import { createDodoCheckoutSession } from "@/lib/dodo/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeBillingInterval,
  normalizePlanCode,
} from "@/lib/subscription/intents";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function normalizeCustomerPhone(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 10);
}

async function validateTargetPlanForShop(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  shopId: string,
  plan: {
    display_name: string;
    limits: Record<string, number | null | undefined> | null;
  },
) {
  const [productsResult, staffResult, invoicesResult] = await Promise.all([
    admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    admin
      .from("shop_members")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "ACTIVE"),
    admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .gte("invoice_date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const checks: Array<{ key: string; label: string; used: number }> = [
    { key: "products", label: "products", used: productsResult.count ?? 0 },
    { key: "staff", label: "active team members", used: staffResult.count ?? 0 },
    { key: "invoices_per_month", label: "invoices this month", used: invoicesResult.count ?? 0 },
  ];

  for (const check of checks) {
    const limit = plan.limits?.[check.key];
    if (limit !== null && limit !== undefined && check.used > limit) {
      return `${plan.display_name} allows ${limit} ${check.label}, but this shop currently has ${check.used}. Reduce usage before switching plans.`;
    }
  }

  return null;
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
    .select("id, code, display_name, limits")
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle<{ id: string; code: string; display_name: string; limits: Record<string, number | null | undefined> | null }>();

  if (planError || !plan) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(planError?.message ?? "plan_missing")}`);
  }

  if (membership?.shop_id) {
    const downgradeMessage = await validateTargetPlanForShop(admin, membership.shop_id, plan);
    if (downgradeMessage) {
      redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(downgradeMessage)}`);
    }
  }

  const { data: price, error: priceError } = await admin
    .from("saas_plan_prices")
    .select("id, currency, interval, interval_count, regular_price_paise, discounted_price_paise, discount_enabled, discount_ends_at, provider_product_id, is_active")
    .eq("plan_id", plan.id)
    .eq("interval", billingInterval)
    .eq("interval_count", 1)
    .maybeSingle<ExpectedDodoPrice & { id: string }>();

  if (priceError || !price) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(priceError?.message ?? "price_missing")}`);
  }

  const dodoProductId = price.provider_product_id?.trim();
  if (!dodoProductId) {
    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent("Payment product is missing for this plan. Add the product ID in Superadmin > Plans.")}`);
  }

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

  let successRedirectPath: string | null = null;

  try {
    const session = await createDodoCheckoutSession({
      product_cart: [{ product_id: dodoProductId, quantity: 1 }],
      customer: {
        name: user.user_metadata.full_name ?? user.user_metadata.name ?? ownerEmail,
        email: ownerEmail,
        phone_number: `+91${customerPhone}`,
      },
      return_url: `${appUrl()}/api/dodo/subscription-return?intent=${intent.id}`,
      cancel_url: `${appUrl()}/subscribe/start?plan=${planCode}&billing=${billingInterval}`,
      feature_flags: {
        allow_discount_code: true,
      },
      metadata: {
        dukaanhq_intent_id: intent.id,
        dukaanhq_owner_user_id: user.id,
        dukaanhq_plan_code: planCode,
        dukaanhq_price_id: price.id,
        dukaanhq_mode: membership?.shop_id ? "shop_plan_change" : "pre_onboarding",
      },
    }, price);

    if (!session.checkout_url) {
      throw new Error("Secure checkout URL was not returned.");
    }

    await admin
      .from("subscription_intents")
      .update({
        provider: "dodo",
        provider_checkout_session_id: session.session_id,
        provider_checkout_url: session.checkout_url,
        provider_status: "checkout_created",
        metadata: {
          source: "public_pricing",
          customer_phone: customerPhone,
          mode: membership?.shop_id ? "shop_plan_change" : "pre_onboarding",
          dodo_product_id: dodoProductId,
          dodo_checkout_session: session,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", intent.id);

    successRedirectPath = session.checkout_url;
  } catch (error) {
    await admin
      .from("subscription_intents")
      .update({
        status: "cancelled",
        metadata: {
          source: "public_pricing",
          dodo_error: error instanceof Error ? error.message : "Checkout setup failed",
        },
      })
      .eq("id", intent.id);

    redirect(`/subscribe/start?plan=${planCode}&billing=${billingInterval}&error=${encodeURIComponent(error instanceof Error ? error.message : "Checkout setup failed")}`);
  }

  if (successRedirectPath) {
    redirect(successRedirectPath);
  }
}
