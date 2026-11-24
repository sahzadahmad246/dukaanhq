import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig } from '../src/config/config.module';
import { decimalAmount, isoTimestamp } from '../src/common/serialization';
import { requestContext, timedQuery } from '../src/common/request-context';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

test('production fails clearly when required settings are missing', () => {
  assert.throws(
    () => parseConfig({ NODE_ENV: 'production' }),
    /DATABASE_URL, REDIS_URL, CORS_ORIGINS/,
  );
});
test('configuration validation never includes credential values', () => {
  const secret = 'postgresql://admin:do-not-print@localhost/db';
  assert.throws(
    () => parseConfig({ DATABASE_URL: secret, DATABASE_POOL_MAX: '9999' }),
    (error: Error) =>
      error.message.includes('DATABASE_POOL_MAX') &&
      !error.message.includes(secret),
  );
  for (const source of [
    { PORT: 'letters' },
    { DATABASE_URL: 'file:///secret' },
    { DATABASE_SSL: 'yes' },
    { DATABASE_URL: 'postgresql://api:example@localhost/db?sslmode=no-verify' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'https://example.com/path' },
  ])
    assert.throws(() => parseConfig(source), /Invalid configuration/);
});
test('production requires TLS, explicit HTTPS origins and private docs', () => {
  const source = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://api:example@localhost/db',
    REDIS_URL: 'rediss://localhost:6379',
    CORS_ORIGINS: 'https://admin.example.com',
    AUTH_ENABLED: 'true',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    OTP_RATE_LIMIT_SECRET: 'test-rate-secret-that-is-at-least-32-characters',
  };
  assert.equal(parseConfig(source).docsEnabled, false);
  assert.throws(
    () => parseConfig({ ...source, DATABASE_SSL: 'false' }),
    /DATABASE_SSL/,
  );
  assert.throws(
    () => parseConfig({ ...source, OPENAPI_ENABLED: 'true' }),
    /OPENAPI_ENABLED/,
  );
  assert.throws(
    () => parseConfig({ ...source, CORS_ORIGINS: 'http://localhost:3000' }),
    /CORS_ORIGINS/,
  );
});
test('money stays exact and dates are UTC ISO 8601', () => {
  assert.equal(decimalAmount('9999999999.99'), '9999999999.99');
  assert.throws(() => decimalAmount('1.001'));
  assert.throws(() => decimalAmount('NaN'));
  assert.equal(
    isoTimestamp(new Date('2026-11-23T12:00:00+05:30')),
    '2026-11-23T06:30:00.000Z',
  );
});

test('example environment boots locally, while enabled auth rejects missing keys or privileged keys', () => {
  assert.equal(
    parseConfig(parseEnv(readFileSync('.env.example', 'utf8'))).AUTH_ENABLED,
    false,
  );
  assert.throws(() => parseConfig({ AUTH_ENABLED: 'true' }), /SUPABASE_URL/);
  assert.throws(
    () => parseConfig({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-use' }),
    /must not be/,
  );
  const serviceRole = `a.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.b`;
  assert.throws(
    () => parseConfig({ SUPABASE_PUBLISHABLE_KEY: serviceRole }),
    /must not be/,
  );
  assert.throws(
    () =>
      parseConfig({ SUPABASE_URL: 'https://project.supabase.co?query=true' }),
    /project origin/,
  );
});
test('query metrics stay isolated across concurrent requests, including failures', async () => {
  const first = { requestId: 'a', queries: 0, queryMs: 0 };
  const second = { requestId: 'b', queries: 0, queryMs: 0 };
  await Promise.all([
    requestContext.run(first, async () => {
      await timedQuery(async () => 1);
      await assert.rejects(
        timedQuery(async () => {
          throw new Error('query failed');
        }),
      );
    }),
    requestContext.run(second, async () => {
      await timedQuery(async () => 2);
    }),
  ]);
  assert.equal(first.queries, 2);
  assert.equal(second.queries, 1);
  assert.ok(first.queryMs >= 0 && second.queryMs >= 0);
  assert.equal(requestContext.getStore(), undefined);
});
