import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { File } from 'node:buffer';
import ts from 'typescript';

const requirePackage = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, { exports, require: name => Object.hasOwn(mocks, name) ? mocks[name] : requirePackage(name),
    console, Date, Error, Intl, FormData, File, crypto }, { filename: file });
  return exports;
}
const phoneHelpers = load('src/lib/phone.ts');
const types = load('src/lib/types/second-hand.ts', { '@/lib/phone': phoneHelpers });
const barcodeValues = load('src/lib/barcode-values.ts');
const presets = load('src/lib/inventory-presets.ts');
const storagePresets = load('src/lib/inventory-labels.ts');
const billingTypes = load('src/lib/types/billing.ts');
const scope = load('src/lib/billing/inventory-scope.ts');
const condition = load('src/lib/billing/invoice-condition.ts');
const history = load('src/lib/billing/invoice-history.ts');
const minimalPhone = { seller_name: 'Seller', seller_country_code: '+91', seller_phone: '9876543210', purchase_source: 'Walk-in',
  purchase_date: '2026-01-01', brand: 'Apple', model: 'iPhone 15', storage: '128 GB', color: 'Black',
  imei_1: '123456789012345', purchase_price: '12000', selling_price: '15000' };
const shopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const productId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invoicePayload = { customer: { name: 'Buyer', mobile: '+91 9876543210', billing_address: 'Street' },
  items: [{ product_id: productId, product_name_snapshot: 'iPhone 15', quantity: 1, unit_price: 15000, line_total: 15000 }],
  payment_details: { methods: ['CASH'] } };

