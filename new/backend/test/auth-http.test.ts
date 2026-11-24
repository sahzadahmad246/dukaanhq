import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { authApp, tokens } from './fixtures/auth-app';
import { identityA, identityB, userA, userB } from './fixtures/identities';

let fixture: Awaited<ReturnType<typeof authApp>> | undefined;
afterEach(async () => {
  await fixture?.app.close();
  fixture = undefined;
});
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

test('OTP request is generic for new/existing users, rejects malformed phone numbers and enforces resend cooldown', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const first = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    payload: { phone: identityA.phone },
  });
  const second = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    payload: { phone: identityB.phone },
  });
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), second.json());
  assert.equal(first.headers['cache-control'], 'no-store');
  for (const phone of [
    '9876543210',
    '+91letters12',
    '+919876543210000000',
    1234567890,
    '+910000000000',
  ]) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/otp/request',
          payload: { phone },
        })
      ).statusCode,
      400,
    );
  }
  const resend = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    payload: { phone: identityA.phone },
  });
  assert.equal(resend.statusCode, 429);
  assert.ok(Number(resend.headers['retry-after']) > 0);
  assert.equal(
    fixture.calls.filter((call) => call.operation === 'request').length,
    2,
  );
});
test('OTP verification returns existing/new sessions and directs only new users to complete their name', async () => {
  fixture = await authApp();
  const { app } = fixture;
  for (const [phone, user, next] of [
    [identityA.phone, userA, 'choose_role'],
    [identityB.phone, userB, 'complete_profile'],
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone, token: '123456' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().account.id, user);
    assert.equal(response.json().next_action, next);
    assert.ok(response.json().session.refresh_token);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  for (const token of ['999999', '1234567', 'letters']) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: identityA.phone, token },
    });
    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /999999|letters/);
  }
});
test('verification limits block repeated wrong codes before calling the provider again', async () => {
  fixture = await authApp();
  const { app } = fixture;
  for (let attempt = 0; attempt < 5; attempt++)
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/otp/verify',
          payload: { phone: identityA.phone, token: '999999' },
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        payload: { phone: identityA.phone, token: '123456' },
      })
    ).statusCode,
    429,
  );
  assert.equal(
    fixture.calls.filter((call) => call.operation === 'verify').length,
    5,
  );
});
test('name/intent updates never grant roles and supplied identity/role fields are rejected', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const name = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/profile',
    headers: auth(tokens.b),
    payload: { full_name: '  New owner  ' },
  });
  assert.equal(name.statusCode, 200);
  assert.equal(name.json().account.full_name, 'New owner');
  assert.equal(name.json().next_action, 'choose_role');
  const intent = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/intent',
    headers: auth(tokens.b),
    payload: { intent: 'owner' },
  });
  assert.equal(intent.statusCode, 200);
  assert.equal(intent.json().account.role, 'customer');
  assert.equal(intent.json().next_action, 'select_plan');
  assert.equal(intent.json().access.workspace, false);
  for (const payload of [
    { full_name: 'Name', role: 'superadmin' },
    { full_name: 'Name', user_id: userA },
    { full_name: '  ' },
  ])
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/auth/profile',
          headers: auth(tokens.b),
          payload,
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/intent',
        headers: auth(tokens.b),
        payload: { intent: 'superadmin' },
      })
    ).statusCode,
    400,
  );
  assert.equal(fixture.rows.get(userA)?.full_name, 'Existing Owner');
});
test('me derives user identity from verified token, including concurrent users', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const responses = await Promise.all(
    [tokens.a, tokens.b, tokens.a, tokens.b].map((token) =>
      app.inject({
        url: '/api/v1/auth/me',
        headers: { ...auth(token), 'x-user-id': userA },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.json().account.id),
    [userA, userB, userA, userB],
  );
  assert.equal((await app.inject('/api/v1/auth/me')).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        url: '/api/v1/auth/me',
        headers: auth('forged.user.signature'),
      })
    ).statusCode,
    401,
  );
});
test('refresh retries remain provider-controlled; logout revokes only the relevant refresh session', async () => {
  fixture = await authApp();
  const { app } = fixture;
  fixture.rows.delete(userA); // Rotation must not depend on account/bootstrap availability.
  for (let retry = 0; retry < 2; retry++)
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/session/refresh',
          payload: { refresh_token: 'refresh-a' },
        })
      ).statusCode,
      200,
    );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session/logout',
        headers: auth(tokens.a),
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session/refresh',
        payload: { refresh_token: 'refresh-a' },
      })
    ).statusCode,
    401,
  );
  const other = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/session/refresh',
    payload: { refresh_token: 'refresh-b' },
  });
  assert.equal(other.statusCode, 200);
  assert.equal(other.json().session.access_token, tokens.b);
  assert.equal(other.json().account, undefined);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session/refresh',
        payload: { refresh_token: 'unknown' },
      })
    ).statusCode,
    401,
  );
});
test('Google account phone linking requires the same authenticated session and preserves its UUID', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const payload = { phone: identityA.phone };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/request',
        headers: auth(tokens.google),
        payload,
      })
    ).statusCode,
    202,
  );
  const verify = { ...payload, token: '123456' };
  fixture.identities.set('other.device.signature', {
    ...identityA,
    sessionId: '77777777-7777-4777-8777-777777777777',
  });
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/verify',
        headers: auth('other.device.signature'),
        payload: verify,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/verify',
        headers: auth(tokens.b),
        payload: verify,
      })
    ).statusCode,
    400,
  );
  const linked = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/phone/link/verify',
    headers: auth(tokens.google),
    payload: verify,
  });
  assert.equal(linked.statusCode, 200);
  assert.equal(linked.json().account.id, userA);
  assert.equal(
    fixture.calls.filter(
      (call) => call.operation === 'verify' && call.type === 'phone_change',
    ).length,
    1,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/verify',
        headers: auth(tokens.google),
        payload: verify,
      })
    ).statusCode,
    400,
  );
});
test('linking rejects provider pending-phone changes and already linked phones', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const payload = { phone: identityA.phone };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/request',
        headers: auth(tokens.a),
        payload,
      })
    ).statusCode,
    400,
  );
  // Separate target avoids the shared per-phone resend cooldown.
  const target = { phone: '+919876543212' };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/request',
        headers: auth(tokens.google),
        payload: target,
      })
    ).statusCode,
    202,
  );
  fixture.pending.set(userA, '919876543213');
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/verify',
        headers: auth(tokens.google),
        payload: { ...target, token: '123456' },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    fixture.calls.filter((call) => call.operation === 'verify').length,
    0,
  );
});

test('provider response identity mismatch cannot link or expose another account', async () => {
  fixture = await authApp();
  const { app } = fixture;
  const payload = { phone: identityA.phone };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone/link/request',
        headers: auth(tokens.google),
        payload,
      })
    ).statusCode,
    202,
  );
  const original = fixture.provider.verifyOtp;
  fixture.provider.verifyOtp = async (
    phone: string,
    code: string,
    type?: string,
  ) => {
    const result = await original(phone, code, type);
    return { ...result, user: { ...result.user, id: userB } };
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/phone/link/verify',
    headers: auth(tokens.google),
    payload: { ...payload, token: '123456' },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().session, undefined);
  assert.equal(response.json().account, undefined);
});
