import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { createAdapter, configureApp } from '../../src/app';
import { parseConfig } from '../../src/config/config.module';
import { AccountsService } from '../../src/accounts/accounts.service';
import {
  accountBootstrap,
  AccountRow,
} from '../../src/accounts/account-policy';
import { DatabaseService } from '../../src/database/database.service';
import { AuthProvider } from '../../src/auth/auth-provider';
import { TokenVerifier } from '../../src/auth/token-verifier';
import { VerifiedIdentity } from '../../src/auth/auth.types';
import { identityA, identityB, userA, userB } from './identities';

export const tokens = {
  google: 'google.user.signature',
  a: 'first.user.signature',
  b: 'second.user.signature',
  linked: 'linked.user.signature',
  rotated: 'rotated.user.signature',
};
export async function authApp() {
  const config = parseConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTH_ENABLED: 'true',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-key',
  });
  const identities = new Map<string, VerifiedIdentity>([
    [tokens.google, { ...identityA, phone: null, email: 'owner@example.test' }],
    [tokens.a, identityA],
    [tokens.b, identityB],
    [tokens.linked, identityA],
    [tokens.rotated, identityA],
  ]);
  const rows = new Map<string, AccountRow>(
    [userA, userB].map((id) => [
      id,
      {
        id,
        email: null,
        full_name: id === userA ? 'Existing Owner' : null,
        role: 'customer',
        onboarding_intent: null,
        memberships: [],
        trial_enabled: true,
        approved_intent: null,
      },
    ]),
  );
  const calls: {
    operation: string;
    token?: string;
    phone?: string;
    type?: string;
  }[] = [];
  const pending = new Map<string, string>();
  const revoked = new Set<string>();
  const getIdentity = (token: string) => {
    const identity = identities.get(token);
    if (!identity) throw new UnauthorizedException();
    return identity;
  };
  const session = (token: string) => ({
    access_token: token,
    refresh_token: token === tokens.b ? 'refresh-b' : 'refresh-a',
    token_type: 'bearer' as const,
    expires_in: 3600,
    expires_at: identityA.expiresAt,
  });
  const provider = {
    requestOtp: async (phone: string) => {
      calls.push({ operation: 'request', phone });
    },
    verifyOtp: async (phone: string, code: string, type = 'sms') => {
      calls.push({ operation: 'verify', phone, type });
      if (code !== '123456')
        throw new BadRequestException({ code: 'OTP_INVALID_OR_EXPIRED' });
      const identity = phone === identityB.phone ? identityB : identityA;
      return {
        user: {
          id: identity.userId,
          phone: phone.slice(1),
          phone_confirmed_at: new Date().toISOString(),
        },
        session: session(
          type === 'phone_change'
            ? tokens.linked
            : identity.userId === userA
              ? tokens.a
              : tokens.b,
        ),
      };
    },
    getUser: async (token: string) => {
      calls.push({ operation: 'get-user', token });
      const identity = getIdentity(token);
      return {
        id: identity.userId,
        phone: token === tokens.google ? '' : identity.phone?.slice(1),
        phone_confirmed_at:
          token === tokens.google ? undefined : new Date().toISOString(),
        new_phone: pending.get(identity.userId),
      };
    },
    requestPhoneLink: async (token: string, phone: string) => {
      calls.push({ operation: 'link-request', token, phone });
      pending.set(getIdentity(token).userId, phone.slice(1));
    },
    updateName: async (token: string) => {
      calls.push({ operation: 'name', token });
    },
    refresh: async (token: string) => {
      calls.push({ operation: 'refresh', token });
      if (!['refresh-a', 'refresh-b'].includes(token) || revoked.has(token))
        throw new UnauthorizedException();
      const isB = token === 'refresh-b';
      return {
        user: { id: isB ? userB : userA },
        session: session(isB ? tokens.b : tokens.rotated),
      };
    },
    logout: async (token: string) => {
      calls.push({ operation: 'logout', token });
      revoked.add(
        getIdentity(token).userId === userA ? 'refresh-a' : 'refresh-b',
      );
    },
  };
  const accounts = {
    bootstrap: async (
      identity: VerifiedIdentity,
      update?: { full_name?: string; intent?: 'owner' | 'staff' },
    ) => {
      const row = rows.get(identity.userId)!;
      if (update?.full_name !== undefined) row.full_name = update.full_name;
      if (update?.intent !== undefined) row.onboarding_intent = update.intent;
      return accountBootstrap(row, identity);
    },
  };
  const module = await Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
  })
    .overrideProvider(DatabaseService)
    .useValue({ isReady: async () => true })
    .overrideProvider(AuthProvider)
    .useValue(provider)
    .overrideProvider(TokenVerifier)
    .useValue({ verify: async (token: string) => getIdentity(token) })
    .overrideProvider(AccountsService)
    .useValue(accounts)
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(
    createAdapter(config),
    { logger: false },
  );
  await configureApp(app, config);
  return { app, calls, rows, pending, provider, identities };
}
