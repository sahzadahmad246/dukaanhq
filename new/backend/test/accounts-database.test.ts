import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AccountsService } from '../src/accounts/accounts.service';
import { DatabaseService } from '../src/database/database.service';
import {
  UserTransaction,
  withUserTransaction,
} from '../src/database/user-transaction';
import { VerifiedIdentity } from '../src/auth/auth.types';
import { identityA, identityB, userA, userB } from './fixtures/identities';

let database: PGlite;
let accounts: AccountsService;
let queue = Promise.resolve();
const statements: string[] = [];
const client = {
  query: async (text: string, values?: unknown[]) => {
    statements.push(text);
    return database.query(text, values);
  },
};
async function asUser<T>(
  identity: VerifiedIdentity,
  operation: (transaction: UserTransaction) => Promise<T>,
) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await withUserTransaction(client, identity, operation);
  } finally {
    release();
  }
}
before(async () => {
  database = new PGlite();
  await database.exec(`create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated;
    insert into auth.users values ('${userA}'),('${userB}');`);
  // Actual existing profile DDL and the actual compatibility migration. pgcrypto
  // is unnecessary for these columns; it is not bundled by this PGlite fixture.
  const profiles = await readFile('../../web/db/001_profiles.sql', 'utf8');
  await database.exec(
    profiles.replace('create extension if not exists "pgcrypto";', ''),
  );
  await database.exec(
    await readFile('../../web/db/046_mobile_phone_auth.sql', 'utf8'),
  );
  // Minimal supporting read model with RLS, not a replacement legacy schema.
  await database.exec(`
    create table shops(id uuid primary key,slug text,status text);
    create table shop_members(id uuid primary key,shop_id uuid,user_id uuid,role text,status text,created_at timestamptz default now());
    create table shop_settings(shop_id uuid primary key,onboarding_completed boolean);
    create table shop_entitlements(shop_id uuid primary key,billing_status text,trial_ends_at timestamptz,subscription_valid_until timestamptz,grace_ends_at timestamptz);
    create table saas_platform_settings(id int primary key,trial_enabled boolean);
    create table subscription_intents(id uuid primary key,owner_user_id uuid,created_shop_id uuid,status text,expires_at timestamptz,trial_ends_at timestamptz,current_period_end timestamptz,created_at timestamptz default now());
    insert into saas_platform_settings values(1,true);
    insert into profiles(id,email,full_name,role) values('${userA}','owner@example.test','Existing Owner','owner');
    grant select,insert,update on profiles to authenticated;
    grant select on shops,shop_members,shop_settings,shop_entitlements,saas_platform_settings,subscription_intents to authenticated;
    alter table shop_members enable row level security;
    create policy own_membership on shop_members for select to authenticated using(user_id=auth.uid());
    alter table subscription_intents enable row level security;
    create policy own_approval on subscription_intents for select to authenticated using(owner_user_id=auth.uid());
  `);
  for (const table of ['shops', 'shop_settings', 'shop_entitlements']) {
    const column = table === 'shops' ? 'id' : 'shop_id';
    await database.exec(`alter table ${table} enable row level security;
      create policy own_shop on ${table} for select to authenticated using(exists(select 1 from shop_members m where m.shop_id=${table}.${column} and m.user_id=auth.uid()));`);
  }
  const module = await Test.createTestingModule({
    providers: [
      AccountsService,
      { provide: DatabaseService, useValue: { asUser } },
    ],
  }).compile();
  accounts = module.get(AccountsService);
});
after(async () => {
  await database?.close();
});

