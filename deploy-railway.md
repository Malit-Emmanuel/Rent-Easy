# Deploying to Railway (ADR-0010)

Layout: Vercel (Next.js dashboard) -> Railway (API + Redis, one project, one environment) -> Supabase PostgreSQL.
Nothing here has been deployed yet. Items marked VERIFY must be checked on the first deployment, not assumed.

## Services
1. **API**: new service from the GitHub repo, root directory `apps/api`. Railway reads `apps/api/railway.json` (Dockerfile build, `/health` check, restart on failure).
2. **Redis**: add Railway's Redis to the same project and environment.

## Environment variables (API service)
| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase connection string with `?sslmode=require`. Use the pooled (session-mode) string if Railway cannot reach the direct address. VERIFY |
| `REDIS_URL` | Reference Railway's Redis variable, e.g. `${{Redis.REDIS_URL}}`. Prefer the private-network URL. VERIFY the exact variable name in the Railway dashboard |
| `REDIS_IP_FAMILY` | Leave empty. Set to `6` (or `0`) only if the API logs show it cannot reach Redis on the private network. VERIFY |
| `JWT_SECRET`, `OTP_PEPPER` | Long random values (32+ characters), different per environment |
| `APP_ENV` | `staging` (production is blocked while vendors are fake) |
| `CORS_ORIGINS` | Leave empty. The dashboard calls the API from its own server routes, not from browsers |
| `PORT` | Set by Railway; the API reads it |

Do not set `CRON_SECRET`: the cron endpoints are for the Vercel path and stay disabled.

## Migrations
Not part of the image. Apply `db/migrations/*.sql` in order to Supabase (Supabase `apply_migration`, or `npm run migrate` from a machine that can reach the direct connection). Then run `db/tests/rules_portable.sql` and expect `RULES: 10 passed, 0 failed`.

## First-deploy checklist
- [ ] Build succeeds from the Dockerfile (never run before; Docker was not available while writing it)
- [ ] `GET /health` is OK (it checks the database)
- [ ] Logs show both scheduled jobs ran (`expire-verifications`, `purge-auth-data`) so Redis is reachable
- [ ] Database connectivity from Railway works over the chosen Supabase connection string (direct vs pooled)
- [ ] Protected route without a token returns 401
- [ ] Send a signed test webhook to `/webhooks/identity/fake` and see 200 (raw body reaches the signature check)
- [ ] Dashboard `API_URL` points at the Railway public URL and sign-in works end to end

## Notes
- The API's public URL must stay reachable for vendor webhooks. Every other route needs a token.
- Several API replicas are fine: queue schedulers are keyed by name, so jobs are not duplicated.
- Cost and plan limits on Railway have not been checked; confirm before the pilot.

## Current state (2026-10-03)
- Railway project `rent-easy`, environment `staging`, personal workspace. Redis (Railway's verified template) is deployed with a generated password; its private-network `REDIS_URL` is available to reference from the API service.
- Redis was created in region `sfo` (San Francisco). The database is in Supabase eu-west-1 (Ireland) and users are in Kenya, so the plan is to run Redis and the API in a European region. Region choice is awaiting the founder's confirmation; Redis holds no data yet, so it can be recreated freely.
- The API service is not created yet: the GitHub repository must contain the code first, and Railway needs access to it.
