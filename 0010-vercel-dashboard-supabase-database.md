# ADR-0010 Dashboard on Vercel, database on Supabase; API host still open

Status: Accepted (dashboard, database), Open (API host) | Date: 2026-10-01 | Supersedes the hosting part of ADR-0002

## Decision
- The Next.js dashboard (`apps/web`) is hosted on Vercel.
- The primary database is Supabase Postgres + PostGIS, used as plain managed Postgres. We keep our own OTP login (ADR-0008) and our API
  does all authorisation. No Supabase Auth, no browser access to the database.
- The dashboard never talks to the database. It talks to our NestJS API through its own server routes (a backend-for-frontend),
  which keep tokens in httpOnly cookies.
- Environment is `APP_ENV` (and `VERCEL_ENV`), not `NODE_ENV`, because Vercel sets NODE_ENV=production on previews too.

## Decided (2026-10-02): the NestJS API runs on a container host (Option A)
- The API ships as a container (`apps/api/Dockerfile`). Queue workers (BullMQ on Redis) run inside it when `REDIS_URL` is set, and can be split into their own container later.
- The dashboard reads the API address from `API_URL`.
- The Vercel-function path (`apps/api/api/index.ts`, `vercel.json`, `/internal/cron/*`) is kept in the repo as an unused option and is not deployed.
- Container provider: **Railway** (decided 2026-10-02), running the API service and Redis in one project and environment. See `docs/deploy-railway.md`.
- Note for connecting to Supabase from a container: as far as I know the direct database address is IPv6 only on the standard plan, and many container hosts are IPv4 only. If so, use Supabase's pooled connection string (session mode) for the API and keep the direct connection for migrations. Verify on first deploy.

## Known limits and things to verify
- The Vercel account seen by Claude is a personal Hobby plan. As far as I know Hobby is for non-commercial use, so a paying pilot should run on a paid team plan. Confirm current terms.
- Supabase is not connected yet. Our migrations are untested on Supabase (extension schemas, `digest()` lookup, direct vs pooled connections).
- Choose Vercel and Supabase regions close to each other and to Kenya; cross-border handling of Kenyan personal data is still for counsel (ADR-0002). No real ID data until confirmed.

## Applied on 2026-10-02
- Supabase development project `<supabase-dev-project-ref>` (region eu-west-1, Ireland; Postgres 17) now holds migrations 0001-0004.
- `db/tests/rules_portable.sql` ran on it: 10 passed, 0 failed (rolled back, no test data left).
- Supabase security advisor: 23 informational notes, all "RLS enabled, no policies". This is intentional: deny-all for Supabase's API roles; our API connects as the owner and does authorisation.
- Two warnings concern `public.rls_auto_enable()`, a function we did not create. We have not changed it; owner to decide.
- Migration 0001 was edited once (extensions moved to the `extensions` schema, `search_path` pinned on every function) before any shared database held it. From now on applied migrations are never edited.
- This project is for development with test data only. The pilot database needs a region decision and counsel's view on cross-border handling (ADR-0002).

## Update 2026-10-02: function lock-down
`public.rls_auto_enable()` is Supabase's helper for its `ensure_rls` event trigger (it turns on row security for new tables in `public`). Migration 0005 removed EXECUTE from PUBLIC, anon and authenticated.
Verified on the development project: the advisor warnings disappeared, and new `public` tables still get RLS automatically (checked before and after).

## Update 2026-10-02: Railway
API and Redis run on Railway. Networking behaviour is to be verified on the first deployment, not assumed: whether the API reaches Redis over the private network (`REDIS_IP_FAMILY` option exists if it needs IPv6), and whether Railway can reach Supabase's direct address or needs the pooled one.
