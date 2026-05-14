import { NextResponse } from "next/server";

import { getDodoWebhookSignatureDebug, verifyDodoWebhookSignature } from "@/lib/dodo/verify-webhook";
import { applyDodoWebhookToEntitlement } from "@/lib/subscription/dodo-webhook-handlers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Dodo Payments webhooks.
 * Configure URL: {NEXT_PUBLIC_APP_URL}/api/webhooks/dodo
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET?.trim() || process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();

  if (!secret) {
    console.error("DODO_PAYMENTS_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "dodo_not_configured" }, { status: 503 });
  }

  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");

  if (!verifyDodoWebhookSignature({ rawBody, webhookId, webhookTimestamp, webhookSignature, secret })) {
    console.warn("Dodo webhook signature verification failed", getDodoWebhookSignatureDebug({
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      secret,
    }));
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
    console.error("Supabase service role missing for Dodo webhook");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const result = await applyDodoWebhookToEntitlement(admin, body, webhookId);

  if (!result.ok) {
    console.warn("Dodo webhook handled with notice:", result.message);
  }

  return NextResponse.json({
    received: true,
    ok: result.ok,
    message: result.message,
    shopId: "shopId" in result ? result.shopId : undefined,
    intentId: "intentId" in result ? result.intentId : undefined,
  });
}
