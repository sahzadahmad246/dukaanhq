import { ConflictException, ForbiddenException } from '@nestjs/common';
import { VerifiedIdentity } from '../auth/auth.types';

export interface Membership {
  shop_id: string;
  role: string;
  status: string;
  shop_slug: string;
  shop_status: string;
  onboarding_completed: boolean;
  billing_status: string | null;
  trial_ends_at: string | null;
  subscription_valid_until: string | null;
  grace_ends_at: string | null;
}
export interface AccountRow extends Record<string, unknown> {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  onboarding_intent: 'owner' | 'staff' | null;
  memberships: Membership[];
  trial_enabled: boolean;
  approved_intent: {
    id: string;
    status: string;
    expires_at: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
  } | null;
}

export function accountBootstrap(
  row: AccountRow,
  identity: VerifiedIdentity,
  now = Date.now(),
) {
  if (row.id !== identity.userId) throw new ForbiddenException();
  if (row.memberships.length > 1)
    throw new ConflictException({ code: 'ACCOUNT_MEMBERSHIP_CONFLICT' });
  const membership = row.memberships[0] ?? null;
  if (membership && !['owner', 'staff'].includes(membership.role))
    throw new ForbiddenException({ code: 'UNSUPPORTED_MEMBERSHIP' });
  const future = (value: string | null) =>
    Boolean(value && Date.parse(value) > now);
  const suspended = Boolean(
    membership &&
    (membership.status !== 'ACTIVE' || membership.shop_status !== 'active'),
  );
  const productAccess = Boolean(
    membership &&
    ((membership.billing_status === 'active' &&
      (membership.subscription_valid_until === null ||
        future(membership.subscription_valid_until) ||
        future(membership.grace_ends_at))) ||
      (membership.billing_status === 'trialing' &&
        row.trial_enabled &&
        future(membership.trial_ends_at))),
  );
  const intent = row.approved_intent;
  const approved =
    !membership &&
    intent &&
    future(intent.expires_at) &&
    ((intent.status === 'trial_approved' && future(intent.trial_ends_at)) ||
      (intent.status === 'payment_approved' &&
        (intent.current_period_end === null ||
          future(intent.current_period_end))));
  const workspace = Boolean(
    membership &&
    !suspended &&
    membership.onboarding_completed &&
    productAccess,
  );
  let nextAction:
    | 'complete_profile'
    | 'choose_role'
    | 'select_plan'
    | 'shop_onboarding'
    | 'workspace'
    | 'account_suspended'
    | 'manage_subscription'
    | 'join_staff'
    | 'platform_admin';
  if (suspended) nextAction = 'account_suspended';
  else if (!row.full_name?.trim()) nextAction = 'complete_profile';
  else if (membership)
    nextAction = !membership.onboarding_completed
      ? 'shop_onboarding'
      : workspace
        ? 'workspace'
        : 'manage_subscription';
  else if (row.role === 'superadmin') nextAction = 'platform_admin';
  else if (approved) nextAction = 'shop_onboarding';
  else if (row.onboarding_intent === 'owner' || row.role === 'owner')
    nextAction = 'select_plan';
  else if (row.onboarding_intent === 'staff') nextAction = 'join_staff';
  else nextAction = 'choose_role';
  return {
    account: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      phone: identity.phone,
      role: row.role,
      onboarding_intent: row.onboarding_intent,
    },
    membership: membership
      ? {
          shop_id: membership.shop_id,
          shop_slug: membership.shop_slug,
          role: membership.role,
          status: membership.status,
          shop_status: membership.shop_status,
          onboarding_completed: membership.onboarding_completed,
        }
      : null,
    access: {
      workspace,
      can_manage_staff: workspace && membership?.role === 'owner',
      can_manage_subscription: Boolean(
        membership && !suspended && membership.role === 'owner',
      ),
      can_onboard_shop:
        nextAction === 'shop_onboarding' &&
        (!membership || membership.role === 'owner'),
      platform_admin: !suspended && row.role === 'superadmin',
    },
    approved_intent_id: approved ? intent!.id : null,
    next_action: nextAction,
    permitted_choices: nextAction === 'choose_role' ? ['owner', 'staff'] : [],
  };
}
export type AccountBootstrap = ReturnType<typeof accountBootstrap>;
