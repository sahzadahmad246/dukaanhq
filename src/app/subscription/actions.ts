"use server";

import { revalidatePath } from "next/cache";

import { manageCashfreeSubscription } from "@/lib/cashfree/client";
import { getUserAppState } from "@/lib/auth/user-flow";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function cancelCurrentShopSubscriptionAction(): Promise<void> {
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
  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("id, cashfree_subscription_id, current_period_end")
    .eq("shop_id", shopId)
    .maybeSingle<{
      id: string;
      cashfree_subscription_id: string | null;
      current_period_end: string | null;
    }>();

  if (!subscription?.cashfree_subscription_id) {
    return;
  }

  const now = new Date().toISOString();
  try {
    const response = await manageCashfreeSubscription(subscription.cashfree_subscription_id, "CANCEL");

    await admin
      .from("shop_subscriptions")
      .update({
        status: "cancel_at_period_end",
        cancel_at_period_end: true,
        cancelled_at: now,
        last_webhook_event_at: now,
        updated_at: now,
      })
      .eq("id", subscription.id);

    await admin
      .from("shop_entitlements")
      .update({
        cancel_at_period_end: true,
        access_expires_at: subscription.current_period_end,
        locked_reason: null,
        updated_at: now,
      })
      .eq("shop_id", shopId);

    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "cashfree",
      event_type: "OWNER_CANCELLED_SUBSCRIPTION",
      payload: response,
      processed_status: "cancelled",
    });
  } catch (error) {
    await admin.from("subscription_events").insert({
      shop_id: shopId,
      subscription_id: subscription.id,
      provider: "cashfree",
      event_type: "OWNER_CANCEL_SUBSCRIPTION_FAILED",
      payload: { cashfree_subscription_id: subscription.cashfree_subscription_id },
      processed_status: "error",
      processed_message: error instanceof Error ? error.message : "Cancellation failed",
    });
  }

  revalidatePath("/subscription");
  if (state.shopSlug) {
    revalidatePath(buildShopRoute(state.shopSlug, "subscription"));
  }
}
