# DukaanHQ rebuild plan

Status: Phases 1–2 backend code implemented and locally tested. The existing
application remains in `web/`. Live SMS setup, SQL 046 rollout, authenticated staging
performance comparisons and agreed business response budgets remain pending.
The Android authentication test app is implemented early at the user's request;
Phase 3 onboarding and other clients remain pending. See `new/docs/phase-1.md`
and `new/docs/phase-2.md` for implementation evidence and remaining external checks.

## 1. Objective

Build a faster, easier daily workflow for shop owners through a native Android
application, a dedicated NestJS + TypeScript backend, and Next.js web applications.
Keep the existing PostgreSQL data, account IDs, shops, relationships, permissions,
inventory behavior, billing rules and subscription behavior compatible.

The current application remains runnable while the new applications are developed.
Performance improvements must be measured against the current app with comparable
data, hardware and network conditions. A framework change alone is not proof of improvement.

## 2. Repository structure

```text
dukaanhq/
  .git/                    Shared repository history
  .gitignore               Shared secret and build-output exclusions
  README.md                Workspace instructions
  PLAN.md                  This authoritative roadmap
  web/                     Existing application, unchanged business implementation
    src/
    public/
    db/                    Existing SQL plus reviewed rebuild compatibility migrations
    docs/
    tests/
    package.json
    bun.lock
    .env.local             Existing local settings, ignored by Git
  new/
    backend/               NestJS + TypeScript REST API and background workers
    android/               Kotlin + Jetpack Compose shop-owner app
    admin/                 Next.js + TypeScript owner and platform admin UI
    landing/               Next.js + TypeScript public website
    docs/                  Contracts, decisions, baselines and release notes
```

Git and environment-owned metadata stay at the root. Each application gets its
own settings, build commands and deployment configuration. Existing dependencies
and environment files stay with `web/`; new applications receive their own configuration.

There is one API implementation shared by Android and the new admin. Next.js route
handlers may manage web cookies and proxy authenticated requests. Business operations
such as stock changes, invoice creation and subscription decisions belong to the API.

## 3. Technology decisions

- Backend: NestJS and TypeScript on a supported Node.js LTS release, pinned when scaffolding.
- HTTP server: Nest's Fastify adapter; confirm required plugins and file-upload support in Phase 1.
- Database: existing PostgreSQL / Supabase project, tables, relationships and SQL functions.
- Data access: Drizzle with `node-postgres`, parameterized queries and a bounded connection pool.
- Identity: existing Supabase Auth, extended with phone OTP through a configured SMS provider.
- Background jobs: BullMQ and Redis when notification and document workers are introduced.
- Android: Kotlin, Jetpack Compose, Room for local read caches and WorkManager for scheduled sync.
- Web applications: Next.js, TypeScript and the existing styling conventions where useful.
- API contract: versioned REST endpoints under `/api/v1`, with generated OpenAPI documentation.
- Package management: retain Bun for the legacy app; use Bun workspaces for the new TypeScript
  applications after verifying Nest tooling compatibility. Run the backend on Node.js.
- Hosting: separate deployable API, worker, admin and landing applications. Keep the API and
  database geographically close, with staging and production configuration separated.

Start with one modular backend application. Separate modules by business responsibility;
introduce additional services only when measured operational needs justify them.

## 4. Compatibility rules

1. Preserve existing user UUIDs and references to `auth.users` and `profiles`.
2. Preserve current shop ownership, membership and suspension rules.
3. Keep the current one-shop-per-account behavior until a separate multi-shop change is agreed.
4. Preserve inventory identifiers, movement history, purchase records and invoice snapshots.
5. Keep regular and used-phone stock and bill histories separate.
6. Preserve invoice numbering, payment details, loan/EMI fields, signatures, stamps and footer behavior.
7. Preserve plan limits, trial eligibility, provider-verified approvals and entitlement expiry.
8. Preserve the payment-pricing safeguards already tested in the current application.
9. Keep existing SQL transaction functions for stock and billing during the first API migration.
10. Review any behavior mismatch before changing established financial or access rules.

