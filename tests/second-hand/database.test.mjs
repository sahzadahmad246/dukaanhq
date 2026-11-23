import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.waitReady;
const owner = '11111111-1111-4111-8111-111111111111';
const staff = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const shop = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherShop = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sql = (file) => readFileSync(new URL(`../../db/${file}`, import.meta.url), 'utf8');
const phone = (overrides = {}) => ({ seller_name: 'Seller Test', seller_phone: '+91 9876543210',
  purchase_source: 'Walk-in customer', purchase_date: '2026-01-01', brand: 'Apple', model: 'iPhone 15',
  storage: '128 GB', color: 'Black', imei_1: '111111111111111', imei_2: '222222222222222',
  purchase_price: 20000, selling_price: 25000, ...overrides });
async function login(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}
async function createPhone(value = phone(), shopId = shop) {
  return (await db.query('select public.create_second_hand_phone($1, $2::jsonb) as id', [shopId, JSON.stringify(value)])).rows[0].id;
}
async function invoiceItems(productId) {
  const { rows: [unit] } = await db.query('select * from inventory_items where product_id = $1', [productId]);
  return [{ product_id: productId, variant_id: unit.variant_id, inventory_item_id: unit.id,
    quantity: 1, unit_price: 25000, tax_rate: 0, discount_amount: 0, line_total: 25000,
    identifier_snapshot: `IMEI 1: ${unit.imei_1}` }];
}
async function bill(items, shopId = shop) {
  const customer = { name: 'Buyer Test', mobile: '+91 9123456789', billing_address: 'Buyer address' };
  return (await db.query('select public.create_second_hand_invoice($1, $2::jsonb, $3::jsonb) as id',
    [shopId, JSON.stringify(customer), JSON.stringify(items)])).rows[0].id;
}

