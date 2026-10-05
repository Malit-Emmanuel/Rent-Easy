import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from '../../test-utils/http';

const t = process.env.DATABASE_URL ? test : test.skip;
const doc = () => String(Math.floor(Math.random() * 9e7) + 1e7);

t('vendor-neutral ID verification over HTTP', async (ctx) => {
  const h = await bootApp();
  const { FakeIdentityProvider } = await import('./fake-identity.provider');
  const { IdentityVerificationService } = await import('./identity.service');
  const fake = h.app.get(FakeIdentityProvider), svc = h.app.get(IdentityVerificationService);
  const pid = async (verificationId: string) => (await h.pool.query('SELECT provider_session_id p FROM identity.verification_sessions WHERE id=$1', [verificationId])).rows[0].p as string;
  const hook = (p: string, r: any, eventId?: string) => { const w = fake.buildWebhook(p, r, eventId); return h.raw('/webhooks/identity/fake', w.headers, w.rawBody); };

  await ctx.test('verified: badge issued, ID number never stored, replay is a no-op', async () => {
    const u = await h.login(); const num = doc();
    const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
    assert.equal(s.status, 200); assert.equal(s.body.status, 'IN_PROGRESS');
    const p = await pid(s.body.verificationId);
    const w = fake.buildWebhook(p, { status: 'VERIFIED', idType: 'NATIONAL_ID', documentNumber: num, checks: { document: 'passed', face_match: 'passed', liveness: 'passed' } });
    assert.equal((await h.raw('/webhooks/identity/fake', w.headers, w.rawBody)).status, 200);
    const st = await h.call('GET', '/me/verification', undefined, u.accessToken);
    assert.equal(st.body.verified, true); assert.equal(st.body.latest.status, 'VERIFIED');
    assert.equal((await h.raw('/webhooks/identity/fake', w.headers, w.rawBody)).body.duplicate, true);   // replay
    const badges = await h.pool.query(`SELECT count(*)::int n FROM verification.badges WHERE subject_id=$1 AND level='id_verified'`, [await h.userId(u.p)]);
    assert.equal(badges.rows[0].n, 1);
    const dump = JSON.stringify((await h.pool.query('SELECT * FROM identity.verification_sessions')).rows) + JSON.stringify((await h.pool.query('SELECT * FROM identity.verification_events')).rows);
    assert.ok(!dump.includes(num), 'document number must not be stored');
    assert.equal((await h.call('POST', '/me/verification', undefined, u.accessToken)).body.status, 'VERIFIED', 'already verified');
  });

  await ctx.test('bad or missing signature is rejected', async () => {
    const u = await h.login(); const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
    const w = fake.buildWebhook(await pid(s.body.verificationId), { status: 'VERIFIED' });
    assert.equal((await h.raw('/webhooks/identity/fake', { ...w.headers, 'x-signature': 'deadbeef' }, w.rawBody)).status, 401);
    assert.equal((await h.raw('/webhooks/identity/fake', { 'content-type': 'application/json' }, w.rawBody)).status, 401);
    assert.equal((await h.raw('/webhooks/identity/unknown', w.headers, w.rawBody)).status, 404);
    assert.equal((await h.call('GET', '/me/verification', undefined, u.accessToken)).body.verified, false);
  });

  await ctx.test('failure reasons are normalised; unknown vendor codes become provider_error; terminal states stay put', async () => {
    const u = await h.login(); const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
    const p = await pid(s.body.verificationId);
    await hook(p, { status: 'FAILED', reasonCode: 'VENDOR_XYZ_9' });
    assert.equal((await h.call('GET', '/me/verification', undefined, u.accessToken)).body.latest.reasonCode, 'provider_error');
    await hook(p, { status: 'VERIFIED', idType: 'NATIONAL_ID', documentNumber: doc() });   // late event after terminal
    const st = await h.call('GET', '/me/verification', undefined, u.accessToken);
    assert.equal(st.body.latest.status, 'FAILED'); assert.equal(st.body.verified, false);
  });

  await ctx.test('same ID on a second account goes to review; reviewer rules enforced', async () => {
    const num = doc(), a = await h.login(), b = await h.login();
    for (const [u, expected] of [[a, 'VERIFIED'], [b, 'REVIEW_REQUIRED']] as const) {
      const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
      await hook(await pid(s.body.verificationId), { status: 'VERIFIED', idType: 'NATIONAL_ID', documentNumber: num });
      assert.equal((await h.call('GET', '/me/verification', undefined, u.accessToken)).body.latest.status, expected);
    }
    const latest = (await h.call('GET', '/me/verification', undefined, b.accessToken)).body.latest;
    assert.equal(latest.reasonCode, 'duplicate_identity');
    assert.equal((await h.call('GET', '/admin/verifications/queue', undefined, b.accessToken)).status, 403, 'tenants cannot see the queue');
    assert.equal((await h.call('POST', `/admin/verifications/${latest.verificationId}/decision`, { decision: 'reject', reasonCode: 'duplicate_identity' }, b.accessToken)).status, 403);

    const rev = await h.login();
    await h.pool.query(`INSERT INTO identity.platform_roles (user_id, role) VALUES ($1,'reviewer')`, [await h.userId(rev.p)]);
    const q = await h.call('GET', '/admin/verifications/queue', undefined, rev.accessToken);
    assert.equal(q.status, 200); assert.ok(q.body.some((r: any) => r.id === latest.verificationId));
    assert.ok(!JSON.stringify(q.body).includes('phone'), 'queue exposes no phone numbers');
    const d = `/admin/verifications/${latest.verificationId}/decision`;
    assert.equal((await h.call('POST', d, { decision: 'reject' }, rev.accessToken)).status, 400, 'reason code mandatory');
    assert.equal((await h.call('POST', d, { decision: 'reject', reasonCode: 'made_up' }, rev.accessToken)).status, 400);
    assert.equal((await h.call('POST', d, { decision: 'reject', reasonCode: 'duplicate_identity' }, rev.accessToken)).status, 200);
    assert.equal((await h.call('POST', d, { decision: 'approve' }, rev.accessToken)).status, 409, 'already decided');
    assert.equal((await h.call('GET', '/me/verification', undefined, b.accessToken)).body.latest.status, 'FAILED');
    const log = await h.pool.query(`SELECT count(*)::int n FROM governance.data_access_log WHERE resource='verification_queue'`);
    assert.ok(log.rows[0].n >= 1, 'queue reads are logged');
  });

  await ctx.test('reviewer can approve a session in review', async () => {
    const u = await h.login(), rev = await h.login();
    await h.pool.query(`INSERT INTO identity.platform_roles (user_id, role) VALUES ($1,'reviewer')`, [await h.userId(rev.p)]);
    const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
    await hook(await pid(s.body.verificationId), { status: 'REVIEW_REQUIRED', reasonCode: 'face_mismatch' });
    assert.equal((await h.call('POST', `/admin/verifications/${s.body.verificationId}/decision`, { decision: 'approve' }, rev.accessToken)).body.status, 'VERIFIED');
    assert.equal((await h.call('GET', '/me/verification', undefined, u.accessToken)).body.verified, true);
  });

  await ctx.test('abandoned sessions expire; attempts per day are limited', async () => {
    const u = await h.login(); const s = await h.call('POST', '/me/verification', undefined, u.accessToken);
    await h.pool.query(`UPDATE identity.verification_sessions SET expires_at = now() - interval '1 minute' WHERE id=$1`, [s.body.verificationId]);
    assert.ok((await svc.expireStale()) >= 1);
    assert.equal((await h.call('GET', '/me/verification', undefined, u.accessToken)).body.latest.status, 'EXPIRED');
    await h.call('POST', '/me/verification', undefined, u.accessToken); await h.call('POST', '/me/verification', undefined, u.accessToken);
    assert.equal((await h.call('POST', '/me/verification', undefined, u.accessToken)).status, 429);
  });

  await h.close();
});
