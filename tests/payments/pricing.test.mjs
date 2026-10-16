import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requirePackage = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const filename = path.join(root, file), exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, { exports, require: name => name === 'server-only' ? {} : Object.hasOwn(mocks, name) ? mocks[name] : requirePackage(name), console, Date, Error, Intl, URLSearchParams, AbortController, setTimeout, clearTimeout, ...globals }, { filename });
  return exports;
}
const pricing = load('src/lib/dodo/price-validation.ts');
const expected = { provider_product_id: 'pdt_starter', currency: 'INR', interval: 'month', interval_count: 1, regular_price_paise: 49900, discounted_price_paise: null, discount_enabled: false, is_active: true };
function product(overrides = {}) { return { product_id: 'pdt_starter', is_recurring: true, price: { type: 'recurring_price', currency: 'INR', price: 49900, payment_frequency_count: 1, payment_frequency_interval: 'Month', ...overrides } }; }
function client({ responseProduct = product(), environment = 'test_mode', apiStatus = 200 } = {}) {
  const requests = [];
  const api = load('src/lib/dodo/client.ts', { './price-validation': pricing }, {
    process: { env: { NODE_ENV: 'production', DODO_PAYMENTS_ENVIRONMENT: environment, DODO_PAYMENTS_API_KEY: 'test-fixture-key' } },
    fetch: async (url, init) => {
      requests.push({ url, method: init.method });
      return new Response(JSON.stringify(init.method === 'GET' ? responseProduct : { session_id: 'session', checkout_url: 'https://checkout.example' }), { status: apiStatus });
    },
  });
  return { api, requests };
}

test('₹499 is exactly 49,900 paise; a five-cent USD product is rejected', () => {
  assert.equal(pricing.validateDodoProductPrice(expected, product()), null);
  assert.match(pricing.validateDodoProductPrice(expected, product({ currency: 'USD', price: 5 })), /Currency mismatch/);
  assert.match(pricing.validateDodoProductPrice(expected, product({ price: 499 })), /Price mismatch/);
  assert.match(pricing.formatProviderAmount(5, 'USD'), /0\.05/);
});
test('monthly plans cannot use yearly, weekly, or multi-month billing products', () => {
  for (const interval of ['Year', 'Week', 'Day']) assert.match(pricing.validateDodoProductPrice(expected, product({ payment_frequency_interval: interval })), /frequency/);
  assert.match(pricing.validateDodoProductPrice(expected, product({ payment_frequency_count: 12 })), /frequency/);
});
test('inactive, one-time, wrong-product, regional, and paid-trial products are rejected', () => {
  assert.match(pricing.validateDodoProductPrice({ ...expected, is_active: false }, product()), /inactive/);
  assert.match(pricing.validateDodoProductPrice(expected, { ...product(), is_recurring: false }), /recurring/);
  assert.match(pricing.validateDodoProductPrice(expected, { ...product(), product_id: 'different' }), /does not match/);
  assert.match(pricing.validateDodoProductPrice(expected, product({ purchasing_power_parity: true })), /regional/);
  assert.match(pricing.validateDodoProductPrice(expected, product({ trial_amount: 100 })), /paid trial/);
});
test('discounts use basis points and expired app discounts do not stay active', () => {
  const discounted = { ...expected, discounted_price_paise: 44910, discount_enabled: true };
  assert.equal(pricing.validateDodoProductPrice(discounted, product({ discount_bps: 1000 })), null);
  assert.match(pricing.validateDodoProductPrice(expected, product({ discount_bps: 9900 })), /Price mismatch/);
  assert.equal(pricing.effectivePlanAmount({ ...discounted, discount_ends_at: '2020-01-01' }), 49900);
  assert.match(pricing.validateDodoProductPrice(expected, product({ discount_bps: 10001 })), /invalid/);
});
test('checkout does not POST or charge anything when provider pricing mismatches', async () => {
  const { api, requests } = client({ responseProduct: product({ currency: 'USD', price: 5 }) });
  await assert.rejects(api.createDodoCheckoutSession({ product_cart: [{ product_id: 'pdt_starter', quantity: 1 }] }, expected), /Currency mismatch/);
  assert.equal(requests.length, 1); assert.equal(requests[0].method, 'GET');
});
test('checkout does not POST if the provider is unavailable or the cart was altered', async () => {
  const unavailable = client({ apiStatus: 503 });
  await assert.rejects(unavailable.api.createDodoCheckoutSession({ product_cart: [{ product_id: 'pdt_starter', quantity: 1 }] }, expected));
  assert.equal(unavailable.requests.filter(request => request.method === 'POST').length, 0);
  const altered = client();
  await assert.rejects(altered.api.createDodoCheckoutSession({ product_cart: [{ product_id: 'pdt_other', quantity: 1 }] }, expected), /cart/);
  assert.equal(altered.requests.length, 0);
});
test('verified checkout performs a product GET before creating the session', async () => {
  const { api, requests } = client();
  const result = await api.createDodoCheckoutSession({ product_cart: [{ product_id: 'pdt_starter', quantity: 1 }] }, expected);
  assert.equal(result.session_id, 'session');
  assert.deepEqual(requests.map(request => request.method), ['GET', 'POST']);
});
test('production must explicitly select a valid test/live environment', async () => {
  for (const environment of ['', 'production', 'livemode']) {
    const { api, requests } = client({ environment });
    await assert.rejects(api.retrieveDodoProduct('pdt_starter'), /environment/);
    assert.equal(requests.length, 0);
  }
});
test('scheduled plan changes cannot bypass the price check', async () => {
  const { api, requests } = client({ responseProduct: product({ price: 499 }) });
  await assert.rejects(api.changeDodoSubscriptionPlan('sub_example', { product_id: 'pdt_starter', quantity: 1, effective_at: 'next_billing_date', proration_billing_mode: 'do_not_bill' }, expected), /Price mismatch/);
  assert.ok(requests.every(request => request.method === 'GET'));
});
test('recorded subscription mismatch is visible without automatically changing access', () => {
  const snapshot = { subscription_id: 'sub_example', product_id: 'pdt_starter', currency: 'USD', recurring_pre_tax_amount: 5, quantity: 1, payment_frequency_count: 1, payment_frequency_interval: 'Month' };
  assert.match(pricing.validateRecordedSubscription(expected, snapshot), /renewal currency/);
  assert.equal(pricing.validateRecordedSubscription(expected, { ...snapshot, currency: 'INR', recurring_pre_tax_amount: 49900 }), null);
  assert.match(pricing.validateRecordedSubscription(expected, { ...snapshot, currency: 'INR', recurring_pre_tax_amount: 499 }), /recurring amount/);
});

