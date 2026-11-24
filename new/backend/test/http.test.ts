import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { testApp } from './fixtures/app';

let app: Awaited<ReturnType<typeof testApp>>;
before(async () => {
  app = await testApp();
});
after(async () => {
  await app?.close();
});

test('health is public, unversioned, minimal and never cached', async () => {
  const response = await app.inject({
    url: '/health/live',
    headers: { 'x-request-id': 'untrusted-caller-id' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  assert.match(String(response.headers['x-request-id']), /^[a-f0-9-]{36}$/);
  assert.notEqual(response.headers['x-request-id'], 'untrusted-caller-id');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('readiness checks dependencies and does not expose tenant or infrastructure details', async () => {
  assert.equal((await app.inject('/health/ready')).statusCode, 200);
  for (const options of [{ ready: false }, { limiterReady: false }]) {
    const unavailable = await testApp(options);
    try {
      const response = await unavailable.inject('/health/ready');
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error.code, 'SERVICE_UNAVAILABLE');
      assert.equal((await unavailable.inject('/health/live')).statusCode, 200);
      assert.doesNotMatch(
        response.body,
        /postgres|redis|password|customer|shop_id/i,
      );
    } finally {
      await unavailable.close();
    }
  }
});

test('versioned handlers reject unverified identities and caller-supplied roles', async () => {
  const response = await app.inject({
    url: '/api/v1/fixture/private',
    headers: {
      authorization: 'Bearer not-verified',
      'x-user-id': 'fake-owner',
      'x-role': 'superadmin',
    },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'AUTHENTICATION_REQUIRED');
  assert.equal((await app.inject('/api/fixture/private')).statusCode, 404);
});

test('DTO validation rejects extra fields and returns field names/rules without values', async () => {
  const valid = await app.inject({
    method: 'POST',
    url: '/api/v1/fixture/validate',
    payload: { name: 'Shop owner' },
  });
  assert.equal(valid.statusCode, 201);
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/fixture/validate',
    payload: { name: 123, role: 'superadmin' },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    response
      .json()
      .error.fields.map((field: { field: string }) => field.field)
      .sort(),
    ['name', 'role'],
  );
  assert.equal(
    response.json().error.requestId,
    response.headers['x-request-id'],
  );
  assert.doesNotMatch(response.body, /superadmin|123/);
});

test('unexpected errors redact provider messages and connection strings', async () => {
  const response = await app.inject('/api/v1/fixture/failure');
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(
    response.body,
    /postgres|secret|private-db|customer_phone|stack/,
  );
});

test('CORS only grants the configured web origin', async () => {
  const allowed = await app.inject({
    url: '/health/live',
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(
    allowed.headers['access-control-allow-origin'],
    'http://localhost:3000',
  );
  const denied = await app.inject({
    url: '/health/live',
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('oversized bodies and malformed JSON use the same safe error envelope', async () => {
  for (const [payload, expected] of [
    [JSON.stringify({ name: 'x'.repeat(1024 * 1024 + 1) }), 413],
    ['{"name":', 400],
  ] as const) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/fixture/validate',
      payload,
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, expected);
    assert.equal(typeof response.json().error.requestId, 'string');
  }
});

test('rate limiting returns 429 and Retry-After while health remains available', async () => {
  assert.equal((await app.inject('/api/v1/fixture/limited')).statusCode, 200);
  assert.equal((await app.inject('/api/v1/fixture/limited')).statusCode, 200);
  const blocked = await app.inject('/api/v1/fixture/limited');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal((await app.inject('/health/live')).statusCode, 200);
});

test('limiter outage fails closed instead of permitting protected work', async () => {
  const unavailable = await testApp({ limiterFailure: true });
  try {
    assert.equal(
      (await unavailable.inject('/api/v1/fixture/limited')).statusCode,
      503,
    );
  } finally {
    await unavailable.close();
  }
});

test('development serves OpenAPI JSON and interactive docs', async () => {
  const response = await app.inject('/api/openapi.json');
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().paths['/health/live']);
  assert.ok(response.json().paths['/health/ready']);
  assert.equal((await app.inject('/api/docs')).statusCode, 200);
});

test('HTTP query metrics remain linked to the correct request', async () => {
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      app.inject('/api/v1/fixture/query-context'),
    ),
  );
  assert.equal(
    new Set(responses.map((response) => response.json().requestId)).size,
    10,
  );
  for (const response of responses) {
    assert.equal(response.json().requestId, response.headers['x-request-id']);
    assert.equal(response.json().queries, 1);
  }
});

test('Fastify multipart streams supported uploads and rejects oversized files', async () => {
  for (const [size, status] of [
    [10, 201],
    [6 * 1024 * 1024, 413],
  ] as const) {
    const payload = Buffer.concat([
      Buffer.from(
        '--boundary\r\nContent-Disposition: form-data; name="file"; filename="fixture.txt"\r\nContent-Type: text/plain\r\n\r\n',
      ),
      Buffer.alloc(size, 'a'),
      Buffer.from('\r\n--boundary--\r\n'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/fixture/upload',
      payload,
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
    });
    assert.equal(response.statusCode, status);
    if (status === 201) assert.equal(response.json().bytes, size);
    else assert.equal(response.json().error.code, 'PAYLOAD_TOO_LARGE');
  }
});

test('production does not publish docs', async () => {
  const production = await testApp({
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://api:example@localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGINS: 'https://admin.example.com',
    },
  });
  try {
    assert.equal(
      (await production.inject('/api/openapi.json')).statusCode,
      404,
    );
    assert.equal((await production.inject('/api/docs')).statusCode, 404);
  } finally {
    await production.close();
  }
});