Schema changes are limited to reviewed compatibility requirements and measured index needs.
For example, phone-only users need `profiles.email` to permit NULL while retaining uniqueness
for real emails. Do not create invented email addresses to satisfy the old constraint.
The discarded backend's migration drafts were removed. TypeScript Phase 2 now includes
tested SQL 046 for nullable profile emails, onboarding intent and platform-role protection.
It has not been applied live; review and apply it to staging before enabling phone signup.

The ORM must map the existing schema. Do not recreate production tables or run automatic
schema synchronization against the live database. Preserve functions, triggers and row-level
security policies in a single reviewed SQL migration history.

## 5. Delivery process

Work on one phase at a time. Before starting a phase, confirm its contract, preserved rules
and acceptance checks. On completion, record changes, checks, limitations and the next phase.
Keep deployment and database migration steps explicit. A folder, mock or placeholder does
not count as an implemented feature.

The first usable milestone is phone sign-in through approved shop onboarding and a basic
Android workspace shell. Inventory and billing follow after identity and shop access are tested.

## Phase 0 — Preserve the current application and prepare the repository

Status: folder reorganization completed; API foundation now implemented separately.

Deliverables:

- Keep all current application code, SQL, assets, docs, tests and local settings under `web/`.
- Keep `new/backend`, `new/android`, `new/admin`, `new/landing` and `new/docs` reserved for the rebuild.
- Remove the discarded backend source, virtual environment, local settings and SQL drafts.
- Preserve Git history at the repository root and keep credentials/build outputs ignored.
- Keep a single authoritative plan in this file.

Acceptance:

- Verify moved source files against their original content, allowing intentional workspace documentation changes.
- Confirm the existing application's tests resolve correctly from `web/`.
- Before the next deployment of the legacy app, change Vercel Root Directory to `web`.
  Its cron configuration remains in `web/vercel.json`.
- Do not point production at an unimplemented replacement app.

## Phase 1 — Backend foundation and performance baseline

Status: foundation, generated API contract, automated checks and isolated local
benchmarks implemented. Authenticated legacy comparisons, staging connection/grant
verification and business performance budgets remain open. No live database changes
were applied. Implementation details and measurements: [Phase 1 notes](new/docs/phase-1.md).

Deliverables:

- Scaffold the NestJS app in `new/backend` with TypeScript strict mode and Fastify.
- Add modules for configuration, database access, authentication, accounts and shops.
- Add environment validation, connection pooling, timeouts and graceful shutdown.
- Establish a consistent error response with a stable error code, message, field errors
  when applicable, and a request ID. Exclude credentials and provider internals from responses.
- Add DTO validation, consistent money/date serialization and API versioning.
- Add OpenAPI JSON and interactive development documentation.
- Configure CORS for the intended web clients, secure response headers, body-size limits
  and distributed rate limiting for sensitive routes.
- Add test fixtures, formatting, linting, type checking and automated test commands.
- Map the existing database without modifying the live schema.

Initial routes:

- `GET /health/live` — process liveness, independent of external services.
- `GET /health/ready` — required database, migration and worker dependencies are ready.
- `GET /api/openapi.json` — generated versioned API contract.
- `GET /api/docs` — development API documentation.

Performance baseline:

- Measure current sign-in, workspace bootstrap, inventory search, dashboard and bill creation.
- Use representative small, medium and large shop datasets; record their sizes.
- Record API latency, query count, query duration and response size, including slow requests.
- Agree on measurable response-time budgets using that baseline and a defined test environment.
- Identify repeated sequential access checks and oversized inventory/dashboard responses before porting them.

Acceptance: the backend starts predictably, fails clearly on missing production configuration,
passes its basic checks, and returns no customer data from unauthenticated health routes.

## Phase 2 — SMS OTP authentication, profiles and sessions

Status: nine routes implemented; 56 local tests passed including actual Redis,
signed JWTs and disposable PostgreSQL/RLS fixtures. Twilio/Supabase were inspected
read-only: existing Twilio credentials are valid, but Supabase phone auth is disabled.
SMS sender/provider setup, direct staging database configuration, SQL 046 rollout and
real test-number delivery/linking acceptance remain pending. No SMS was sent and no
live schema was changed. See [Phase 2 notes](new/docs/phase-2.md).

User flow:

1. Enter a phone number with country code.
2. Request an SMS OTP.
3. Enter and verify the OTP.
4. Existing users with a verified phone resume their account.
5. Users with an incomplete profile enter their name.
6. The API returns the next action and permitted choices for that account.

