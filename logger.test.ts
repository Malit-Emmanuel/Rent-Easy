import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, logLine } from './logger';

test('redacts sensitive keys, including nested', () => {
  const out: any = redact({ user: { phone: '+254712345678', national_id: '12345678', name: 'ok' }, otp: '123456' });
  assert.equal(out.user.phone, '[redacted]');
  assert.equal(out.user.national_id, '[redacted]');
  assert.equal(out.otp, '[redacted]');
  assert.equal(out.user.name, 'ok');
});
test('scrubs phone numbers inside free text', () => {
  assert.equal(logLine('info', 'OTP sent to +254712345678 and 0722000111').includes('254712345678'), false);
  assert.equal(logLine('info', 'call 0722000111').includes('0722000111'), false);
});
test('leaves normal values alone', () => assert.deepEqual(redact({ unit: 'A1', amountMinor: 5000 }), { unit: 'A1', amountMinor: 5000 }));
