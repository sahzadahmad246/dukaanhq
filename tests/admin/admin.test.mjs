import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Transpiled server modules use CommonJS; resolve their package imports here.
const requirePackage = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load(file, mocks = {}) {
  const filename = path.resolve(root, file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'server-only') return {};
    return requirePackage(name);
  }, console, Date, FormData, URLSearchParams, setTimeout }, { filename });
  return exports;
}
const format = load('src/lib/admin/format.ts');
const sales = load('src/lib/admin/sales.ts');
const shopId = 'd40a21b4-cc0d-4211-a96b-f50213de336b';
const memberId = '6a665c5a-612a-4e70-9c78-56a95e6cb021';
function form(values) { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; }
function redirect(location) { throw new Error(`redirect:${location}`); }
function actionModule({ blocked = false, existing = null } = {}) {
  const calls = [];
  const client = { from(table) {
    const query = {
      update(value) { calls.push({ table, operation: 'update', value }); return this; },
      upsert(value) { calls.push({ table, operation: 'upsert', value }); return this; },
      select() { return this; },
      eq(key, value) { calls.push({ table, filter: key, value }); return this; },
      maybeSingle() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: existing ?? (table === 'shops' || table === 'shop_members' ? { id: shopId } : null), error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const actions = load('src/app/admin/saas/actions.ts', {
    '@/lib/admin/auth': { requireSaasAdmin: async () => { if (blocked) throw new Error('forbidden'); } },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => { calls.push({ elevated: true }); return client; } },
    'next/navigation': { redirect }, 'next/cache': { revalidatePath() {} },
    '@/lib/invoice-footer': { isValidInvoiceFooter: () => true, normalizeInvoiceFooter: value => value },
  });
  return { actions, calls };
}

test('reports exclude cancellations and distinguish paid bills from pending bills', () => {
  const rows = [
    { id: '1', shop_id: shopId, grand_total: '120.50', payment_status: 'PAID', invoice_date: '2026-10-15T20:00:00Z' },
    { id: '2', shop_id: shopId, grand_total: 80, payment_status: 'PARTIAL', invoice_date: '2026-10-16T02:00:00Z' },
    { id: '3', shop_id: shopId, grand_total: 500, payment_status: 'CANCELLED', invoice_date: '2026-10-16T02:00:00Z' },
  ];
  const result = sales.summarizeSales(rows);
  assert.equal(result.total, 200.5); assert.equal(result.paid, 120.5); assert.equal(result.pending, 1); assert.equal(result.cancelled, 1);
  assert.equal(result.average, 100.25);
  const daily = sales.salesByDay(rows);
  assert.equal(daily.length, 1); assert.equal(daily[0][0], '2026-10-16'); assert.equal(daily[0][1], 200.5);
  assert.equal(sales.summarizeSales([]).average, 0);
});

test('report periods use India calendar days, including month boundaries', () => {
  assert.equal(format.reportStart(7, new Date('2026-11-01T00:00:00Z')), '2026-10-25T18:30:00.000Z');
  assert.equal(format.reportDays('all'), 30);
  assert.equal(format.pageNumber('-2'), 1); assert.equal(format.pageNumber('2.5'), 1);
  assert.equal(format.searchText('shop,(status.eq.active)'), 'shop status.eq.active');
});

test('every management action authenticates before creating an elevated client', async () => {
  const { actions, calls } = actionModule({ blocked: true });
  for (const name of ['setShopStatusAction', 'superadminExtendSubscriptionAction', 'superadminLockSubscriptionAction', 'superadminUnlockSubscriptionAction', 'superadminUpdateShopInfoAction', 'setAdminStaffStatusAction', 'setAdminShopPlanAction', 'updateSaasSettingsAction', 'updateSaasPlanAction']) {
    await assert.rejects(actions[name](form({ shop_id: shopId })), /forbidden/);
  }
  assert.equal(calls.length, 0);
});

test('shop restore preserves each staff member status', async () => {
  const { actions, calls } = actionModule();
  await assert.rejects(actions.setShopStatusAction(form({ shop_id: shopId, status: 'active' })), /saved=1/);
  assert.equal(calls.filter(call => call.operation).length, 1);
  assert.equal(calls.find(call => call.operation).table, 'shops');
  assert.ok(!calls.some(call => call.table === 'shop_members'));
});

test('extending access adds days to existing unexpired access', async () => {
  const future = new Date(Date.now() + 90 * 86400000).toISOString();
  const { actions, calls } = actionModule({ existing: { subscription_valid_until: future, trial_ends_at: null } });
  await assert.rejects(actions.superadminExtendSubscriptionAction(form({ shop_id: shopId, days: '30' })), /saved=1/);
  const mutation = calls.find(call => call.operation === 'upsert');
  assert.equal(new Date(mutation.value.subscription_valid_until).getTime(), new Date(future).getTime() + 30 * 86400000);
  assert.equal(mutation.value.access_expires_at, mutation.value.subscription_valid_until);
});

test('invalid access extensions do not mutate the database', async () => {
  const { actions, calls } = actionModule();
  for (const days of ['-1', '0', 'abc', '3651', '2.5']) {
    await assert.rejects(actions.superadminExtendSubscriptionAction(form({ shop_id: shopId, days })), /error=/);
  }
  assert.ok(!calls.some(call => call.operation));
});

test('expired subscription access must be extended before unlocking', async () => {
  const { actions, calls } = actionModule({ existing: { subscription_valid_until: '2020-01-01T00:00:00Z', trial_ends_at: null, access_expires_at: null } });
  await assert.rejects(actions.superadminUnlockSubscriptionAction(form({ shop_id: shopId })), /Access%20has%20expired/);
  assert.ok(!calls.some(call => call.operation));
});

test('staff status updates are scoped to the shop and staff role', async () => {
  const { actions, calls } = actionModule();
  await assert.rejects(actions.setAdminStaffStatusAction(form({ shop_id: shopId, member_id: memberId, status: 'SUSPENDED' })), /saved=1/);
  assert.ok(calls.some(call => call.filter === 'shop_id' && call.value === shopId));
  assert.ok(calls.some(call => call.filter === 'role' && call.value === 'staff'));
});

test('server role guard denies ordinary users before returning an admin client', async () => {
  let elevated = false;
  const auth = load('src/lib/admin/auth.ts', {
    react: { cache: fn => fn }, 'next/navigation': { redirect },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: memberId } }, error: null }) },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'owner' }, error: null }) }),
    }) },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => { elevated = true; return {}; } },
  });
  await assert.rejects(auth.getAdminReadClient(), /redirect:\//);
  assert.equal(elevated, false);
});