Keep Supabase Auth as the identity/session authority so user IDs and existing database
references remain compatible. Configure its SMS provider; reuse existing provider accounts
only where SMS is actually configured. Existing WhatsApp delivery is not evidence that
SMS OTP is enabled. Twilio Programmable Messaging is the selected Supabase SMS provider;
existing Account SID/Auth Token can be reused, with an SMS-capable sender/Messaging Service.
Development tests use provider mocks or configured test numbers.

Routes:

- `POST /api/v1/auth/otp/request` — validate the number, request SMS and return a generic response.
- `POST /api/v1/auth/otp/verify` — verify the code and return a session plus account bootstrap.
- `POST /api/v1/auth/session/refresh` — rotate tokens through the identity provider.
- `POST /api/v1/auth/session/logout` — revoke the relevant refresh session.
- `GET /api/v1/auth/me` — current profile, minimal membership/access data and next action.
- `PATCH /api/v1/auth/profile` — complete or update the permitted name field.
- `PATCH /api/v1/auth/intent` — record owner/staff intent without granting a role.
- `POST /api/v1/auth/phone/link/request` — authenticated existing user requests phone linking.
- `POST /api/v1/auth/phone/link/verify` — verify linking while preserving the original user ID.

Rules:

- Use normalized international phone numbers and provider-configured OTP length/expiry.
- Add per-number, per-IP and daily request/verification limits, plus provider abuse controls.
- Do not reveal whether an account exists before ownership of the number is verified.
- Verify JWT signature, expiry, issuer and audience. Cache public signing keys, not privileged decisions.
- Handle legacy signing-key compatibility deliberately; never trust decoded but unverified claims.
- Keep user sessions isolated. Do not store one user's token on a shared mutable SDK client.
- Never log OTPs, access tokens or refresh tokens, and never return codes from production APIs.
- Return token responses with caching disabled.
- Store Android refresh credentials using appropriate platform-backed protection.
- Use secure HttpOnly cookies and appropriate CSRF protection for browser sessions.
- Existing Google accounts without a linked phone need authenticated phone verification.
  A shop's contact number is not proof of ownership and cannot automatically merge accounts.

Proposed `next_action` values:

- `complete_profile` — name is missing.
- `choose_role` — choose the intent to register a shop or join as staff.
- `select_plan` — a subscription/trial approval is required.
- `shop_onboarding` — eligible to create the shop.
- `workspace` — active membership and product access exist.
- `account_suspended` — account or shop access is suspended.
- `manage_subscription` — existing shop access requires subscription action.
- `join_staff` — staff intent selected; an invitation/approval is still required.
- `platform_admin` — existing trusted superadmin profile; never self-selected.

Refresh returns only the rotated session so it does not depend on a database/bootstrap
round trip. OTP verification and phone linking return session plus bootstrap; `/auth/me`
loads current access. The current API uses bearer credentials. Browser HttpOnly cookie/CSRF
handling belongs to the new admin's same-origin session layer when that client is built.

Choosing Owner or Staff records intent. Ownership is granted by successful shop creation;
staff membership requires an invitation/approval. Platform administrator access is never self-selected.

Acceptance: test new/existing users, incorrect and expired OTPs, resend limits, malformed numbers,
wrong-user linking, invalid/expired tokens, refresh retries, logout, profile completion and session isolation.

## Phase 3 — Plans, provider approval and atomic shop onboarding

Preserve the current sequence: select a plan → receive a valid trial/payment approval →
create the shop. Both trial and paid access follow the existing provider-backed rules.

Routes:

- `GET /api/v1/plans` — public active plans, prices, features and advertised trial information.
- `POST /api/v1/subscriptions/intents` — record the authenticated user's permitted plan selection.
- `POST /api/v1/subscriptions/checkout` — create a verified provider checkout.
- `GET /api/v1/subscriptions/intents/:id` — return only that user's intent/approval state.
- `POST /api/v1/webhooks/dodo` — verify and process the provider's signed events.
- `GET /api/v1/shops/onboarding/eligibility` — explain the next required step.
- `GET /api/v1/shops/slug-availability?slug=...` — validate and check a public shop slug.
- `POST /api/v1/shops/onboarding` — atomically create the approved shop and dependencies.

