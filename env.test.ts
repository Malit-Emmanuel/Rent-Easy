import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './env';

const ok = { DATABASE_URL: 'd', JWT_SECRET: 'j'.repeat(32), OTP_PEPPER: 'p'.repeat(32) };
test('requires DATABASE_URL', () => assert.throws(() => loadConfig({ ...ok, DATABASE_URL: '' })));
test('rejects short secrets', () => assert.throws(() => loadConfig({ ...ok, JWT_SECRET: 'short' })));
test('rejects unimplemented vendor', () => assert.throws(() => loadConfig({ ...ok, PAYMENTS_PROVIDER: 'pesapal' })));
test('blocks production while vendors are fake', () => {
  assert.throws(() => loadConfig({ ...ok, APP_ENV: 'production' }));
  assert.throws(() => loadConfig({ ...ok, VERCEL_ENV: 'production' }), /Production is blocked/);
});
test('NODE_ENV=production alone (Vercel sets it on previews) does not trigger the block', () => {
  assert.doesNotThrow(() => loadConfig({ ...ok, NODE_ENV: 'production', VERCEL_ENV: 'preview' }));
});
test('valid config', () => assert.equal(loadConfig(ok).port, 3000));
