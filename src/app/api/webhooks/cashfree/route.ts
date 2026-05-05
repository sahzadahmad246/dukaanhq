import { NextResponse } from "next/server";

import { verifyCashfreeWebhookSignature } from "@/lib/cashfree/verify-webhook";
import { applyCashfreeWebhookToEntitlement } from "@/lib/subscription/cashfree-webhook-handlers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Cashfree Payments / Subscriptions webhooks.
 * Configure URL: {NEXT_PUBLIC_APP_URL}/api/webhooks/cashfree
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  const secret = process.env.CASHFREE_SECRET_KEY?.trim();

  if (!secret) {
    console.error("CASHFREE_SECRET_KEY is not set");
    return NextResponse.json({ error: "cashfree_not_configured" }, { status: 503 });
  }

  if (!verifyCashfreeWebhookSignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("Supabase service role missing for Cashfree webhook");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const result = await applyCashfreeWebhookToEntitlement(admin, body);

  if (!result.ok) {
    console.warn("Cashfree webhook handled with notice:", result.message);
  }

  return NextResponse.json({
    received: true,
    ok: result.ok,
    message: result.message,
    shopId: "shopId" in result ? result.shopId : undefined,
    intentId: "intentId" in result ? result.intentId : undefined,
  });
}