Onboarding must create or update the shop, owner membership, shop settings, subscription,
entitlement and consumed approval record in one transaction. Concurrent requests/retries
must not create multiple shops or consume an approval twice.

Retain existing business contact, address, location and invoice-setting fields. Require a
completed name and derive ownership from the verified session. Block an account already linked
to a shop, reserved/taken slugs, expired approvals and another user's approval.

Preserve Dodo safeguards: correct currency/minor units, amount, recurrence, environment,
product mapping and eligible discounts before checkout. Deduplicate webhook events and
handle replay/out-of-order delivery. A browser return URL is not proof of payment.
Keep trial eligibility and price changes consistent with the current implementation.

Acceptance: valid onboarding, missing/expired approval, forged owner/plan fields, taken slugs,
duplicate submissions, downstream transaction failure, webhook replay and provider outages.
Do not enable the new onboarding flow until its required checkout/approval path is usable.

## Phase 4 — Android sign-in and onboarding app

Status: authentication subset implemented early, before Phase 3, at the user's request.
The Kotlin/Compose app connects to Phase 2 OTP, profile, intent, session and phone-link
APIs, with the existing logo, light/dark themes and short transitions. It supports local
debug-server configuration, country-aware phone input, secure sessions and honest
pending/blocked account states. See `new/android/README.md` and `new/docs/SMS_SETUP.md`.
Plan/checkout/shop creation screens, Google OAuth entry, native CAPTCHA and real-device/SMS
acceptance remain pending. The complete Android onboarding milestone is not finished.

Create the Kotlin / Jetpack Compose project once the authentication contract is stable.
Build reusable loading, error and retry states instead of tying every screen to a fresh network response.

Screens:

- Phone entry with country code and numeric validation.
- OTP entry, resend cooldown and verification feedback.
- Name entry for incomplete profiles.
- Register-shop or join-staff choice.
- Plan selection and checkout/approval status.
- Shop details, business contact, location and invoice settings.
- Workspace shell, expired-access state, suspension state and logout.

Implement secure credential persistence, coordinated refresh, app restart recovery and
provider-return deep links. Add the verified-phone linking path for existing accounts.
Expose staff joining only when the invitation endpoints in Phase 8 are ready.

Acceptance: exercise the complete flow on a real Android device, including process death,
slow network, offline startup, expired credentials and returning from provider checkout.

## Phase 5 — Inventory and customer APIs

Port the existing product kinds, brand/category choices, variants, images, stock identifiers,
quantity-based stock and serialized stock. Preserve adjustment, damage, return and reversal history.
Reuse the current RAM/storage choices and allow manual brand/storage entry where already supported.

Routes:

- `GET/POST /api/v1/products` and `GET/PATCH/DELETE /api/v1/products/:id`.
- `GET/POST /api/v1/products/:id/stock`.
- `POST /api/v1/stock/adjustments` and `POST /api/v1/stock/adjustments/:id/reversal`.
- `GET /api/v1/brands`, `GET /api/v1/categories` and permitted creation endpoints.
- `GET/POST /api/v1/customers` and `GET/PATCH /api/v1/customers/:id`.
- Upload endpoints for validated files using the appropriate storage access policy.

List responses contain small summaries and stable pagination. Fetch images, exact IMEIs,
stock movements and other detail only when the user opens the corresponding screen.
Keep stock counts in database queries; do not load entire histories to calculate a list count.

Acceptance: tenant isolation, role/plan limits, duplicate identifiers, concurrent adjustments,
safe deletion rules, searchable pagination and parity with current inventory tests.

## Phase 6 — Used-phone purchase and stock management

Keep the separate Used Phones area and its minimal data collection:

- Seller name, country code and 10-digit seller number.
- Purchase source dropdown/history and manual entry.
- Purchase date, purchase price and selling price.
- Brand dropdown/manual entry, model, RAM/storage and colour.
- IMEI 1 and an optional second IMEI; each entered/scanned IMEI has exactly 15 digits.
- Optional original purchase invoice. Keep it private and owner-accessible.

Routes:

- `GET/POST /api/v1/used-phones`.
- `GET /api/v1/used-phones/:id` — authorized purchase/stock details.
- `GET /api/v1/used-phones/:id/purchase-invoice` — authorized short-lived document access.

