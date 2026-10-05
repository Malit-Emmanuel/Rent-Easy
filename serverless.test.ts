import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { createHmac } from 'crypto';

const t = process.env.DATABASE_URL ? test : test.skip;

t('serverless handler: health, cron auth (fails closed), raw-body webhook, bootstrap reuse', async () => {
  Object.assign(process.env, { JWT_SECRET: 'j'.repeat(40), OTP_PEPPER: 'p'.repeat(40), APP_ENV: 'test' });
  delete process.env.REDIS_URL; delete process.env.CRON_SECRET;
  const { default: handler } = await import('./serverless');
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = (p: string, headers: Record<string, string> = {}) => fetch(base + p, { headers });

  assert.equal((await get('/health')).status, 200);
  assert.equal((await get('/me')).status, 401);

  // CRON_SECRET unset: refuse everything, even with a plausible header
  assert.equal((await get('/internal/cron/purge-auth-data', { authorization: 'Bearer ' })).status, 401);
  process.env.CRON_SECRET = 'c'.repeat(40);
  assert.equal((await get('/internal/cron/purge-auth-data')).status, 401, 'no header');
  assert.equal((await get('/internal/cron/purge-auth-data', { authorization: 'Bearer wrong' })).status, 401);
  const ok = await get('/internal/cron/purge-auth-data', { authorization: `Bearer ${process.env.CRON_SECRET}` });
  assert.equal(ok.status, 200);
  const body: any = await ok.json();
  assert.equal(body.job, 'purge-auth-data'); assert.equal(typeof body.result.otp, 'number');
  assert.equal((await get('/internal/cron/not-a-job', { authorization: `Bearer ${process.env.CRON_SECRET}` })).status, 404);
  assert.equal((await get('/internal/cron/expire-verifications', { authorization: `Bearer ${process.env.CRON_SECRET}` })).status, 200);

  // A signed vendor webhook works through the serverless path, which proves the raw body reaches the signature check
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const phone = `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const uid = (await pool.query('INSERT INTO identity.users(phone) VALUES ($1) RETURNING id', [phone])).rows[0].id;
  const sid = `sls-${Date.now()}`;
  await pool.query(`INSERT INTO identity.verification_sessions (id, user_id, provider, status, provider_session_id) VALUES (gen_random_uuid(), $1, 'fake', 'IN_PROGRESS', $2)`, [uid, sid]);
  const rawBody = JSON.stringify({ eventId: `e-${sid}`, providerSessionId: sid, status: 'FAILED', reasonCode: 'liveness_failed' });
  const sig = createHmac('sha256', 'dev-only-fake-idv-secret').update(rawBody).digest('hex');
  const hook = (s: string) => fetch(base + '/webhooks/identity/fake', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': s }, body: rawBody });
  assert.equal((await hook('00')).status, 401);
  assert.equal((await hook(sig)).status, 200);
  assert.equal((await pool.query('SELECT status FROM identity.verification_sessions WHERE provider_session_id=$1', [sid])).rows[0].status, 'FAILED');

  await pool.end(); server.close();
});
