type CashfreeEnvironment = "sandbox" | "production";

export type CashfreeSubscriptionPayload = {
  subscription_id: string;
  customer_details: Record<string, unknown>;
  plan_details: Record<string, unknown>;
  subscription_meta?: Record<string, unknown>;
  subscription_tags?: Record<string, string>;
  subscription_note?: string;
};

export type CashfreeSubscriptionResponse = Record<string, unknown> & {
  subscription_id?: string;
  cf_subscription_id?: string;
  subscription_session_id?: string;
  subscription_status?: string;
};

function getCashfreeConfig() {
  const env = (process.env.CASHFREE_ENV ?? "sandbox").trim().toLowerCase() as CashfreeEnvironment;
  const clientId = process.env.CASHFREE_APP_ID?.trim();
  const clientSecret = process.env.CASHFREE_SECRET_KEY?.trim();
  const apiVersion = process.env.CASHFREE_API_VERSION?.trim() || "2025-01-01";

  if (!clientId || !clientSecret) {
    throw new Error("Cashfree credentials are missing.");
  }

  return {
    baseUrl: env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
    clientId,
    clientSecret,
    apiVersion,
  };
}

function cashfreeHeaders(extra?: Record<string, string>) {
  const config = getCashfreeConfig();
  return {
    "content-type": "application/json",
    "x-api-version": config.apiVersion,
    "x-client-id": config.clientId,
    "x-client-secret": config.clientSecret,
    "x-request-id": crypto.randomUUID(),
    ...extra,
  };
}

async function parseCashfreeResponse(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};

  if (!response.ok) {
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : `Cashfree request failed with ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function createCashfreeSubscription(
  payload: CashfreeSubscriptionPayload,
): Promise<CashfreeSubscriptionResponse> {
  const config = getCashfreeConfig();
  const response = await fetch(`${config.baseUrl}/subscriptions`, {
    method: "POST",
    headers: cashfreeHeaders({ "x-idempotency-key": payload.subscription_id }),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return parseCashfreeResponse(response) as Promise<CashfreeSubscriptionResponse>;
}

export async function fetchCashfreeSubscription(subscriptionId: string): Promise<CashfreeSubscriptionResponse> {
  const config = getCashfreeConfig();
  const response = await fetch(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: cashfreeHeaders(),
    cache: "no-store",
  });

  return parseCashfreeResponse(response) as Promise<CashfreeSubscriptionResponse>;
}

export async function fetchCashfreeSubscriptionPayments(subscriptionId: string) {
  const config = getCashfreeConfig();
  const response = await fetch(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}/payments`, {
    method: "GET",
    headers: cashfreeHeaders(),
    cache: "no-store",
  });

  return parseCashfreeResponse(response);
}

export async function manageCashfreeSubscription(
  subscriptionId: string,
  action: "CANCEL" | "PAUSE" | "ACTIVATE" | "CHANGE_PLAN",
  actionDetails?: Record<string, unknown>,
) {
  const config = getCashfreeConfig();
  const response = await fetch(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      subscription_id: subscriptionId,
      action,
      ...(actionDetails ? { action_details: actionDetails } : {}),
    }),
    cache: "no-store",
  });

  return parseCashfreeResponse(response);
}
