# Kenya Housing Connection Platform

Trusted transaction infrastructure for housing in Kenya. Spine: Discover, Verify, View, Apply, Sign, Pay, Record.
Source of truth: *Development Execution Plan v1.0* (28 Sep 2026). Scope guard: `docs/NOT_IN_V1.md`.

## Status: Milestone M0 (Foundations), in progress
Done and verified: schema applied to Postgres+PostGIS and rule-tested (db/tests/rules.sql), migration runner, config validation, event bus, consent logic, RBAC guard, audit service, provider ports, money helper. See docs/adr for recorded decisions.
provider ports and fake adapters, money helpers (tested).
Done: B1 foundations and most of B2 (OTP login, rotating sessions, organisations, staff invitations, profile, vendor-neutral ID-verification layer with fake adapter, background job queue). 55 tests. Next: Next.js dashboard shell, admin shell, then B3 (see build plan).

## Run
    docker compose up -d          # starts Postgres+PostGIS and Redis
    cd apps/api && cp ../../.env.example .env && npm install && npm run migrate
    npm test && npm run build && npm run dev     # GET :3000/health

## Design rules enforced in code
- Money = integer minor units (bigint), never floats.
- Audit log and ledger are append-only (DB triggers); audit rows are hash-chained.
- Ledger is double-entry and must balance per transaction at commit.
- A listing cannot be published without all five cost rows (zero allowed).
- Badges carry expiry; revocation needs a reason code.
- Every vendor sits behind a port in `apps/api/src/providers`.


## Jobs
Background jobs run on BullMQ when `REDIS_URL` is set (verification-session expiry every 10 min, auth-data purge daily). If Redis is missing or unreachable the API still starts and jobs are disabled with a logged warning.

## Deploying the API as a container on Railway (ADR-0010; full steps in docs/deploy-railway.md)
1. Build: `docker build -t khp-api apps/api` (the image installs production dependencies only and runs as a non-root user).
2. Run with the environment variables from `.env.example`: DATABASE_URL (Supabase connection string with `?sslmode=require`; pooled if the host is IPv4-only), REDIS_URL, JWT_SECRET, OTP_PEPPER, CORS_ORIGINS, APP_ENV=staging.
3. Apply migrations separately (Supabase `apply_migration` or `npm run migrate` against a direct connection); the image does not contain them.
4. Check `GET /health`. The container's health check calls it.
5. The dashboard (`apps/web`) deploys to Vercel with `API_URL` pointing at the container.

## Database: Supabase (ADR-0010)
Apply `db/migrations/*.sql` in order (the Supabase `apply_migration` tool or `npm run migrate` on a direct connection).
Check any database with `db/tests/rules_portable.sql`: it rolls back and reports `RULES: N passed, M failed` in its final error message.
The API connects as the database owner with its own authorisation; RLS is enabled with no policies as a second layer.

## Dashboard (apps/web, Next.js, deploys to Vercel)
`cd apps/web && cp .env.example .env.local && npm install && npm run dev` (needs the API running; set `API_URL`, and `COOKIE_SECURE=false` for local http).
Sign-in with phone OTP, home, organisations (members, invitations), ID-verification status, reviewer queue. English and Swahili.
The browser never sees tokens: server routes keep them in httpOnly cookies and forward only allow-listed paths to the API.