test('minimal form needs no extra seller fields or original invoice', () => {
  const parsed = types.SecondHandPhoneSchema.parse(minimalPhone);
  assert.equal(parsed.imei_2, ''); assert.equal(parsed.purchase_price, 12000);
  for (const field of ['seller_name', 'seller_phone', 'purchase_source', 'model', 'color', 'storage']) {
    assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, [field]: '' }).success, false);
  }
  assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, imei_2: minimalPhone.imei_1 }).success, false);
  assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, selling_price: -1 }).success, false);
});
test('seller phone requires ten digits and one of the available country codes', () => {
  for (const seller_phone of ['123456789', '12345678901', '98765a43210', '+91 9876543210', '98765 43210']) {
    assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, seller_phone }).success, false, seller_phone);
  }
  for (const seller_country_code of ['', '+999', 'India']) {
    assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, seller_country_code }).success, false);
  }
  for (const { code } of phoneHelpers.COUNTRY_CODES) {
    assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, seller_country_code: code }).success, true);
  }
});
test('typing and pasting into phone and IMEI controls strips letters and caps their lengths', () => {
  assert.equal(phoneHelpers.sanitizeDigits('abc98765 43210xyz999', 10), '9876543210');
  assert.equal(phoneHelpers.sanitizeDigits('12345abc67890-123456', 15), '123456789012345');
  assert.equal(phoneHelpers.sanitizeDigits('letters', 15), '');
});
test('IMEI scans accept exactly fifteen digits and never truncate sixteen-digit codes', () => {
  for (const value of ['123456789012345', 'IMEI 1: 123456789012345', 'IMEI2: 123456789012345']) {
    assert.equal(barcodeValues.normalizeScannedValue(value, 'IMEI'), '123456789012345');
  }
  for (const value of ['12345678901234', '1234567890123456', 'IMEI: 1234567890123456', 'IMEISV: 1234567890123456', 'ABC123456789012345', 'SN: ABC123', '12345678901234x']) {
    assert.equal(barcodeValues.normalizeScannedValue(value, 'IMEI'), '', value);
  }
  assert.equal(barcodeValues.normalizeScannedValue('SN: ABC123', 'SERIAL'), 'ABC123');
});
test('server validation rejects short, long or alphabetic IMEIs, including optional IMEI 2', () => {
  for (const field of ['imei_1', 'imei_2']) {
    for (const value of ['12345678901234', '1234567890123456', '12345678901234a']) {
      assert.equal(types.SecondHandPhoneSchema.safeParse({ ...minimalPhone, [field]: value }).success, false);
    }
  }
});
test('brand choices include inventory presets and custom brands without duplicate names', () => {
  const options = presets.mergePresetOptions(presets.PRESET_BRAND_NAMES, [' samsung ', 'My custom brand']);
  assert.equal(options.filter((name) => name.toLowerCase() === 'samsung').length, 1);
  for (const name of ['Apple', 'Google', 'OnePlus', 'My custom brand']) assert.ok(options.includes(name));
  const apple = storagePresets.getStoragePresetOptions({ productKind: 'MOBILE', brandName: 'Apple' });
  const android = storagePresets.getStoragePresetOptions({ productKind: 'MOBILE', brandName: 'Samsung' });
  assert.ok(apple.includes('128GB')); assert.ok(android.includes('8GB / 128GB'));
  assert.ok(apple.includes('Add manually')); assert.ok(android.includes('Add manually'));
});
test('existing bill payloads continue to use regular inventory by default', () => {
  assert.equal(billingTypes.CreateInvoicePayloadSchema.parse(invoicePayload).is_second_hand, false);
});
test('used billing offers only available used stock, while editing can retain a sold phone', () => {
  const products = [{ id: 'new', total_quantity: 1, is_second_hand: false },
    { id: 'used', total_quantity: 1, is_second_hand: true },
    { id: 'sold-used', total_quantity: 0, is_second_hand: true }];
  assert.deepEqual(Array.from(condition.filterBillingProducts(products, true), (item) => item.id), ['used']);
  assert.deepEqual(Array.from(condition.filterBillingProducts(products, true, true), (item) => item.id), ['used', 'sold-used']);
  assert.deepEqual(Array.from(condition.filterBillingProducts(products, false), (item) => item.id), ['new']);
  assert.equal(condition.invoiceItemConditionLabel({ is_second_hand: true }, { product_id: 'used' }), 'Used phone');
  assert.equal(condition.invoiceItemConditionLabel({ is_second_hand: true }, { product_id: null }), null);
  assert.equal(condition.invoiceItemConditionLabel({}, { product_id: 'new' }), null);
});
test('bill date filters use Indian calendar boundaries and merging pages removes repeated IDs', () => {
  const now = new Date('2026-11-22T20:00:00Z'); // Monday in India, Sunday in UTC.
  assert.equal(history.invoiceHistoryStartDate('today', now), '2026-11-22T18:30:00.000Z');
  assert.equal(history.invoiceHistoryStartDate('week', now), '2026-11-22T18:30:00.000Z');
  assert.equal(history.invoiceHistoryStartDate('month', now), '2026-10-31T18:30:00.000Z');
  assert.equal(history.invoiceHistoryStartDate('all', now), null);
  const pages = [{ invoices: [{ id: 'a' }, { id: 'b' }] }, { invoices: [{ id: 'b' }, { id: 'c' }] }];
  assert.deepEqual(Array.from(history.mergeInvoiceHistoryPages(pages), (item) => item.id), ['a', 'b', 'c']);
});
test('history server action checks the active shop before querying bills', async () => {
  let reads = 0;
  const actions = load('src/app/billing/history-actions.ts', {
    '@/lib/billing/invoice-history': { ...history, readInvoiceHistoryPage: async () => { reads++; return history.EMPTY_INVOICE_HISTORY; } },
    '@/lib/workspace/get-workspace-data': { getWorkspaceData: async () => ({ shop: { id: shopId } }) },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({}) },
  });
  await assert.rejects(actions.loadMoreInvoicesAction({ shopId: productId }), /not available for this shop/);
  assert.equal(reads, 0);
  await actions.loadMoreInvoicesAction({ shopId }); assert.equal(reads, 1);
  await assert.rejects(actions.loadMoreInvoicesAction({ shopId, cursor: { date: 'invalid', id: productId } }));
  assert.equal(reads, 1);
});
test('invoice stock validation rejects mixed catalogues and products belonging to another shop', async () => {
  const queried = [];
  const client = (data) => ({ from() { return { select() { return this; }, eq(key, value) { queried.push([key, value]); return this; },
    in() { return Promise.resolve({ data, error: null }); } }; } });
  const used = billingTypes.CreateInvoicePayloadSchema.parse({ ...invoicePayload, is_second_hand: true });
  assert.equal(await scope.validateInvoiceInventoryScope(client([{ id: productId, is_second_hand: true }]), shopId, used), null);
  assert.match(await scope.validateInvoiceInventoryScope(client([{ id: productId, is_second_hand: false }]), shopId, used), /separate bills/);
  assert.match(await scope.validateInvoiceInventoryScope(client([]), shopId, used), /not be found/);
  assert.ok(queried.every(([key, value]) => key === 'shop_id' && value === shopId));
  const quick = { ...used, items: [{ ...used.items[0], product_id: null }] };
  assert.match(await scope.validateInvoiceInventoryScope(client([]), shopId, quick), /Add a second-hand phone/);
});

