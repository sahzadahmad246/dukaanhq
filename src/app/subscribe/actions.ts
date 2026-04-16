"use server";

import { revalidatePath } from "next/cache";

import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dev-only: marks the signed-in owner's shop as actively subscribed (no Cashfree call).
 * Set DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION=true in .env.local to show the button on /subscribe.
 */
export async function devActivateShopSubscriptionAction(): Promise<{ ok: boolean; message: string }> {
  if (process.env.DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION !== "true") {
    return { ok: false, message: "Dev activation is disabled." };
  }

  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user || !state.membership || state.membership.role !== "owner") {
    return { ok: false, message: "Only the shop owner can run this." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, message: "Service role key is not configured." };
  }

  const shopId = state.membership.shop_id;
  const farFuture = new Date();
  farFuture.setFullYear(farFuture.getFullYear() + 10);

  const { error } = await admin.from("shop_entitlements").upsert(
    {
      shop_id: shopId,
      billing_status: "active",
      subscription_valid_until: farFuture.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id" },
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/subscribe");
  revalidatePath("/dashboard");
  return { ok: true, message: "Shop marked active (dev)." };
}