before(async () => {
  // Supabase-owned auth/storage objects are stubbed; application tables, RLS and RPCs below are real migrations.
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table shops(id uuid primary key, name text, address_line_1 text, city text, state text, postal_code text, phone text, gst_number text);
    create table shop_settings(shop_id uuid primary key references shops(id), invoice_prefix text default 'INV', invoice_footer text);
    create table shop_members(id uuid default gen_random_uuid(), shop_id uuid references shops(id), user_id uuid references auth.users(id), role text, status text default 'ACTIVE');
    create function public.set_current_timestamp_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
  `);
  for (const file of ['004_inventory.sql', '006_inventory_product_kinds_and_atomic_create.sql', '015_product_catalog_foundation.sql',
    '010_billing.sql', '018_invoice_number_counters.sql', '029_edit_delete_invoices.sql']) await db.exec(sql(file));
  await db.exec(`alter table products add column created_by uuid references auth.users(id);
    alter table invoices add column payment_details jsonb, add column customer_signature_url text, add column invoice_pdf_url text;`);
  await db.exec(sql('035_fix_invoice_function_ambiguity.sql'));
  await db.exec(sql('043_second_hand_phones.sql'));
  await db.exec(sql('044_second_hand_seller_phone_validation.sql'));
  await db.exec(sql('044_second_hand_seller_phone_validation.sql'));
  await db.exec(sql('045_invoice_history_pagination.sql'));
  await db.exec(sql('045_invoice_history_pagination.sql'));
  // A repeat migration must leave existing data / functions intact.
  await db.exec(sql('043_second_hand_phones.sql'));
  await db.exec(`grant usage on schema public, auth, storage to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;`);
  await db.query('insert into auth.users values ($1),($2),($3)', [owner, staff, other]);
  await db.query("insert into shops(id,name) values ($1,'Shop A'),($2,'Shop B')", [shop, otherShop]);
  await db.query("insert into shop_members(shop_id,user_id,role) values ($1,$2,'owner'),($1,$3,'staff'),($4,$5,'owner')", [shop, owner, staff, otherShop, other]);
  await login(owner);
});
after(async () => { await db.close(); });

let firstProduct;
test('owner adds exact IMEI stock and minimal seller details atomically', async () => {
  firstProduct = await createPhone();
  const { rows: [row] } = await db.query(`select p.is_second_hand, p.tracking_type, i.status, i.imei_1,
    s.seller_name, s.original_invoice_path from products p join inventory_items i on i.product_id=p.id
    join second_hand_purchases s on s.product_id=p.id where p.id=$1`, [firstProduct]);
  assert.equal(row.is_second_hand, true); assert.equal(row.tracking_type, 'SERIALIZED');
  assert.equal(row.status, 'IN_STOCK'); assert.equal(row.seller_name, 'Seller Test');
  assert.equal(row.original_invoice_path, null);
  assert.equal((await db.query('select count(*)::int as n from inventory_item_identifiers where inventory_item_id in (select id from inventory_items where product_id=$1)', [firstProduct])).rows[0].n, 2);
});
test('duplicate IMEIs across either slot roll back the entire purchase', async () => {
  const before = (await db.query('select count(*)::int as n from products')).rows[0].n;
  await assert.rejects(createPhone(phone({ imei_1: '222222222222222', imei_2: '' })), /duplicate key/);
  assert.equal((await db.query('select count(*)::int as n from products')).rows[0].n, before);
  assert.equal((await db.query('select count(*)::int as n from second_hand_purchases')).rows[0].n, 1);
});
test('staff and other owners cannot add stock or read this shop’s seller / invoice data', async () => {
  await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['second-hand-invoices', `${shop}/invoice.pdf`]);
  for (const id of [staff, other]) {
    await login(id);
    await assert.rejects(createPhone(phone({ imei_1: '333333333333333', imei_2: '' })), /Only the shop owner/);
    assert.equal((await db.query('select * from second_hand_purchases')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(bill([]), /Only the shop owner/);
  }
  await login(owner);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
});
test('invalid dates, prices and IMEIs are rejected before any stock is inserted', async () => {
  for (const overrides of [{ purchase_date: '2099-01-01' }, { purchase_price: -1 }, { imei_1: '123' }, { imei_1: '1234567890123456' }, { imei_2: '12345678901234a' }, { imei_2: '111111111111111' }, { seller_name: '' }]) {
    await assert.rejects(createPhone(phone(overrides)));
  }
});
test('direct purchase RPC rejects letters and wrong seller-phone lengths without creating partial stock', async () => {
  const count = async () => (await db.query('select count(*)::int as n from products')).rows[0].n;
  const before = await count();
  for (const seller_phone of ['+91 98765a43210', '+91 123456789', '+91 12345678901', '9876543210']) {
    await assert.rejects(createPhone(phone({ seller_phone, imei_1: '333333333333333', imei_2: '' })), /second_hand_seller_phone_format/);
    assert.equal(await count(), before);
  }
});
test('second-hand billing refuses mixed stock and records no partial bill', async () => {
  await db.exec('reset role');
  const newProduct = (await db.query(`insert into products(shop_id,name,slug,tracking_type) values ($1,'New phone','new-phone','QUANTITY_BASED') returning id`, [shop])).rows[0].id;
  await login(owner);
  const items = await invoiceItems(firstProduct);
  await assert.rejects(bill([...items, { product_id: newProduct }]), /Select second-hand stock/);
  assert.equal((await db.query('select count(*)::int as n from invoices')).rows[0].n, 0);
});
test('sale links a separate bill, marks the IMEI sold and prevents a second sale', async () => {
  const items = await invoiceItems(firstProduct);
  const id = await bill(items);
  const invoice = (await db.query('select * from invoices where id=$1', [id])).rows[0];
  assert.equal(invoice.is_second_hand, true); assert.equal(Number(invoice.grand_total), 25000);
  assert.equal(invoice.customer_name, 'Buyer Test'); assert.ok(!JSON.stringify(invoice).includes('Seller Test'));
  assert.equal((await db.query('select status from inventory_items where product_id=$1', [firstProduct])).rows[0].status, 'SOLD');
  await assert.rejects(bill(items), /not available/);
  assert.equal((await db.query('select count(*)::int as n from invoices')).rows[0].n, 1);
});
test('deleting a bill with restock restores the same phone and retains seller history', async () => {
  const id = (await db.query('select id from invoices where is_second_hand')).rows[0].id;
  await db.query('select public.delete_inventory_invoice($1,true)', [id]);
  assert.equal((await db.query('select status from inventory_items where product_id=$1', [firstProduct])).rows[0].status, 'IN_STOCK');
  assert.equal((await db.query('select count(*)::int as n from second_hand_purchases')).rows[0].n, 1);
  const replacement = await bill(await invoiceItems(firstProduct));
  assert.ok(replacement);
});

const historyShop = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function historyPage(options = {}) {
  return (await db.query(`select list_shop_invoice_history($1, $2, $3, $4, $5, $6, $7, $8) as page`, [
    historyShop, options.used ?? false, options.search ?? '', options.from ?? null,
    options.cursor?.date ?? null, options.cursor?.id ?? null, options.limit ?? 30, !options.cursor,
  ])).rows[0].page;
}
let allHistoryIds;
test('history loads every bill beyond the old cap in stable batches with full totals', async () => {
  await db.exec('reset role');
  await db.query("insert into shops(id,name) values ($1,'History shop')", [historyShop]);
  await db.query("insert into shop_members(shop_id,user_id,role) values ($1,$2,'owner'),($1,$3,'staff')", [historyShop, owner, staff]);
  await db.query(`insert into invoices(shop_id, invoice_number, invoice_date, customer_name, shop_name_snapshot, created_by, grand_total)
    select $1, 'PAGE-' || n, '2026-04-01T12:00:00Z'::timestamptz + (n / 4) * interval '1 hour',
      'Buyer ' || n, 'History shop', $2, 100 from generate_series(1,137) n`, [historyShop, owner]);
  await db.query(`insert into invoices(shop_id, invoice_number, invoice_date, customer_name, shop_name_snapshot, created_by, grand_total, is_second_hand)
    select $1, 'USED-' || n, '2026-04-01T12:00:00Z'::timestamptz, 'Used buyer', 'History shop', $2, 200, true
    from generate_series(1,35) n`, [historyShop, owner]);
  await db.query(`insert into invoice_items(shop_id, invoice_id, product_name_snapshot, identifier_snapshot)
    select shop_id, id, 'Oldest rare handset', 'IMEI 1: 123456789012345' from invoices where shop_id=$1 and invoice_number='PAGE-1'`, [historyShop]);
  await login(owner);
  const first = await historyPage();
  assert.equal(first.invoices.length, 30); assert.equal(first.summary.count, 137);
  assert.equal(first.summary.totalValue, 13700); assert.equal(first.summary.avgValue, 100);
  allHistoryIds = first.invoices.map((invoice) => invoice.id);
  let cursor = first.nextCursor;
  const sizes = [30];
  while (cursor) {
    const page = await historyPage({ cursor });
    assert.equal(page.summary, null); sizes.push(page.invoices.length);
    allHistoryIds.push(...page.invoices.map((invoice) => invoice.id)); cursor = page.nextCursor;
  }
  assert.deepEqual(sizes, [30,30,30,30,17]);
  assert.equal(new Set(allHistoryIds).size, 137);
  const expected = await db.query('select id from invoices where shop_id=$1 and not is_second_hand order by invoice_date desc,id desc', [historyShop]);
  assert.deepEqual(allHistoryIds, expected.rows.map((invoice) => invoice.id));
});
test('history search finds the oldest bill by product, IMEI and customer; filters include all matching bills', async () => {
  for (const search of ['oldest RARE handset', '123456789012345']) {
    const page = await historyPage({ search });
    assert.ok(page.invoices.some((invoice) => invoice.invoice_number === 'PAGE-1'));
  }
  const customer = await historyPage({ search: 'Buyer 137' });
  assert.equal(customer.invoices[0].invoice_number, 'PAGE-137');
  let matching = await historyPage({ search: 'PAGE-1' });
  const numbers = matching.invoices.map((invoice) => invoice.invoice_number);
  while (matching.nextCursor) {
    matching = await historyPage({ search: 'PAGE-1', cursor: matching.nextCursor });
    numbers.push(...matching.invoices.map((invoice) => invoice.invoice_number));
  }
  assert.ok(numbers.includes('PAGE-1')); assert.equal(numbers.length, 49);
  const itemSearch = await historyPage({ search: 'oldest rare handset' });
  assert.equal(itemSearch.summary.count, 1); assert.equal(itemSearch.nextCursor, null);
  const used = await historyPage({ used: true });
  assert.equal(used.summary.count, 35); assert.equal(used.summary.totalValue, 7000);
  assert.ok(used.invoices.every((invoice) => invoice.is_second_hand));
  const lastUsed = await historyPage({ used: true, cursor: used.nextCursor });
  assert.equal(lastUsed.invoices.length, 5); assert.equal(lastUsed.nextCursor, null);
  const dates = await historyPage({ from: '2026-04-02T00:00:00Z' });
  assert.equal(dates.summary.count, 90);
  assert.equal((await historyPage({ search: '%_,()' })).summary.count, 0);
  const empty = await historyPage({ search: 'does not exist' });
  assert.equal(empty.invoices.length, 0); assert.equal(empty.nextCursor, null); assert.equal(empty.summary.count, 0);
});
test('history enforces tenant and used-bill access and rejects incomplete cursors', async () => {
  await login(other);
  await assert.rejects(historyPage(), /Not allowed/);
  await login(staff);
  assert.equal((await historyPage()).summary.count, 137);
  await assert.rejects(historyPage({ used: true }), /Not allowed/);
  await login(owner);
  await assert.rejects(historyPage({ cursor: { date: '2026-04-01T12:00:00Z' } }), /Invalid bill history cursor/);
});
test('adding or deleting a newer bill does not shift the next history batch', async () => {
  const first = await historyPage();
  await db.query('delete from invoices where id=$1', [first.invoices[0].id]);
  await db.query(`insert into invoices(shop_id, invoice_number, invoice_date, customer_name, shop_name_snapshot, created_by)
    values ($1,'NEWEST','2027-01-01T12:00:00Z','Newest buyer','History shop',$2)`, [historyShop, owner]);
  const next = await historyPage({ cursor: first.nextCursor });
  assert.deepEqual(next.invoices.map((invoice) => invoice.id), allHistoryIds.slice(30,60));
});