test('sales reports read beyond the first database page', async () => {
  const offsets = [];
  const row = { id: 'invoice', shop_id: shopId, invoice_date: new Date().toISOString(), grand_total: 10, payment_status: 'PAID' };
  const db = { from() {
    let offset;
    return { select() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; }, eq() { return this; }, range(start) { offset = start; offsets.push(start); return this; }, then(resolve, reject) { return Promise.resolve({ data: Array.from({ length: offset === 0 ? 1000 : 2 }, () => row), error: null }).then(resolve, reject); } };
  } };
  const data = load('src/lib/admin/data.ts', { './auth': { getAdminReadClient: async () => db }, './format': format });
  const result = await data.loadSales(30, shopId);
  assert.equal(result.length, 1002); assert.deepEqual(offsets, [0, 1000]);
});

test('an expired trial cannot be unlocked into unlimited paid access', async () => {
  const { actions, calls } = actionModule({ existing: { subscription_valid_until: null, trial_ends_at: '2020-01-01T00:00:00Z', access_expires_at: null } });
  await assert.rejects(actions.superadminUnlockSubscriptionAction(form({ shop_id: shopId })), /Access%20has%20expired/);
  assert.ok(!calls.some(call => call.operation));
});

test('legacy suspended owners can recover while suspended staff remain unchanged', async () => {
  const { actions, calls } = actionModule({ existing: { id: shopId, status: 'suspended' } });
  await assert.rejects(actions.setShopStatusAction(form({ shop_id: shopId, status: 'active' })), /saved=1/);
  assert.ok(calls.some(call => call.table === 'shop_members' && call.filter === 'role' && call.value === 'owner'));
  assert.ok(!calls.some(call => call.table === 'shop_members' && call.value === 'staff'));
});

test('extensions respect fallback access expiry and do not change provider cancellation', async () => {
  const expiry = new Date(Date.now() + 100 * 86400000).toISOString();
  const { actions, calls } = actionModule({ existing: { subscription_valid_until: null, trial_ends_at: null, access_expires_at: expiry } });
  await assert.rejects(actions.superadminExtendSubscriptionAction(form({ shop_id: shopId, days: '7' })), /saved=1/);
  const mutation = calls.find(call => call.operation === 'upsert');
  assert.equal(new Date(mutation.value.subscription_valid_until).getTime(), new Date(expiry).getTime() + 7 * 86400000);
  assert.equal(Object.hasOwn(mutation.value, 'cancel_at_period_end'), false);
});
