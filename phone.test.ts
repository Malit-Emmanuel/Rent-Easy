import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseKenyanPhone as n } from './phone';

test('accepts common Kenyan formats', () => {
  for (const x of ['0712345678', '+254712345678', '254712345678', '0712 345 678', '0112345678'])
    assert.ok(n(x)?.startsWith('+254'), x);
  assert.equal(n('0712345678'), '+254712345678');
});
test('rejects invalid numbers', () => {
  for (const x of ['', '12345', '+15551234567', '0812345678', '07123456789', 'abc']) assert.equal(n(x), null, x);
});
