export type ExpectedDodoPrice = {
  provider_product_id: string | null;
  currency: string;
  interval: "month" | "year";
  interval_count?: number;
  regular_price_paise: number;
  discounted_price_paise: number | null;
  discount_enabled: boolean;
  discount_ends_at?: string | null;
  is_active?: boolean;
};

export type DodoProductPrice = {
  product_id: string;
  is_recurring: boolean;
  is_archived?: boolean;
  price: {
    type: string;
    currency: string;
    price: number;
    payment_frequency_count?: number;
    payment_frequency_interval?: string;
    discount?: number;
    discount_bps?: number | null;
    purchasing_power_parity?: boolean;
    trial_amount?: number | null;
  };
};

export function effectivePlanAmount(price: ExpectedDodoPrice, now = Date.now()) {
  const expires = price.discount_ends_at ? new Date(price.discount_ends_at).getTime() : null;
  if (price.discount_enabled && price.discounted_price_paise != null && (expires === null || expires > now)) {
    return price.discounted_price_paise;
  }
  return price.regular_price_paise;
}

export function formatProviderAmount(amount: number, currency: string) {
  // Our plan catalogue is INR. Provider amounts may also be USD; Intl handles
  // currencies whose minor-unit exponent differs (e.g. JPY and KWD).
  try {
    const formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return `${formatter.format(amount / 10 ** digits)} ${currency}`;
  } catch { return `${amount} minor units (${currency || "unknown currency"})`; }
}

function months(interval: string | undefined, count: number | undefined) {
  if (!Number.isSafeInteger(count) || (count ?? 0) < 1) return null;
  return interval?.toLowerCase() === "month" ? count! : interval?.toLowerCase() === "year" ? count! * 12 : null;
}

export function validateDodoProductPrice(expected: ExpectedDodoPrice, product: DodoProductPrice): string | null {
  const amount = effectivePlanAmount(expected);
  if (!expected.provider_product_id || product.product_id !== expected.provider_product_id) return "Dodo product does not match the configured plan product.";
  if (expected.is_active === false) return "This plan price is inactive.";
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(expected.regular_price_paise) || expected.regular_price_paise < 0) return "The app plan price is invalid.";
  if (product.is_archived || !product.is_recurring || product.price?.type !== "recurring_price") return "Dodo product must be an active recurring subscription product.";
  if (product.price.currency !== expected.currency) return `Currency mismatch: app expects ${expected.currency}, Dodo product uses ${product.price.currency}.`;
  if (months(product.price.payment_frequency_interval, product.price.payment_frequency_count) !== months(expected.interval, expected.interval_count ?? 1)) return "Dodo billing frequency does not match the selected monthly/yearly plan.";
  const discountBps = product.price.discount_bps ?? (product.price.discount ?? 0) * 100;
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000 || !Number.isSafeInteger(product.price.price) || product.price.price < 0) return "Dodo product has an invalid price or discount.";
  const providerAmount = Math.round(product.price.price * (10000 - discountBps) / 10000);
  if (providerAmount !== amount) return `Price mismatch: app expects ${formatProviderAmount(amount, expected.currency)}, Dodo product charges ${formatProviderAmount(providerAmount, product.price.currency)} before tax.`;
  if (product.price.purchasing_power_parity) return "Dodo regional pricing is enabled; use a product with fixed pricing to match the advertised plan amount.";
  if ((product.price.trial_amount ?? 0) > 0) return "Dodo product has a paid trial, but this checkout advertises a free trial.";
  return null;
}

export type RecordedSubscriptionPrice = {
  subscription_id?: string;
  product_id?: string;
  currency?: string;
  recurring_pre_tax_amount?: number;
  payment_frequency_count?: number;
  payment_frequency_interval?: string;
  quantity?: number;
  status?: string;
  next_billing_date?: string;
};

export function validateRecordedSubscription(expected: ExpectedDodoPrice, snapshot: RecordedSubscriptionPrice): string | null {
  if (snapshot.product_id !== expected.provider_product_id) return "Subscription uses a different Dodo product than the app plan.";
  if (snapshot.currency !== expected.currency) return `Recorded renewal currency is ${snapshot.currency ?? "unknown"}; the app advertises ${expected.currency}.`;
  if (snapshot.quantity !== 1) return "Recorded subscription quantity differs from one workspace.";
  if (months(snapshot.payment_frequency_interval, snapshot.payment_frequency_count) !== months(expected.interval, expected.interval_count ?? 1)) return "Recorded renewal frequency differs from the app plan.";
  if (snapshot.recurring_pre_tax_amount !== effectivePlanAmount(expected)) return "Recorded recurring amount differs from the current advertised plan price. Verify the customer's agreed price before repricing.";
  return null;
}