function purchaseAction({ rpcError = null, uploadError = null } = {}) {
  const events = [];
  const storage = { async upload(path) { events.push(['upload', path]); return { error: uploadError }; },
    async remove(paths) { events.push(['remove', ...paths]); return { error: null }; } };
  const db = { storage: { from: () => storage }, async rpc(name, payload) {
    events.push(['rpc', name, payload]); return { data: rpcError ? null : productId, error: rpcError };
  } };
  const actions = load('src/app/second-hand/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => db },
    '@/lib/workspace/get-workspace-data': { getWorkspaceData: async options => {
      assert.equal(options.requireOwner, true); return { shop: { id: shopId, slug: 'test-shop' } };
    } },
    '@/lib/subscription/plan-limits': { checkPlanLimit: async () => ({ ok: true }) },
    '@/lib/types/second-hand': types,
    '@/lib/shop-routes': { buildShopRoute: (slug, route) => `/${slug}/${route}` },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(minimalPhone)) form.set(key, String(value));
  return { events, form, invoke: () => actions.addSecondHandPhoneAction(form) };
}
test('adding stock without an invoice uploads nothing and saves the minimal seller record', async () => {
  const scenario = purchaseAction();
  assert.equal((await scenario.invoke()).status, 'success');
  assert.equal(scenario.events.length, 1);
  assert.equal(scenario.events[0][1], 'create_second_hand_phone');
  assert.equal(scenario.events[0][2].p_phone.seller_name, 'Seller');
  assert.equal(scenario.events[0][2].p_phone.seller_phone, '+91 9876543210');
  assert.equal(scenario.events[0][2].p_phone.original_invoice_path, null);
});
test('invalid seller phone cannot reach uploads or the purchase RPC', async () => {
  const scenario = purchaseAction();
  scenario.form.set('seller_phone', 'abc9876543210');
  assert.equal((await scenario.invoke()).status, 'error');
  assert.equal(scenario.events.length, 0);
});
test('failed stock creation removes the uploaded original invoice', async () => {
  const scenario = purchaseAction({ rpcError: { code: '23505' } });
  scenario.form.set('original_invoice', new File(['%PDF-1.7'], 'original.pdf', { type: 'application/pdf' }));
  const result = await scenario.invoke();
  assert.equal(result.status, 'error'); assert.match(result.message, /IMEI is already/);
  assert.deepEqual(scenario.events.map(([kind]) => kind), ['upload', 'rpc', 'remove']);
  assert.equal(scenario.events[0][1], scenario.events[2][1]);
  assert.ok(scenario.events[0][1].startsWith(`${shopId}/`));
});
test('unsupported or failed invoice uploads never create stock', async () => {
  const invalid = purchaseAction();
  invalid.form.set('original_invoice', new File(['bad'], 'original.html', { type: 'text/html' }));
  assert.equal((await invalid.invoke()).status, 'error'); assert.equal(invalid.events.length, 0);
  const failed = purchaseAction({ uploadError: { message: 'Storage unavailable' } });
  failed.form.set('original_invoice', new File(['%PDF-1.7'], 'original.pdf', { type: 'application/pdf' }));
  assert.equal((await failed.invoke()).status, 'error');
  assert.deepEqual(failed.events.map(([kind]) => kind), ['upload']);
});
