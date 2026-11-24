import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { AuthProvider } from '../src/auth/auth-provider';
import { parseConfig } from '../src/config/config.module';
import { userA, userB } from './fixtures/identities';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const config = parseConfig({
  NODE_ENV: 'test',
  AUTH_ENABLED: 'true',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-key',
});
const provider = new AuthProvider(config);
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('OTP request explicitly uses SMS and provider CAPTCHA, with generic handling of account-specific errors', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://project.supabase.co/auth/v1/otp');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      phone: '+919876543210',
      channel: 'sms',
      create_user: true,
      gotrue_meta_security: { captcha_token: 'captcha-response' },
    });
    return response({});
  };
  await provider.requestOtp('+919876543210', 'captcha-response');
  globalThis.fetch = async () =>
    response(
      { error_code: 'phone_exists', message: 'do-not-leak-account-details' },
      422,
    );
  await provider.requestOtp('+919876543210');
});
test('wrong/expired OTP and provider throttling map to stable safe errors', async () => {
  for (const code of ['otp_expired', 'otp_disabled', 'validation_failed']) {
    globalThis.fetch = async () =>
      response({ error_code: code, message: 'private-message' }, 403);
    await assert.rejects(
      provider.verifyOtp('+919876543210', '000000'),
      (error: { getStatus: () => number; getResponse: () => unknown }) =>
        error.getStatus() === 400 &&
        JSON.stringify(error.getResponse()).includes(
          'OTP_INVALID_OR_EXPIRED',
        ) &&
        !JSON.stringify(error.getResponse()).includes('private-message'),
    );
  }
  globalThis.fetch = async () =>
    response({ message: 'provider account details' }, 429);
  await assert.rejects(
    provider.requestOtp('+919876543210'),
    (error: { getStatus: () => number }) => error.getStatus() === 429,
  );
});
test('refresh rotation uses stateless requests and does not replay a timed-out refresh', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const refresh = JSON.parse(String(init?.body)).refresh_token;
    calls.push(refresh);
    const isA = refresh === 'refresh-a';
    return response({
      access_token: isA ? 'a.jwt.sig' : 'b.jwt.sig',
      refresh_token: isA ? 'rotated-a' : 'rotated-b',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: isA ? userA : userB },
    });
  };
  const [a, b] = await Promise.all([
    provider.refresh('refresh-a'),
    provider.refresh('refresh-b'),
  ]);
  assert.equal(a.user.id, userA);
  assert.equal(b.user.id, userB);
  assert.equal(a.session.refresh_token, 'rotated-a');
  assert.equal(b.session.refresh_token, 'rotated-b');
  assert.equal(calls.length, 2);
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    throw new Error('timeout with secret-token');
  };
  await assert.rejects(provider.refresh('refresh-a'));
  assert.equal(attempts, 1);
});
test('logout revokes local session only and repeated provider logout is idempotent', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://project.supabase.co/auth/v1/logout?scope=local',
    );
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      'Bearer a.jwt.sig',
    );
    return new Response(null, { status: 204 });
  };
  await provider.logout('a.jwt.sig');
  globalThis.fetch = async () =>
    response({ message: 'session not found' }, 404);
  await provider.logout('a.jwt.sig');
});
test('link request uses the current token; profile metadata update contains only the permitted name', async () => {
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      'Bearer current.jwt.sig',
    );
    bodies.push(JSON.parse(String(init?.body)));
    return response({ id: userA });
  };
  await provider.requestPhoneLink('current.jwt.sig', '+919876543210');
  await provider.updateName('current.jwt.sig', 'Name');
  assert.deepEqual(bodies, [
    { phone: '+919876543210', channel: 'sms' },
    { data: { full_name: 'Name', name: 'Name' } },
  ]);
});

test('provider accepts existing Google accounts and phone-only users with nullable optional fields', async () => {
  globalThis.fetch = async () =>
    response({
      id: userA,
      email: 'owner@example.test',
      phone: null,
      phone_confirmed_at: null,
      new_phone: null,
    });
  const user = await provider.getUser('google.jwt.sig');
  assert.equal(user.id, userA);
  assert.equal(user.phone, undefined);
  globalThis.fetch = async () =>
    response({
      access_token: 'a.jwt.sig',
      refresh_token: 'refresh-a',
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: userB,
        email: null,
        phone: '919876543211',
        phone_confirmed_at: new Date().toISOString(),
      },
    });
  assert.equal(
    (await provider.verifyOtp('+919876543211', '123456')).user.email,
    undefined,
  );
});
