import test from 'node:test';
import assert from 'node:assert/strict';
import { kes, add, format } from './money';

test('adds and formats without float error', () => {
  assert.equal(format(add(kes(25000), kes(50000, 50))), 'KES 75,000.50');
});
test('rejects currency mismatch', () => {
  assert.throws(() => add(kes(1), { amountMinor: 1n, currency: 'USD' }));
});
test('zero is valid (cost disclosure allows zero)', () => {
  assert.equal(format(kes(0)), 'KES 0');
});
