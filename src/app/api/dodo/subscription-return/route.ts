import { NextResponse } from "next/server";

import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function appRedirect(request: Request, path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin = appUrl || new URL(request.url).origin;
  return NextResponse.redirect(new URL(path, origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intentId = url.searchParams.get("intent");

  if (!intentId) {
    return appRedirect(request, "/subscribe/start?error=missing_intent");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return appRedirect(request, "/subscribe/start?error=server_not_configured");
  }

  const { data: intent, error } = await admin
    .from("subscription_intents")
    .select("id, plan_code, billing_interval, status, created_shop_id")
    .eq("id", intentId)
    .maybeSingle<{
      id: string;
      plan_code: string;
      billing_interval: string;
      status: string;
      created_shop_id: string | null;
    }>();

  if (error || !intent) {
    return appRedirect(
      request,
      `/subscribe/start?error=${encodeURIComponent(error?.message ?? "subscription_intent_not_found")}`,
    );
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
