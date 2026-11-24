# DukaanHQ workspace

The current Next.js application is preserved in `web/`. Its replacement is being built
in `new/`: a NestJS + TypeScript API, a Kotlin Android app, a Next.js admin, and
a Next.js landing site, using the existing PostgreSQL database.
Git and environment-owned workspace metadata stay at the repository root.

## Projects

- `web/`: current working application, SQL migrations, documentation and tests.
- `new/backend/`: NestJS + TypeScript API foundation and Phase 2 phone authentication.
- `new/android/`: Kotlin / Jetpack Compose authentication test app and debug APK build.
- `new/admin/`: replacement Next.js admin, scheduled after API foundations.
- `new/landing/`: replacement public site.
- `new/docs/`: migration plan, architecture decisions and API contracts.

See [PLAN.md](PLAN.md) for the detailed phases, API routes, rules, tests and
release criteria. The API foundation, tests and isolated local benchmarks are
implemented. Phase 2 OTP/session/profile/linking endpoints are implemented and tested;
live SMS requires Twilio/Supabase setup and the reviewed SQL 046 compatibility migration.
Authenticated staging performance comparisons remain pending.
See [backend setup](new/backend/README.md), [Phase 1 results](new/docs/phase-1.md)
and [Phase 2 routes and Twilio setup](new/docs/phase-2.md).
For hands-on testing, follow [the easy SMS/env guide](new/docs/SMS_SETUP.md) and
[Android build/install instructions](new/android/README.md). The mobile app includes
phone OTP, profile/intent setup, encrypted sessions and current account/access states.

## Run the existing web application

```bash
cd web
bun install
bun dev
```

Existing environment files, dependencies, and build cache moved with the app.
For Vercel, change the project's Root Directory to `web` before deploying this
repository layout. `web/vercel.json` retains the existing cron configuration.
The repository reorganization does not deploy or change the live database.
