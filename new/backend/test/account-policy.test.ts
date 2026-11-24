import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountBootstrap,
  AccountRow,
  Membership,
} from '../src/accounts/account-policy';
import { userA, userB, identityA as identity } from './fixtures/identities';
const now = Date.parse('2026-11-23T00:00:00Z');
const future = '2026-12-23T00:00:00Z';
const past = '2026-10-23T00:00:00Z';
function row(update: Partial<AccountRow> = {}): AccountRow {
  return {
    id: userA,
    email: null,
    full_name: 'Owner',
    role: 'customer',
    onboarding_intent: null,
    memberships: [],
    trial_enabled: true,
    approved_intent: null,
    ...update,
  };
}
function member(update: Partial<Membership> = {}): Membership {
  return {
    shop_id: '44444444-4444-4444-8444-444444444444',
    role: 'owner',
    status: 'ACTIVE',
    shop_slug: 'shop-one',
    shop_status: 'active',
    onboarding_completed: true,
    billing_status: 'active',
    subscription_valid_until: future,
    trial_ends_at: null,
    grace_ends_at: null,
    ...update,
  };
}
const next = (value: AccountRow) =>
  accountBootstrap(value, identity, now).next_action;

test('new account asks for name, then intent; intent cannot grant a role', () => {
  assert.equal(next(row({ full_name: null })), 'complete_profile');
  assert.equal(next(row()), 'choose_role');
  const owner = accountBootstrap(
    row({ onboarding_intent: 'owner' }),
    identity,
    now,
  );
  assert.equal(owner.next_action, 'select_plan');
  assert.equal(owner.account.role, 'customer');
  assert.equal(owner.access.workspace, false);
  assert.equal(next(row({ onboarding_intent: 'staff' })), 'join_staff');
});
test('workspace access requires active membership, completed shop and valid entitlement', () => {
  assert.equal(next(row({ memberships: [member()] })), 'workspace');
  for (const change of [
    { status: 'SUSPENDED' },
    { shop_status: 'suspended' },
    { shop_status: 'inactive' },
  ])
    assert.equal(
      next(row({ memberships: [member(change)] })),
      'account_suspended',
    );
  assert.equal(
    next(row({ memberships: [member({ onboarding_completed: false })] })),
    'shop_onboarding',
  );
  for (const change of [
    { billing_status: null },
    { billing_status: 'locked' },
    { subscription_valid_until: past },
  ])
    assert.equal(
      next(row({ memberships: [member(change)] })),
      'manage_subscription',
    );
  assert.equal(
    next(
      row({
        memberships: [
          member({ subscription_valid_until: past, grace_ends_at: future }),
        ],
      }),
    ),
    'workspace',
  );
  assert.equal(
    next(row({ memberships: [member({ subscription_valid_until: null })] })),
    'workspace',
  );
});
test('trial access preserves expiry and platform-disable rules', () => {
  const trial = member({ billing_status: 'trialing', trial_ends_at: future });
  assert.equal(next(row({ memberships: [trial] })), 'workspace');
  assert.equal(
    next(row({ memberships: [trial], trial_enabled: false })),
    'manage_subscription',
  );
  assert.equal(
    next(row({ memberships: [{ ...trial, trial_ends_at: past }] })),
    'manage_subscription',
  );
});
test('staff gets workspace access without owner administration rights', () => {
  const response = accountBootstrap(
    row({ memberships: [member({ role: 'staff' })] }),
    identity,
    now,
  );
  assert.equal(response.access.workspace, true);
  assert.equal(response.access.can_manage_staff, false);
  assert.equal(response.access.can_manage_subscription, false);
});
test('only approved unexpired intents lead to onboarding; never merge user accounts', () => {
  const approved = {
    id: 'approval',
    status: 'payment_approved',
    expires_at: future,
    current_period_end: future,
    trial_ends_at: null,
  };
  assert.equal(next(row({ approved_intent: approved })), 'shop_onboarding');
  for (const intent of [
    { ...approved, status: 'payment_pending' },
    { ...approved, expires_at: past },
    { ...approved, current_period_end: past },
  ])
    assert.equal(next(row({ approved_intent: intent })), 'choose_role');
  assert.throws(() => accountBootstrap(row({ id: userB }), identity, now));
  assert.throws(() =>
    accountBootstrap(row({ memberships: [member(), member()] }), identity, now),
  );
});
test('suspension wins over incomplete name and platform access comes from stored role', () => {
  assert.equal(
    next(
      row({ full_name: null, memberships: [member({ status: 'SUSPENDED' })] }),
    ),
    'account_suspended',
  );
  assert.equal(next(row({ role: 'superadmin' })), 'platform_admin');
  assert.equal(
    accountBootstrap(row({ onboarding_intent: 'owner' }), identity, now).access
      .platform_admin,
    false,
  );
});