test('existing profile bootstrap uses one bounded SELECT without rewriting name/email/role', async () => {
  statements.length = 0;
  const response = await accounts.bootstrap(identityA);
  assert.equal(response.account.email, 'owner@example.test');
  assert.equal(response.account.full_name, 'Existing Owner');
  assert.equal(response.account.role, 'owner');
  assert.equal(statements.length, 5); // BEGIN, role, claims, projection, COMMIT.
  assert.equal(
    statements.some((statement) => /^insert|^update/i.test(statement)),
    false,
  );
});
test('phone-only profile is created once with NULL email and customer role', async () => {
  const response = await accounts.bootstrap(identityB);
  assert.equal(response.account.id, userB);
  assert.equal(response.account.email, null);
  assert.equal(response.account.role, 'customer');
  assert.equal(response.next_action, 'complete_profile');
  const updated = await accounts.bootstrap(identityB, {
    full_name: 'New Owner',
    intent: 'owner',
  });
  assert.equal(updated.account.role, 'customer');
  assert.equal(updated.next_action, 'select_plan');
});
test('pooled session reuse isolates concurrent user reads and clears claims after commit', async () => {
  const responses = await Promise.all(
    [identityA, identityB, identityA, identityB].map((identity) =>
      accounts.bootstrap(identity),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.account.id),
    [userA, userB, userA, userB],
  );
  const state = await database.query<{ role: string; subject: string }>(
    `select current_user as role,current_setting('request.jwt.claim.sub',true) as subject`,
  );
  assert.notEqual(state.rows[0]?.role, 'authenticated');
  assert.ok(!state.rows[0]?.subject);
  const other = await asUser(identityA, (transaction) =>
    transaction.query(sql`select id from profiles where id=${userB}::uuid`),
  );
  assert.deepEqual(other, []);
});
test('rollback restores data and clears identity before the connection is reused', async () => {
  await assert.rejects(
    asUser(identityB, async (transaction) => {
      await transaction.query(
        sql`update profiles set full_name='Should roll back' where id=${userB}::uuid`,
      );
      throw new Error('test rollback');
    }),
  );
  assert.equal(
    (await accounts.bootstrap(identityB)).account.full_name,
    'New Owner',
  );
  assert.equal(
    (await accounts.bootstrap(identityA)).account.full_name,
    'Existing Owner',
  );
});
test('compatibility migration blocks direct self-promotion while allowing trusted provisioning', async () => {
  await assert.rejects(
    asUser(identityB, (transaction) =>
      transaction.query(
        sql`update profiles set role='superadmin' where id=${userB}::uuid`,
      ),
    ),
    /trusted provisioning/,
  );
  assert.equal((await accounts.bootstrap(identityB)).account.role, 'customer');
  await database.query(`update profiles set role='superadmin' where id=$1`, [
    userA,
  ]);
  assert.equal(
    (await accounts.bootstrap(identityA)).next_action,
    'platform_admin',
  );
  await database.query(`update profiles set role='owner' where id=$1`, [userA]);
});
test('approval projection ignores another user’s approval and expired approvals', async () => {
  await database.query(
    `insert into subscription_intents(id,owner_user_id,status,expires_at,current_period_end) values('88888888-8888-4888-8888-888888888888',$1,'payment_approved',now()+interval '1 hour',now()+interval '1 month')`,
    [userA],
  );
  assert.equal(
    (await accounts.bootstrap(identityA)).next_action,
    'shop_onboarding',
  );
  assert.equal(
    (await accounts.bootstrap(identityB)).next_action,
    'select_plan',
  );
  await database.exec(
    `update subscription_intents set expires_at=now()-interval '1 second'`,
  );
  assert.equal(
    (await accounts.bootstrap(identityA)).next_action,
    'select_plan',
  );
});
test('two phone-only users may have NULL emails while real emails stay unique', async () => {
  const another = '99999999-9999-4999-8999-999999999999';
  await database.query('insert into auth.users values($1)', [another]);
  assert.equal(
    (await accounts.bootstrap({ ...identityB, userId: another })).account.email,
    null,
  );
  await assert.rejects(
    database.query('update profiles set email=$1 where id=$2', [
      'owner@example.test',
      another,
    ]),
    /unique/,
  );
});
