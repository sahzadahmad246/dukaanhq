# DukaanHQ API — Phases 1–2

NestJS 11, Fastify 5, strict TypeScript, Drizzle and `pg`, running on Node 24 LTS.
Dependencies are pinned in `package.json` and `new/bun.lock`. Bun installs/builds;
Node runs the server, tests and development watcher. A pinned local Node binary is
included in development dependencies; a production host/image must supply Node 24
when installing without dev dependencies. The existing app stays in `web/`.

## Run locally

```bash
cd new
bun install --frozen-lockfile
cd backend
cp .env.example .env
bun dev
```

The dev command builds TypeScript and watches source/output. Default address:
`http://127.0.0.1:4000`. Without database configuration, liveness and docs work and
readiness returns 503. This is deliberate; an unconfigured server is not ready for traffic.

- `GET /health/live`: process-only check, no dependency calls.
- `GET /health/ready`: database connectivity, current schema markers, safe database
  login and Redis when configured. No customer data or connection details.
- `GET /api/openapi.json`: generated contract in development/test.
- `GET /api/docs`: interactive development docs. Disabled in production.

Authentication routes now live under `/api/v1/auth`: OTP request/verify, session
refresh/logout, current account, name update, onboarding intent and phone-link request/verify.
See [request/response contracts and Twilio setup](../docs/phase-2.md).
Protected routes require verified bearer credentials. Shop onboarding is Phase 3.

## Configuration and database compatibility

Use `.env.example` for setting names. Production requires `DATABASE_URL`,
`REDIS_URL`, explicit HTTPS `CORS_ORIGINS` and certificate-verified database TLS.
It also requires enabled auth, Supabase project URL/publishable key and a shared random
`OTP_RATE_LIMIT_SECRET`. Secret/service-role keys are rejected as the publishable key.
Twilio Account SID/Auth Token and SMS Messaging Service configuration go in **Supabase
Auth's SMS provider**, not in Android or this API's runtime settings. Apply reviewed
SQL 046 to staging before enabling phone authentication. Provider-side SMS length,
expiry and resend settings must agree with `.env`; the provider enforces actual expiry.
Set `HOST=0.0.0.0` in a container. Missing/invalid settings fail before listening;
errors report setting names only.

Use the existing PostgreSQL project via a direct/session-pool connection. Provision
a dedicated non-superuser, non-BYPASSRLS login, with membership in `authenticated`,
appropriate schema/table/function grants, and no table ownership. Readiness rejects
administrative/table-owner connections. Database roles/grants must be reviewed in
staging; this scaffold neither provisions them nor changes the live database.
Configure TLS through `DATABASE_SSL`; URL SSL parameters are rejected to prevent
connection-string parsing from overriding certificate verification. Use a trusted
server certificate. Local database TLS may be disabled only outside production.

There is one lazy connection pool per API instance, default maximum 10, with
bounded acquisition, statement, query, lock and idle-transaction timeouts. Calculate
`replicas × pool maximum + worker pools` against the database connection budget.
SIGTERM/SIGINT closes the server, pool and Redis clients. Do not use session-based
settings with a transaction-mode pooler without testing that provider's behavior.

`src/database/schema.ts` is a **partial read mapping**, derived from SQL 001, 002,
004, 024, 043 and 046. Existing `web/db/*.sql` remains authoritative for constraints,
RLS, functions and triggers. There are no automatic schema sync/migration commands.
Readiness checks representative table/column markers, the SQL 045 invoice-history
signature and SQL 046 nullable-email/intent/platform-role guard markers. Disabled auth
also keeps readiness at 503. This does not certify every migration or financial rule.

Tenant repositories run through `DatabaseService.asUser`: a transaction sets the
`authenticated` role and verified user claims locally, runs parameterized Drizzle SQL,
and clears state with COMMIT/ROLLBACK. Failed connections are discarded. Tests exercise
RLS and successful/failed session reuse. Repositories cannot access an unrestricted pool.
JWTs use signature/expiry/issuer/audience checks with cached public keys; legacy HS256
tokens are verified online through Supabase before claims are trusted.

## Request behavior and performance

- 1 MiB JSON body limit; strict DTO types/allowed fields; no implicit type coercion.
- Exact decimal strings for money, UTC ISO 8601 timestamps. PostgreSQL NUMERIC is
  not parsed into JavaScript Number. Legacy amounts/schema remain compatible.
- Stable error code/message, optional field/rule errors and server-generated request ID.
- Explicit web CORS origins; native Android does not depend on CORS. Proxy trust is
  off by default. `TRUST_PROXY_HOPS` requires a known, fixed proxy topology.
- Secure headers, `Cache-Control: no-store`, and request IDs on responses.
- Atomic shared Redis throttling across instances; bounded failures return 503.
  Single-process memory storage is only a development/test fallback. Health bypasses
  throttling. Per-phone/IP request and verification limits include resend/daily caps.
  Phone-link challenges are expiring, session-bound records shared through Redis.
- Structured request timings include query count/duration (using `timedQuery`), route
  template, status and response length. No raw URL query, body, token, SQL or bind
  values are logged. Database/Redis provider errors are not returned to clients.
- `@fastify/helmet`, Swagger static assets and `@fastify/multipart` are registered
  with this adapter. Future uploads must stream via Fastify multipart (one file,
  5 MiB maximum); Nest's Express/Multer interceptor is not used.

Keep future repositories explicit: bounded results, cursor pagination, selected
columns, SQL aggregates and shared access checks once per request. Do not fetch a
whole catalogue to display a page. Do not cache permissions across users or stale
entitlement changes. Measure before adding caches or increasing connection counts.

## Checks and artifacts

```bash
bun run check             # formatting, lint, typecheck, tests
bun run build            # production TypeScript output
bun run start            # run production output using local Node 24
bun run openapi          # regenerate ../docs/openapi.json from actual controllers
bun run benchmark ../docs/phase-1-local-baseline.json
```

Tests run real Fastify requests, real signed JWTs/local JWKS and disposable PGlite
metadata/account RLS fixtures. SMS is mocked. For cross-instance Redis integration,
point `TEST_REDIS_URL` at a **disposable test
Redis** before running tests; it creates short-lived random test keys. Without this
setting the two Redis integration cases are explicitly skipped. Other limiter/error cases
still run. Never provide a production URL to integration tests.

See [Phase 1 results and remaining staging checks](../docs/phase-1.md). The local
benchmark ignores real service credentials, performs no SMS or invoice writes,
and records its environment. It is not a production speed comparison. Business
performance budgets require authenticated legacy and replacement staging runs.
Existing-account bootstrap uses one bounded data SELECT without attempting an INSERT;
new profiles are created only when missing. Refresh performs no database queries.
Neither JWT public-key caching nor the Android client's future local cache stores
privileged membership/entitlement decisions on this server.

References: [Nest Fastify](https://docs.nestjs.com/techniques/performance),
[Nest throttling](https://docs.nestjs.com/security/rate-limiting),
[pg pooling](https://node-postgres.com/features/pooling),
[Drizzle existing PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-existing).