function correctionAction(currentOverrides = {}) {
  const shopId = 'd40a21b4-cc0d-4211-a96b-f50213de336b';
  const priceId = '6a665c5a-612a-4e70-9c78-56a95e6cb021';
  const providerCalls = [], mutations = [];
  const price = { ...expected, id: priceId, plan_id: 'plan-starter' };
  const subscription = { id: 'local-subscription', plan_id: price.plan_id, price_id: price.id, provider: 'dodo', provider_subscription_id: 'sub_example' };
  const current = { status: 'active', quantity: 1, cancel_at_next_billing_date: false, next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(), ...currentOverrides };
  const db = { from(table) {
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return this; }, insert(value) { mutations.push({ table, value }); return this; }, then(resolve, reject) { return Promise.resolve({ data: table === 'shop_subscriptions' ? subscription : table === 'saas_plan_prices' ? price : null, error: null }).then(resolve, reject); } }; return query;
  } };
  const api = load('src/app/admin/saas/actions.ts', {
    '@/lib/admin/auth': { requireSaasAdmin: async () => {} },
    '@/lib/dodo/client': { retrieveDodoSubscription: async () => current, changeDodoSubscriptionPlan: async (...args) => { providerCalls.push(args); return { scheduled: true }; } },
    '@/lib/dodo/price-validation': pricing,
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
    '@/lib/invoice-footer': { isValidInvoiceFooter: () => true, normalizeInvoiceFooter: value => value },
    'next/navigation': { redirect: location => { throw new Error(`redirect:${location}`); } },
    'next/cache': { revalidatePath() {} },
  }, { FormData });
  const form = new FormData(); form.set('shop_id', shopId); form.set('price_id', priceId);
  return { invoke: () => api.scheduleAdminPriceCorrectionAction(form), providerCalls, mutations };
}
test('admin price correction is scheduled for next renewal without immediate billing', async () => {
  const scenario = correctionAction();
  await assert.rejects(scenario.invoke(), /scheduled=1/);
  assert.equal(scenario.providerCalls.length, 1);
  const [id, payload, price] = scenario.providerCalls[0];
  assert.equal(id, 'sub_example');
  assert.equal(payload.effective_at, 'next_billing_date');
  assert.equal(payload.proration_billing_mode, 'do_not_bill');
  assert.equal(payload.on_payment_failure, 'prevent_change');
  assert.equal(payload.quantity, 1);
  assert.equal(price.regular_price_paise, 49900);
  assert.ok(scenario.mutations.every(mutation => mutation.table === 'subscription_events'));
});
test('price corrections cannot reactivate cancelled subscriptions or overwrite custom pricing', async () => {
  for (const overrides of [{ status: 'cancelled' }, { cancel_at_next_billing_date: true }, { quantity: 2 }, { discounts: [{ id: 'custom' }] }, { next_billing_date: '2020-01-01' }]) {
    const scenario = correctionAction(overrides);
    await assert.rejects(scenario.invoke(), /error=/);
    assert.equal(scenario.providerCalls.length, 0);
    assert.equal(scenario.mutations.length, 0);
  }
});
