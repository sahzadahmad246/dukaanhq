import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function handleReconcile(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "supabase_admin_not_configured" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: expiredGraceRows, error: graceError } = await admin
    .from("shop_entitlements")
    .select("shop_id, subscription_id, grace_ends_at")
    .eq("billing_status", "active")
    .not("grace_ends_at", "is", null)
    .lte("grace_ends_at", now);

  if (graceError) {
    return NextResponse.json({ error: "grace_query_failed", message: graceError.message }, { status: 500 });
  }

  const expiredGrace = expiredGraceRows ?? [];
  for (const row of expiredGrace) {
    await admin
      .from("shop_entitlements")
      .update({
        billing_status: "locked",
        locked_reason: "payment_grace_expired",
        updated_at: now,
      })
      .eq("shop_id", row.shop_id);

    if (row.subscription_id) {
      await admin
        .from("shop_subscriptions")
        .update({
          status: "locked",
          updated_at: now,
        })
        .eq("id", row.subscription_id);
    }
  }

  const { data: expiredTrialRows, error: trialError } = await admin
    .from("shop_entitlements")
    .select("shop_id, subscription_id, trial_ends_at")
    .eq("billing_status", "trialing")
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", now);

  if (trialError) {
    return NextResponse.json({ error: "trial_query_failed", message: trialError.message }, { status: 500 });
  }

  const expiredTrials = expiredTrialRows ?? [];
  for (const row of expiredTrials) {
    await admin
      .from("shop_entitlements")
      .update({
        billing_status: "locked",
        locked_reason: "trial_expired",
        updated_at: now,
      })
      .eq("shop_id", row.shop_id);

    if (row.subscription_id) {
      await admin
        .from("shop_subscriptions")
        .update({
          status: "expired",
          updated_at: now,
        })
        .eq("id", row.subscription_id);
    }
  }

  return NextResponse.json({
    ok: true,
    lockedGraceExpired: expiredGrace.length,
    lockedTrials: expiredTrials.length,
  });
}

export async function GET(request: Request) {
  return handleReconcile(request);
}

export async function POST(request: Request) {
  return handleReconcile(request);
}
