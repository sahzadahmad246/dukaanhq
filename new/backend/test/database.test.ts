import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { READINESS_SQL } from '../src/database/database.service';

let database: PGlite;
before(async () => {
  database = new PGlite();
  // Minimal metadata fixture: intentionally not a replacement migration/schema.
  await database.exec(`
    create role authenticated;
    create role api_login login;
    grant authenticated to api_login;
    create table profiles(id uuid,email text,role text default 'customer');
    create table shops(id uuid);
    create table shop_members(id uuid);
    create table shop_settings(id uuid);
    create table shop_entitlements(id uuid);
    create table subscription_intents(id uuid);
    create table saas_platform_settings(id integer);
    create table second_hand_purchases(id uuid);
    create table products(id uuid, is_second_hand boolean);
    create function list_shop_invoice_history(uuid,boolean,text,timestamptz,timestamptz,uuid,integer,boolean)
      returns jsonb language sql as $$select '{}'::jsonb$$;
    grant usage on schema public to api_login;
    grant select on profiles, shops, shop_members, second_hand_purchases, products to api_login;
  `);
  await database.exec(
    await readFile('../../web/db/046_mobile_phone_auth.sql', 'utf8'),
  );
});
after(async () => {
  await database?.close();
});

test('readiness accepts the existing 045 signature with a limited application role', async () => {
  await database.exec('set role api_login');
  try {
    const result = await database.query<{
      compatible: boolean;
      safe_role: boolean;
    }>(READINESS_SQL);
    assert.deepEqual(result.rows, [{ compatible: true, safe_role: true }]);
  } finally {
    await database.exec('reset role');
  }
});
test('readiness rejects an administrative database connection', async () => {
  const result = await database.query<{ safe_role: boolean }>(READINESS_SQL);
  assert.equal(result.rows[0]?.safe_role, false);
});
test('readiness detects schema drift without writing migrations', async () => {
  await database.exec('alter table products drop column is_second_hand');
  const result = await database.query<{ compatible: boolean }>(READINESS_SQL);
  assert.equal(result.rows[0]?.compatible, false);
});
