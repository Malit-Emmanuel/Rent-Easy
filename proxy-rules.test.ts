import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedProxyPath as ok, isSameOrigin as same } from './proxy-rules';

test('allows dashboard resources only', () => {
  for (const p of [['me'], ['me', 'verification'], ['orgs', 'x', 'members'], ['invitations', 'accept'], ['admin', 'verifications', 'queue']]) assert.equal(ok(p), true, p.join('/'));
  for (const p of [['auth', 'otp', 'request'], ['webhooks', 'identity', 'fake'], ['internal', 'cron', 'x'], ['health'], ['admin'], []]) assert.equal(ok(p), false, p.join('/'));
});
test('rejects traversal and odd segments', () => {
  for (const p of [['me', '..', 'auth'], ['orgs', '', 'x'], ['me', 'a%2e%2e'], ['me\\x']]) assert.equal(ok(p), false, p.join('/'));
});
test('state-changing requests need a same-site Origin', () => {
  assert.equal(same('GET', null, 'a.com'), true);
  assert.equal(same('POST', 'https://a.com', 'a.com'), true);
  assert.equal(same('POST', 'https://evil.com', 'a.com'), false);
  assert.equal(same('DELETE', null, 'a.com'), false);
  assert.equal(same('POST', 'not a url', 'a.com'), false);
});
