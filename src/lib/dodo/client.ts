type DodoEnvironment = "test_mode" | "live_mode";
const DODO_REQUEST_TIMEOUT_MS = 20_000;

export type DodoCheckoutSessionPayload = {
  product_cart: Array<{ product_id: string; quantity: number }>;
  customer?: {
    email?: string;
    name?: string;
    phone_number?: string;
  };
  metadata?: Record<string, string>;
  return_url?: string;
  cancel_url?: string;
  feature_flags?: {
    allow_discount_code?: boolean;
  };
  subscription_data?: {
    trial_period_days?: number;
  };
};

export type DodoCheckoutSessionResponse = {
  session_id: string;
  checkout_url: string | null;
};

export type DodoCheckoutSessionStatusResponse = {
  created_at?: string;
  id?: string;
  customer_email?: string | null;
  customer_name?: string | null;
  payment_id?: string | null;
  payment_status?:
    | "succeeded"
    | "failed"
    | "cancelled"
    | "processing"
    | "requires_customer_action"
    | "requires_merchant_action"
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_capture"
    | "partially_captured"
    | "partially_captured_and_capturable"
    | null;
};

export type DodoSubscriptionResponse = Record<string, unknown> & {
  subscription_id?: string;
  customer?: {
    customer_id?: string;
    email?: string;
    name?: string;
  };
  status?: string;
  next_billing_date?: string;
  previous_billing_date?: string;
  created_at?: string;
  trial_period_days?: number;
  cancel_at_next_billing_date?: boolean;
};

export type DodoPaymentListResponse = {
  items?: Array<{
    payment_id?: string;
    total_amount?: number;
    status?: string;
    subscription_id?: string | null;
    created_at?: string;
  }>;
};

export type DodoChangePlanPayload = {
  product_id: string;
  quantity?: number;
  proration_billing_mode?: "prorated_immediately" | "difference_immediately" | "full_immediately" | "do_not_bill";
  effective_at?: "immediately" | "next_billing_date";
};

function getDodoConfig() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode").trim() as DodoEnvironment;
  const baseUrl =
    process.env.DODO_PAYMENTS_API_BASE_URL?.replace(/\/$/, "") ??
    (environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com");

  if (!apiKey) {
    throw new Error("Dodo Payments API key is missing.");
  }

  return { apiKey, baseUrl, environment };
}

function dodoHeaders(extra?: Record<string, string>) {
  const config = getDodoConfig();
  return {
    "content-type": "application/json",
    authorization: `Bearer ${config.apiKey}`,
    ...extra,
  };
}

async function fetchDodo(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DODO_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Secure checkout setup timed out. Please try again in a moment.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseDodoResponse(response: Response) {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    body = { message: text || `Payment provider returned ${response.status}` };
  }

  if (!response.ok) {
    const providerMessage =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : `Dodo Payments request failed with ${response.status}`;
    const message =
      response.status === 401 || providerMessage.toLowerCase() === "unauthorized"
        ? "Dodo Payments rejected the API key. Check that the key belongs to the selected test/live environment and has write access enabled."
        : providerMessage;
    throw new Error(message);
  }

  return body;
}

export async function createDodoCheckoutSession(
  payload: DodoCheckoutSessionPayload,
): Promise<DodoCheckoutSessionResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/checkouts`, {
    method: "POST",
    headers: dodoHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoCheckoutSessionResponse>;
}

export async function retrieveDodoCheckoutSession(
  checkoutSessionId: string,
): Promise<DodoCheckoutSessionStatusResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/checkouts/${encodeURIComponent(checkoutSessionId)}`, {
    method: "GET",
    headers: dodoHeaders(),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoCheckoutSessionStatusResponse>;
}

export async function cancelDodoSubscriptionAtPeriodEnd(subscriptionId: string): Promise<DodoSubscriptionResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: dodoHeaders(),
    body: JSON.stringify({
      billing: {
        cancel_at_next_billing_date: true,
        cancel_reason: "cancelled_by_customer",
        cancellation_comment: "Customer requested cancellation from DukaanHQ.",
      },
    }),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoSubscriptionResponse>;
}

export async function resumeDodoSubscriptionRenewal(subscriptionId: string): Promise<DodoSubscriptionResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: dodoHeaders(),
    body: JSON.stringify({
      billing: {
        cancel_at_next_billing_date: false,
      },
    }),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoSubscriptionResponse>;
}

export async function retrieveDodoSubscription(subscriptionId: string): Promise<DodoSubscriptionResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: dodoHeaders(),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoSubscriptionResponse>;
}

export async function listDodoPaymentsForSubscription(subscriptionId: string): Promise<DodoPaymentListResponse> {
  const config = getDodoConfig();
  const params = new URLSearchParams({
    subscription_id: subscriptionId,
    page_size: "10",
  });
  const response = await fetchDodo(`${config.baseUrl}/payments?${params.toString()}`, {
    method: "GET",
    headers: dodoHeaders(),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoPaymentListResponse>;
}

export async function changeDodoSubscriptionPlan(
  subscriptionId: string,
  payload: DodoChangePlanPayload,
): Promise<DodoSubscriptionResponse> {
  const config = getDodoConfig();
  const response = await fetchDodo(`${config.baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`, {
    method: "POST",
    headers: dodoHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return parseDodoResponse(response) as Promise<DodoSubscriptionResponse>;
}
