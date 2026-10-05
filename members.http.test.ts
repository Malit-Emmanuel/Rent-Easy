import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from '../../test-utils/http';

const t = process.env.DATABASE_URL ? test : test.skip;

t('staff invitations, members and profile over HTTP', async (ctx) => {
  const h = await bootApp();
  const admin = await h.login(), other = await h.login(), staff = await h.login(), stranger = await h.login();
  const org = (await h.call('POST', '/orgs', { name: 'Kilimani Homes', kind: 'management_firm' }, admin.accessToken)).body;
  const otherOrg = (await h.call('POST', '/orgs', { name: 'Other Firm', kind: 'agency' }, other.accessToken)).body;
  const invite = (token: string, phone: string, role = 'manager_staff', orgId = org.id) => h.call('POST', `/orgs/${orgId}/invitations`, { phone, role }, token);
  let code = '';

  await ctx.test('only an org admin can invite; other orgs and bad input rejected', async () => {
    assert.equal((await invite(other.accessToken, staff.p)).status, 403, 'admin of another org');
    assert.equal((await invite(stranger.accessToken, staff.p)).status, 403, 'non-member');
    assert.equal((await invite(admin.accessToken, 'nope')).status, 400);
    assert.equal((await invite(admin.accessToken, staff.p, 'super_admin')).status, 400);
    assert.equal((await h.call('POST', `/orgs/${org.id}/invitations`, { phone: staff.p, role: 'manager_staff' })).status, 401);
    const ok = await invite(admin.accessToken, staff.p);
    assert.equal(ok.status, 201); code = h.lastMsg(staff.p).match(/code ([0-9A-F]{16})/)![1];
  });

  await ctx.test('code is bound to the invited phone and single use; stored hashed', async () => {
    assert.equal((await h.call('POST', '/invitations/accept', { code }, stranger.accessToken)).status, 404, 'someone else with the code');
    assert.equal((await h.call('POST', '/invitations/accept', { code: 'WRONGCODE' }, staff.accessToken)).status, 404);
    const a = await h.call('POST', '/invitations/accept', { code }, staff.accessToken);
    assert.equal(a.status, 200); assert.equal(a.body.role, 'manager_staff');
    assert.equal((await h.call('POST', '/invitations/accept', { code }, staff.accessToken)).status, 404, 'single use');
    assert.equal((await h.pool.query('SELECT 1 FROM identity.invitations WHERE token_hash=$1', [Buffer.from(code)])).rowCount, 0);
    assert.equal((await invite(admin.accessToken, staff.p)).status, 409, 'already a member');
  });

  await ctx.test('staff get staff powers only: read org and members, cannot invite or remove', async () => {
    assert.equal((await h.call('GET', `/orgs/${org.id}`, undefined, staff.accessToken)).status, 200);
    const m = await h.call('GET', `/orgs/${org.id}/members`, undefined, staff.accessToken);
    assert.equal(m.status, 200); assert.equal(m.body.length, 2);
    assert.ok(m.body.every((x: any) => x.phone.startsWith('***') && x.phone.length === 6), 'phones masked');
    assert.equal((await invite(staff.accessToken, stranger.p)).status, 403);
    assert.equal((await h.call('GET', `/orgs/${otherOrg.id}/members`, undefined, staff.accessToken)).status, 403);
    assert.equal((await h.call('DELETE', `/orgs/${org.id}/members/${await h.userId(admin.p)}`, undefined, staff.accessToken)).status, 403);
  });

  await ctx.test('expired invitations fail; last admin cannot be removed; removal works', async () => {
    await invite(admin.accessToken, stranger.p);
    const c2 = h.lastMsg(stranger.p).match(/code ([0-9A-F]{16})/)![1];
    await h.pool.query(`UPDATE identity.invitations SET expires_at = now() - interval '1 second' WHERE phone=$1`, [stranger.p]);
    assert.equal((await h.call('POST', '/invitations/accept', { code: c2 }, stranger.accessToken)).status, 404);
    assert.equal((await h.call('DELETE', `/orgs/${org.id}/members/${await h.userId(admin.p)}`, undefined, admin.accessToken)).status, 400);
    assert.equal((await h.call('DELETE', `/orgs/${org.id}/members/${await h.userId(staff.p)}`, undefined, admin.accessToken)).status, 204);
    assert.equal((await h.call('GET', `/orgs/${org.id}`, undefined, staff.accessToken)).status, 403, 'removal takes effect immediately');
  });

  await ctx.test('profile update validates input', async () => {
    const r = await h.call('PATCH', '/me/profile', { fullName: '  Wanjiku Kamau ', locale: 'sw' }, stranger.accessToken);
    assert.deepEqual(r.body, { fullName: 'Wanjiku Kamau', locale: 'sw' });
    assert.equal((await h.call('PATCH', '/me/profile', { locale: 'fr' }, stranger.accessToken)).status, 400);
    assert.equal((await h.call('PATCH', '/me/profile', { fullName: 'x' }, stranger.accessToken)).status, 400);
  });

  await h.close();
});
