import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from '../../test-utils/http';

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const redisTest = process.env.DATABASE_URL && process.env.REDIS_URL ? test : test.skip;
const until = async (fn: () => Promise<boolean>, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

dbTest('purge removes only stale OTP and refresh-token rows', async () => {
  const h = await bootApp();
  try {
  const { JobsService } = await import('./jobs.service');
  const jobs = h.app.get(JobsService);
  const u = await h.login();
  const uid = await h.userId(u.p);
  const oldP = h.newPhone(), newP = h.newPhone();
  await h.pool.query(`INSERT INTO identity.otp_challenges (id, phone, code_hmac, expires_at, created_at) VALUES
    (gen_random_uuid(), $1, 'x', now(), now() - interval '2 days'), (gen_random_uuid(), $2, 'x', now() + interval '5 minutes', now())`, [oldP, newP]);
  const stale = (await h.pool.query(`INSERT INTO identity.refresh_tokens (family_id, user_id, token_hash, expires_at) VALUES
    (gen_random_uuid(), $1, decode(md5(random()::text || clock_timestamp()::text), 'hex'), now() - interval '10 days') RETURNING token_hash`, [uid])).rows[0].token_hash;
  const live = (await h.pool.query(`INSERT INTO identity.refresh_tokens (family_id, user_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, decode(md5(random()::text || clock_timestamp()::text), 'hex'), now() + interval '20 days') RETURNING token_hash`, [uid])).rows[0].token_hash;
  const out: any = await jobs.handlers['purge-auth-data']();
  assert.ok(out.otp >= 1 && out.refreshTokens >= 1);
  assert.equal((await h.pool.query(`SELECT 1 FROM identity.otp_challenges WHERE phone=$1`, [oldP])).rowCount, 0);
  assert.equal((await h.pool.query(`SELECT 1 FROM identity.otp_challenges WHERE phone=$1`, [newP])).rowCount, 1);
  assert.equal((await h.pool.query(`SELECT 1 FROM identity.refresh_tokens WHERE token_hash=$1`, [live])).rowCount, 1, 'live token kept');
  assert.equal((await h.pool.query(`SELECT 1 FROM identity.refresh_tokens WHERE token_hash=$1`, [stale])).rowCount, 0);
  } finally { await h.close(); }
});

redisTest('scheduler registers, and a queued job runs through Redis and does real work', async () => {
  const h = await bootApp();
  const { JobsService } = await import('./jobs.service');
  const jobs = h.app.get(JobsService);
  const names = await jobs.schedulerNames();
  assert.deepEqual(names.sort(), ['expire-verifications', 'purge-auth-data']);

  const u = await h.login(); const uid = await h.userId(u.p);
  const id = (await h.pool.query(`INSERT INTO identity.verification_sessions (id, user_id, provider, status, provider_session_id, expires_at)
    VALUES (gen_random_uuid(), $1, 'fake', 'IN_PROGRESS', $2, now() - interval '1 hour') RETURNING id`, [uid, 'stale-' + uid])).rows[0].id;
  await jobs.runNow('expire-verifications');
  const done = await until(async () => (await h.pool.query('SELECT status FROM identity.verification_sessions WHERE id=$1', [id])).rows[0].status === 'EXPIRED');
  assert.ok(done, 'worker expired the stale session');
  await assert.rejects(() => jobs.runNow('nope'), /Unknown job/);
  await h.close();
});

test('without REDIS_URL, jobs are disabled rather than crashing', async () => {
  const { JobsService } = await import('./jobs.service');
  const saved = process.env.REDIS_URL; delete process.env.REDIS_URL;
  try {
    const j = new JobsService({} as any, {} as any);
    await j.onModuleInit();
    await assert.rejects(() => j.runNow('purge-auth-data'), /disabled/);
    assert.deepEqual(await j.schedulerNames(), []);
  } finally { if (saved) process.env.REDIS_URL = saved; }
});

test('an unreachable Redis does not block or crash startup', async () => {
  const { JobsService } = await import('./jobs.service');
  const saved = process.env.REDIS_URL; process.env.REDIS_URL = 'redis://127.0.0.1:1';   // nothing listens here
  try {
    const j = new JobsService({} as any, {} as any);
    const t0 = Date.now(); await j.onModuleInit();
    assert.ok(Date.now() - t0 < 8000, 'startup returned promptly');
    await assert.rejects(() => j.runNow('purge-auth-data'), /disabled/);
    await j.onModuleDestroy();
  } finally { if (saved) process.env.REDIS_URL = saved; else delete process.env.REDIS_URL; }
});
