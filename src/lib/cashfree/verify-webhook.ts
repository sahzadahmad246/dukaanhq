import crypto from "node:crypto";

/**
 * Cashfree PG webhook verification (same algorithm as official SDK).
 * @see https://www.cashfree.com/docs/payments/online/webhooks/signature-verification
 */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secretKey: string,
): boolean {
  if (!timestampHeader || !signatureHeader || !secretKey) {
    return false;
  }

  const signedPayload = timestampHeader + rawBody;
  const expected = crypto.createHmac("sha256", secretKey).update(signedPayload).digest("base64");

  if (expected.length !== signatureHeader.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
