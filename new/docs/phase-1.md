# Phase 1 implementation and measurements

Historical Phase 1 record, 23 November 2026. Phase 2 is now implemented separately;
see [Phase 2 notes](phase-2.md). The API foundation is implemented. Authenticated legacy
comparisons and staging service configuration remain open; Phase 1's entire
performance acceptance is not marked complete. The checks below describe the Phase 1 snapshot.

## Implemented

- NestJS/Fastify with strict TypeScript and Node 24.22.3, using an independent Bun
  workspace/lockfile under `new/`. Existing web dependencies remain separate.
- Validated settings, bounded PostgreSQL pool/timeouts, graceful shutdown, schema
  and database-role readiness checks. No migrations or production queries were run.
- Authentication guard denies protected routes until verified identity is implemented.
  Accounts and shops have module boundaries only; no invented success handlers.
- API versioning, strict DTO validation, stable safe errors, request IDs, exact money
  strings, UTC timestamps, CORS, secure headers and body/upload limits.
- Shared Redis rate limiting, no offline request queue, fail-closed behavior and
  automatic reconnect. Process liveness works even when dependencies are down.
- Generated [OpenAPI contract](openapi.json), development docs and request/query
  timing. Query counters cover operations wrapped in `timedQuery`; future repository
  methods must use it. There are no tenant business queries to instrument yet.
- Scripts for checks, source watching, API contract generation and isolated benchmarks.
  GitHub Actions runs checks against disposable Redis and checks the OpenAPI snapshot.

Health checks do not require authentication or return customer data. Readiness
requires the existing SQL 045 signature and representative schema markers, not a
new migration-history table. Workers are not dependencies until their phase starts.

## Verification

- Formatting, ESLint with zero warnings and strict type checking passed.
- 22 tests passed, zero skipped, using Node 24.22.3 and temporary Redis 8.12.0.
  The shared-store test sent 20 concurrent requests through two independent stores:
  exactly five passed a five-request limit; the limit cleared after expiry.
- HTTP tests cover healthy/unavailable dependencies, protected routes, validation,
  secret redaction, CORS, body limits, malformed JSON, throttling/outages, concurrent
  request metrics, streamed multipart limits and development/production docs behavior.
- A disposable PGlite metadata fixture exercised the actual readiness SQL for a
  compatible role/schema, an unsafe administrative role and a missing legacy column.
  This is a metadata contract test, not full legacy migration/RLS parity validation.
- TypeScript production compilation and generated OpenAPI completed successfully.
- The compiled server started over real HTTP: liveness returned 200, unconfigured
  readiness returned 503, and SIGTERM shut it down cleanly. Production startup with
  missing settings exited with code 1. OpenAPI regeneration matched its snapshot.
- A frozen-lockfile install from the `new/` workspace completed successfully.

The temporary Redis process is only for local integration verification. No local
system settings, SMS provider or live database configuration was changed. GitHub
Actions is configured but has not been executed remotely in this work.

## Measured local baseline

Full environment, counts, p50/p95/max latency, query counts and response sizes are
in [phase-1-local-baseline.json](phase-1-local-baseline.json). Reproduce from
`new/backend` with `bun run benchmark ../docs/phase-1-local-baseline.json`.

The recorded host was Linux x64, AMD Ryzen 5 3500U, Node 24.22.3. HTTP used localhost
without TLS, warmed requests, logging disabled and no external service calls.
PGlite initialization finished before HTTP measurement. This is a development-machine
sample, not a sustained production load test or a mobile-network measurement.

- Liveness, concurrency one: 100 requests, p95 **2.968 ms**, 15 response bytes, no queries.
- Liveness, concurrency ten: 1,000 requests, p95 **12.349 ms**, 15 response bytes, no queries.
- Disposable SQL datasets: small 100 products/300 invoices; medium 1,000/3,000;
  large 10,000/30,000. Ten warm samples per query pattern; one query each.
- Large synthetic inventory: whole-list response 1,027,789 bytes; selected 50-row
  first page 4,553 bytes. This illustrates the payload benefit to test during porting.
- Large synthetic invoice rows: 2,388,895 bytes; count/sum aggregate 43 bytes.
  Aggregate correctness for real periods, refunds and regular/used bills still
  requires business fixtures before adopting it.

The SQL patterns isolate full-list materialization versus bounded reads/aggregates.
They do **not** run the legacy loaders: their Supabase row caps, nested relations,
RLS, network, searches and rendering are not simulated. SQL pattern timings cannot
be presented as current-app timings or as an achieved business-feature speedup.

Use a provisional local liveness diagnostic target of p95 below 50 ms at concurrency
ten on this same host/configuration. Do not enforce noisy wall-clock thresholds in
unit CI. Business latency/query/payload budgets must follow staging measurements.

## Legacy findings that guide the next phases

These are source findings, not measured request timings:

- `web/src/lib/auth/user-flow.ts` sequences identity/profile, membership, shop/settings,
  platform and entitlement checks. `web/src/lib/workspace/get-workspace-data.ts` then
  fetches shop fields again. React request caching already exists; preserve useful
  deduplication while combining repeated reads and retaining all access rules.
- `web/src/app/inventory/load-inventory-data.ts` requests product `*`, nested variants,
  inventory items and movement types before client-side stock summaries. Port as
  bounded list/search/detail contracts with SQL summaries and selected columns.
- `web/src/app/billing/load-billing-data.ts` loads inventory for bill entry. Search
  stock on demand; keep used-phone stock separate and enforce that in SQL/API rules.
- `web/src/app/dashboard/load-dashboard-data.ts` downloads invoice rows for totals.
  Aggregate in SQL and fetch only the dashboard's visible rows, preserving periods
  and financial rules. Verify behavior beyond Supabase's configured result limit.

Do not add caches as a substitute for these query changes. Permission/entitlement
checks must remain correct after role changes, suspension or subscription expiry.

## Remaining Phase 1 staging acceptance

1. Supply a staging PostgreSQL direct/session-pool URL for the existing schema, a
   reviewed limited login and Redis. Check TLS, grants, RLS and readiness with actual
   services. Production startup rejects missing settings; local readiness stays 503
   without a database. No provider credentials were copied from the legacy app.
2. Establish representative small/medium/large **staging shops**, recording product,
   variant, serialized-unit, customer, movement and invoice counts, indexes and region.
3. Measure current sign-in, workspace bootstrap, inventory search, dashboard and bill
   creation. Include warm/cold runs, median/p95/max, failures, request/response bytes,
   SQL counts/durations and slow queries. Separate SMS/provider time from API time.
   Use at least 100 read samples and a controlled write sample with isolated stock.
4. Capture write baselines only in disposable staging with SMS/payment/notifications
   stubbed or test-configured. Do not create invoices, send OTPs or change stock in
   production for a benchmark. No authenticated staging session was available here.
5. Agree business budgets from that evidence, then repeat the same scenarios as API
   features arrive. The existing app stays live while these comparisons are completed.

Next implementation phase: verified Supabase phone OTP, profiles, sessions and
transaction-local user claims with pooled-connection RLS isolation tests. Its SMS
provider and compatibility migration are separate deliverables in [PLAN.md](../../PLAN.md).
