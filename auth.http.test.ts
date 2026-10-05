import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';

// HTTP integration tests against a real, migrated Postgres. Skipped when DATABASE_URL is unset.
const url = process.env.DATABASE_URL;
const t = url ? test : test.skip;

Object.assign(process.env, {
  JWT_SECRET: 'j'.repeat(40), OTP_PEPPER: 'p'.repeat(40), OTP_RESEND_COOLDOWN_SEC: '0', NODE_ENV: 'test',
});

const phone = () => `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

t('auth flow, session security and cross-tenant access over HTTP', async (ctx) => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module');
  const { SMS_PORT } = await import('../../providers/ports');
  const { PG_POOL } = await import('../audit/audit.service');
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const sms: any = app.get(SMS_PORT), pool: any = app.get(PG_POOL);

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) as any };
  };
  const lastCode = (p: string) => sms.outbox.filter((m: any) => m.to === p).pop().body.match(/\d{6}/)[0];
  const login = async (p = phone(), deviceId?: string) => {
    assert.equal((await call('POST', '/auth/otp/request', { phone: p })).status, 200);
    const r = await call('POST', '/auth/otp/verify', { phone: p, code: lastCode(p), deviceId });
    assert.equal(r.status, 200); return { p, ...r.body };
  };

  await ctx.test('health is public; everything else needs a token', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/me', undefined, 'garbage')).status, 401);
  });

  await ctx.test('login works, /me returns roles, invalid phone rejected', async () => {
    const s = await login();
    const me = await call('GET', '/me', undefined, s.accessToken);
    assert.equal(me.status, 200); assert.deepEqual(me.body.platformRoles, ['tenant']);
    assert.equal((await call('POST', '/auth/otp/request', { phone: '12345' })).status, 400);
  });

  await ctx.test('OTP locks after 5 wrong guesses, even if the right code follows', async () => {
    const p = phone(); await call('POST', '/auth/otp/request', { phone: p });
    const good = lastCode(p), bad = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/otp/verify', { phone: p, code: bad })).status, 401);
    assert.equal((await call('POST', '/auth/otp/verify', { phone: p, code: good })).status, 401);
  });

  await ctx.test('OTP is single-use and stored only as a hash', async () => {
    const s = await login();
    assert.equal((await call('POST', '/auth/otp/verify', { phone: s.p, code: lastCode(s.p) })).status, 401);
    const rows = await pool.query('SELECT code_hmac FROM identity.otp_challenges WHERE phone=$1', [s.p]);
    assert.ok(!rows.rows[0].code_hmac.toString().includes(lastCode(s.p)));
  });

  await ctx.test('request rate limit: 4th request in 10 minutes is refused', async () => {
    const p = phone();
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/auth/otp/request', { phone: p })).status, 200);
    assert.equal((await call('POST', '/auth/otp/request', { phone: p })).status, 429);
  });

  await ctx.test('refresh rotates; reusing an old token revokes the whole session', async () => {
    const s = await login(phone(), 'dev-1');
    const r1 = await call('POST', '/auth/refresh', { refreshToken: s.refreshToken, deviceId: 'dev-1' });
    assert.equal(r1.status, 200); assert.notEqual(r1.body.refreshToken, s.refreshToken);
    const replay = await call('POST', '/auth/refresh', { refreshToken: s.refreshToken, deviceId: 'dev-1' });
    assert.equal(replay.status, 401);
    const after = await call('POST', '/auth/refresh', { refreshToken: r1.body.refreshToken, deviceId: 'dev-1' });
    assert.equal(after.status, 401, 'family revoked after reuse');
    const audit = await pool.query(`SELECT count(*)::int n FROM governance.audit_events WHERE action='auth.refresh_reuse_detected'`);
    assert.ok(audit.rows[0].n >= 1);
  });

  await ctx.test('refresh from a different device is refused and kills the session', async () => {
    const s = await login(phone(), 'phone-A');
    assert.equal((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken, deviceId: 'phone-B' })).status, 401);
    assert.equal((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken, deviceId: 'phone-A' })).status, 401);
  });

  await ctx.test('refresh tokens are stored as hashes; logout revokes the session', async () => {
    const s = await login();
    const hash = createHash('sha256').update(s.refreshToken).digest();
    assert.equal((await pool.query('SELECT 1 FROM identity.refresh_tokens WHERE token_hash=$1', [hash])).rowCount, 1);
    assert.equal((await pool.query('SELECT 1 FROM identity.refresh_tokens WHERE token_hash=$1', [Buffer.from(s.refreshToken)])).rowCount, 0);
    assert.equal((await call('POST', '/auth/logout', { refreshToken: s.refreshToken }, s.accessToken)).status, 204);
    assert.equal((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status, 401);
  });

  await ctx.test('suspended users are locked out immediately', async () => {
    const s = await login();
    await pool.query(`UPDATE identity.users SET status='suspended' WHERE phone=$1`, [s.p]);
    assert.equal((await call('GET', '/me', undefined, s.accessToken)).status, 401);
    assert.equal((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status, 401);
  });

  await ctx.test('cross-tenant: an admin of org A cannot read org B', async () => {
    const a = await login(), b = await login();
    const orgA = (await call('POST', '/orgs', { name: 'Alpha Agents', kind: 'agency' }, a.accessToken)).body;
    const orgB = (await call('POST', '/orgs', { name: 'Beta Homes', kind: 'management_firm' }, b.accessToken)).body;
    assert.equal((await call('GET', `/orgs/${orgA.id}`, undefined, a.accessToken)).status, 200);
    assert.equal((await call('GET', `/orgs/${orgB.id}`, undefined, a.accessToken)).status, 403);
    assert.equal((await call('GET', `/orgs/${orgA.id}`, undefined, b.accessToken)).status, 403);
    assert.equal((await call('GET', `/orgs/${orgA.id}`)).status, 401);
    assert.equal((await call('POST', '/orgs', { name: 'x', kind: 'bank' }, a.accessToken)).status, 400);
  });

  await pool.end().catch(() => {}); await app.close();
});