Preserve individual device tracking, seller purchase history and sale-bill linking.
Reject duplicate IMEIs across either slot. Reject longer scanned identifiers instead of
silently truncating them. Keep seller details out of the buyer invoice.

Acceptance: minimal form behavior, scanner validation, owner-only seller/document access,
atomic stock creation, duplicate protection and private upload cleanup on failure.

## Phase 7 — Billing, invoices, payments and Android daily sales

Port the current customer, product, payment-method, loan/EMI, signature, stamp, footer,
invoice-date, download and sharing workflows. Regular billing uses regular stock;
used billing offers available used stock and clearly labels the used phone on the bill.

Routes:

- `GET /api/v1/invoices?scope=regular|used&cursor=...&search=...&period=...`.
- `POST /api/v1/invoices` — create an invoice using the correct stock scope.
- `GET/PATCH/DELETE /api/v1/invoices/:id` — preserve existing edit/delete/restock semantics.
- `GET /api/v1/invoices/:id/pdf` — authorized current invoice output.
- `POST /api/v1/invoices/:id/delivery` — permitted download/send work.

Requirements:

- Keep invoice creation and stock consumption atomic, with row locks where required.
- Add an idempotency key for sale creation; retries must return the original result.
- Assign final invoice numbers on the server and keep numbering safe under concurrency.
- Document current price, discount, tax and rounding behavior. Compare server and PDF totals;
  bring inconsistencies for review before changing financial behavior.
- Preserve snapshots so editing a product does not rewrite old bills.
- Preserve edit restrictions on already-sold serialized units and the restock choice on deletion.
- Retain 30-item cursor batches, infinite scrolling, full-filter totals and full-history search.
- Display Used phone in preview, details and generated PDF, including regenerated old downloads.
- Provide clear saved/delivery-failed states so a PDF or WhatsApp failure does not cause another sale.

Build Android stock search, product details, camera scanning, buyer entry, billing,
bill history, PDF viewing and sharing against these endpoints.
Cache read data locally and save unfinished drafts. Initial offline support covers reads
and drafts; final sale commitment and numbering require server confirmation.

Acceptance: concurrent sales of one IMEI, retry after timeout, insufficient stock, mixed scopes,
invalid totals, saved snapshots, edit/restock behavior, large history pagination and real-device PDF/scanning.

## Phase 8 — Staff, settings, dashboard and reporting

Port staff invitation, acceptance, suspension and removal, with the current role and plan limits.
Invitation acceptance must verify the intended recipient; choosing Staff cannot grant membership.
Audit sensitive changes and reject access promptly when a membership is suspended.

Routes:

- `GET/POST /api/v1/staff/invitations` and `POST /api/v1/staff/invitations/:id/accept`.
- `GET /api/v1/staff` and permitted role/status changes.
- `GET/PATCH /api/v1/shops/current/settings`.
- Shop logo/stamp and permitted profile upload endpoints.
- `GET /api/v1/dashboard` — database-aggregated totals and small recent lists.
- `GET /api/v1/reports/sales` and authorized exports.

Use database aggregates across all matching records for totals; do not download the whole
invoice table to sum it in the application. Preserve India-calendar reporting boundaries.
Avoid heavy profile synchronization and repeated settings reads on each screen request.
Cache slowly changing data only with a defined freshness/invalidation policy.

Acceptance: owner/staff/platform-role boundaries, revoked access, plan limits, complete
report totals, date boundaries and responsive dashboard loading on large datasets.

## Phase 9 — Background delivery and subscription operations

Port WhatsApp invoices, email invitations, EMI reminders, PDF preparation where appropriate,
subscription reconciliation and scheduled operations into durable worker jobs.

- Use Redis/BullMQ with bounded retries, deduplication and recorded outcomes.
- Keep request acknowledgements separate from eventual external-delivery outcomes.
- Retain entitlement checks, approved recipient/template behavior and reminder schedules.
- Handle invalid/missing provider configuration clearly without claiming successful delivery.
- Preserve cancellation, renewal, plan-change timing, grace periods and failed-payment handling.
- Keep test and live provider credentials and identifiers separated.
- Ensure scheduled work has one active owner during migration so reminders are not sent twice.

