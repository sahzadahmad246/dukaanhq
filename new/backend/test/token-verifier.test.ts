import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { after, before, test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, JWTPayload } from 'jose';
import { TokenVerifier } from '../src/auth/token-verifier';
import { AuthProvider } from '../src/auth/auth-provider';
import { parseConfig } from '../src/config/config.module';
import { identityA, userA, userB } from './fixtures/identities';

let server: Server;
let issuer: string;
let config: ReturnType<typeof parseConfig>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let verifier: TokenVerifier;
let fetches = 0;
let unavailable = false;
const claims: JWTPayload = {
  sub: userA,
  session_id: identityA.sessionId,
  role: 'authenticated',
  phone: '919876543210',
};
before(async () => {
  keys = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'test-key',
    alg: 'ES256',
    use: 'sig',
  };
  server = createServer((request, response) => {
    if (request.url === '/auth/v1/.well-known/jwks.json') {
      fetches++;
      if (unavailable) {
        response.writeHead(503).end('upstream unavailable');
        return;
      }
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ keys: [jwk] }));
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  issuer = `${url}/auth/v1`;
  config = parseConfig({
    NODE_ENV: 'test',
    AUTH_ENABLED: 'true',
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: 'test-key',
  });
  verifier = new TokenVerifier(config, new AuthProvider(config));
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
async function signed(
  overrides: JWTPayload = {},
  options: {
    issuer?: string;
    audience?: string;
    expiry?: number;
    key?: (typeof keys)['privateKey'];
  } = {},
) {
  return new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? 'authenticated')
    .setExpirationTime(options.expiry ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(options.key ?? keys.privateKey);
}
test('JWT verification checks a real signature and caches only public signing keys', async () => {
  const token = await signed();
  assert.equal((await verifier.verify(token)).userId, userA);
  assert.equal((await verifier.verify(token)).userId, userA);
  assert.equal(fetches, 1);
});
test('expired, forged, wrong issuer/audience/role and missing session claims are rejected', async () => {
  const forged = await generateKeyPair('ES256');
  for (const token of [
    await signed({}, { expiry: Math.floor(Date.now() / 1000) - 60 }),
    await signed({}, { issuer: 'https://attacker.invalid/auth/v1' }),
    await signed({}, { audience: 'other' }),
    await signed({ role: 'service_role' }),
    await signed({ session_id: 'not-a-uuid' }),
    await signed({}, { key: forged.privateKey }),
    'not-a-token',
  ]) {
    await assert.rejects(
      verifier.verify(token),
      (error: { getStatus: () => number }) => error.getStatus() === 401,
    );
  }
});
test('legacy HS256 fallback asks the provider to verify before trusting any claims', async () => {
  const secret = new TextEncoder().encode(
    'test-only-legacy-key-at-least-32-bytes',
  );
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(secret);
  const provider = new AuthProvider(config);
  let calls = 0;
  provider.getUser = async () => {
    calls++;
    return { id: userA };
  };
  const legacy = new TokenVerifier(config, provider);
  assert.equal((await legacy.verify(token)).userId, userA);
  assert.equal(calls, 1);
  provider.getUser = async () => ({ id: userB });
  await assert.rejects(legacy.verify(token));
});

test('a signing-key provider outage returns 503 rather than forcing clients to log in again', async () => {
  unavailable = true;
  try {
    await assert.rejects(
      new TokenVerifier(config, new AuthProvider(config)).verify(
        await signed(),
      ),
      (error: { getStatus: () => number }) => error.getStatus() === 503,
    );
  } finally {
    unavailable = false;
  }
});
