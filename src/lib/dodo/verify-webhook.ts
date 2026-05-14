import { createHmac, timingSafeEqual } from "node:crypto";

function signatureCandidates(header: string) {
  return header
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return part;
      }

      const key = part.slice(0, separatorIndex).toLowerCase();
      if (/^v\d+$/.test(key) || key === "sig" || key === "signature" || key === "sha256") {
        return part.slice(separatorIndex + 1);
      }

      return part;
    })
    .filter((part) => !/^v\d+$/.test(part))
    .filter(Boolean);
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signingSecrets(secret: string) {
  const secrets: Array<string | Buffer> = [secret];

  if (secret.startsWith("whsec_")) {
    try {
      secrets.push(Buffer.from(secret.slice("whsec_".length), "base64"));
    } catch {
      // Keep the raw secret fallback above.
    }
  }

  return secrets;
}

function expectedSignatures(secret: string, payload: string) {
  return signingSecrets(secret).flatMap((key) => [
    createHmac("sha256", key).update(payload).digest("base64"),
    createHmac("sha256", key).update(payload).digest("hex"),
  ]);
}

export function verifyDodoWebhookSignature(input: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
}) {
  if (!input.webhookId || !input.webhookTimestamp || !input.webhookSignature || !input.secret) {
    return false;
  }

  const payload = `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`;
  const expected = expectedSignatures(input.secret, payload);

  return signatureCandidates(input.webhookSignature).some((candidate) =>
    expected.some((signature) => safeCompare(candidate, signature)),
  );
}

export function getDodoWebhookSignatureDebug(input: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
}) {
  const candidates = input.webhookSignature ? signatureCandidates(input.webhookSignature) : [];
  const payload = input.webhookId && input.webhookTimestamp ? `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}` : "";
  const expected = payload ? expectedSignatures(input.secret, payload) : [];

  return {
    hasWebhookId: Boolean(input.webhookId),
    hasWebhookTimestamp: Boolean(input.webhookTimestamp),
    hasWebhookSignature: Boolean(input.webhookSignature),
    webhookId: input.webhookId,
    webhookTimestamp: input.webhookTimestamp,
    rawBodyLength: input.rawBody.length,
    secretPrefix: input.secret.slice(0, 6),
    secretLength: input.secret.length,
    candidateCount: candidates.length,
    candidateLengths: candidates.map((candidate) => candidate.length),
    expectedLengths: expected.map((signature) => signature.length),
    signatureHeaderPrefix: input.webhookSignature?.slice(0, 24) ?? null,
  };
}
