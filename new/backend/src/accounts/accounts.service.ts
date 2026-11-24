import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { VerifiedIdentity } from '../auth/auth.types';
import { accountBootstrap, AccountRow } from './account-policy';

@Injectable()
export class AccountsService {
  constructor(private readonly database: DatabaseService) {}

  async bootstrap(
    identity: VerifiedIdentity,
    update?: { full_name?: string; intent?: 'owner' | 'staff' },
  ) {
    return this.database.asUser(identity, async (transaction) => {
      // One bounded projection replaces the legacy's sequential bootstrap reads.
      // Explicit user predicates supplement (never replace) transaction-local RLS.
      const read = () =>
        transaction.query<AccountRow>(sql`
        select p.id, p.email, p.full_name, p.role, p.onboarding_intent,
          coalesce((select jsonb_agg(jsonb_build_object(
            'shop_id', m.shop_id, 'role', m.role, 'status', m.status,
            'shop_slug', s.slug, 'shop_status', s.status,
            'onboarding_completed', coalesce(ss.onboarding_completed,false),
            'billing_status', e.billing_status, 'trial_ends_at', e.trial_ends_at,
            'subscription_valid_until', e.subscription_valid_until, 'grace_ends_at', e.grace_ends_at
          )) from (select shop_id,role,status from public.shop_members where user_id=${identity.userId}::uuid order by created_at,id limit 2) m
            left join public.shops s on s.id=m.shop_id
            left join public.shop_settings ss on ss.shop_id=m.shop_id
            left join public.shop_entitlements e on e.shop_id=m.shop_id), '[]'::jsonb) as memberships,
          coalesce((select trial_enabled from public.saas_platform_settings where id=1),true) as trial_enabled,
          (select jsonb_build_object('id',i.id,'status',i.status,'expires_at',i.expires_at,'trial_ends_at',i.trial_ends_at,'current_period_end',i.current_period_end)
            from public.subscription_intents i
            where i.owner_user_id=${identity.userId}::uuid and i.created_shop_id is null
              and i.expires_at > now() and (
                i.status='trial_approved' and i.trial_ends_at > now() or
                i.status='payment_approved' and (i.current_period_end is null or i.current_period_end > now())
              ) order by i.created_at desc,i.id desc limit 1) as approved_intent
          from public.profiles p where p.id=${identity.userId}::uuid
      `);
      let rows = await read();
      // Common reads never attempt an INSERT. Create a missing phone-only
      // profile once, with NULL email and its server-side default role.
      const missing = !rows[0];
      if (missing)
        await transaction.query(
          sql`insert into public.profiles(id,email) values (${identity.userId}::uuid,${identity.email}) on conflict(id) do nothing`,
        );
      if (update?.full_name !== undefined)
        await transaction.query(
          sql`update public.profiles set full_name=${update.full_name} where id=${identity.userId}::uuid`,
        );
      if (update?.intent !== undefined)
        await transaction.query(
          sql`update public.profiles set onboarding_intent=${update.intent} where id=${identity.userId}::uuid`,
        );
      if (
        missing ||
        update?.full_name !== undefined ||
        update?.intent !== undefined
      )
        rows = await read();
      if (!rows[0])
        throw new ServiceUnavailableException({ code: 'ACCOUNT_UNAVAILABLE' });
      return accountBootstrap(rows[0], identity);
    });
  }
}