Acceptance: provider timeout, worker retry/restart, repeated event/job, cancelled subscription,
expired access, failed PDF generation and visible delivery failure/retry handling.

## Phase 10 — Next.js admin and landing applications

Build `new/admin` against the same versioned API after the core modules are ready.
Cover shop dashboards, inventory, used phones, billing, customers, staff, settings and subscription UI.
Keep SaaS platform administration behind its separate server-verified role: shop management,
plan editing, subscription health, reports, support/operations and audit history.

Build `new/landing` for marketing, active pricing, contact and existing legal pages.
Use appropriate static rendering/caching for public content. Keep account-specific responses private.
Preserve existing public shop/profile pages or provide deliberate redirects before cutover.

Create typed web API clients from OpenAPI and use the same response meanings on Android.
Keep the API authoritative for permission checks, prices, stock and totals.

Acceptance: owner and platform-admin permission tests, responsive layouts, keyboard behavior,
cookie/refresh/CSRF behavior, shared API compatibility and public-route redirect coverage.

## Phase 11 — Performance, migration and release

Verify the agreed performance budgets using the Phase 1 datasets and network conditions.
Measure warm and cold requests separately, including real-device startup, scrolling,
inventory search, stock detail, dashboard, bill commitment and PDF delivery.

Before release:

- Run business-rule parity and database integration tests against a staging copy of the existing schema.
- Test tenant isolation, role revocation, token rotation, webhook replay and concurrent stock operations.
- Verify backups and restoration, migration ordering and rollback steps.
- Exercise SMS, payments, file access, camera scanning and notifications in the intended test environments.
- Release Android to an internal test group; collect slow requests, crashes and workflow feedback.
- Roll out the new admin/API gradually and keep the legacy application available for rollback.
- Switch scheduled jobs and webhooks deliberately to prevent duplicate processing.
- Confirm historical data, public URLs, invoice downloads, numbering and access remain correct.
- Retire the old application only after the replacement workflows are accepted.

## 6. Completion gates and progress tracking

- [x] Preserve the current project in `web/`.
- [x] Create the replacement project directories.
- [x] Remove the discarded backend implementation and its local dependencies/settings.
- [x] Record the NestJS + TypeScript phased plan.
- [x] Implement and locally verify the Phase 1 backend foundation and isolated benchmark harness.
- [ ] Finish Phase 1 authenticated staging baselines and agree business performance budgets.
- [x] Implement and locally test Phase 2 phone authentication, profile/session and existing-account linking APIs.
- [ ] Complete Phase 2 SMS/provider setup, SQL 046 staging rollout and live test-number acceptance.
- [ ] Complete Phase 3 provider approval and shop onboarding.
- [x] Build the early Android phone-authentication test app and branded UI.
- [ ] Complete Phase 4 Android identity/onboarding screens.
- [ ] Complete Phases 5–8 business APIs and daily mobile workflows.
- [ ] Complete Phase 9 durable delivery and subscription operations.
- [ ] Complete Phase 10 web applications.
- [ ] Complete Phase 11 measured acceptance and staged release.

Every implementation phase should produce runnable code, tests, setup instructions,
an updated API contract, and clear deployment requirements. Record incomplete external
configuration and device verification separately from successful local checks.

## 7. Decisions to confirm when their phase begins

- Twilio SMS provider is selected; complete its sender/Messaging Service and Supabase configuration.
- The final API/worker hosting platform and its region relative to PostgreSQL.
- Package/runtime versions supported at implementation time.
- Performance budgets after profiling representative datasets.
- Native offline-sale support beyond the initial read-cache/draft scope, if needed later.
- Any intentional changes to staff permissions, multi-shop support or financial calculations.

Resolve these decisions in their corresponding phase. Phase 1 implementation has
started; unfinished external checks are recorded in `new/docs/phase-1.md`.

## 8. Technical references

- [NestJS first steps](https://docs.nestjs.com/first-steps)
- [NestJS Fastify adapter](https://docs.nestjs.com/techniques/performance)
- [Drizzle with an existing PostgreSQL database](https://orm.drizzle.team/docs/get-started/postgresql-existing)
- [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
- [Android offline-first architecture](https://developer.android.com/topic/architecture/data-layer/offline-first)
- Current business implementation and SQL: `web/src`, `web/db`, `web/docs` and `web/tests`.
