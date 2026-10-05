import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, normaliseReason } from './identity.status';

test('terminal states cannot change', () => {
  for (const s of ['VERIFIED', 'FAILED', 'EXPIRED'] as const)
    for (const to of ['VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'IN_PROGRESS'] as const) assert.equal(canTransition(s, to), false);
});
test('review can be resolved either way but not restarted', () => {
  assert.equal(canTransition('REVIEW_REQUIRED', 'VERIFIED'), true);
  assert.equal(canTransition('REVIEW_REQUIRED', 'FAILED'), true);
  assert.equal(canTransition('REVIEW_REQUIRED', 'IN_PROGRESS'), false);
});
test('unknown vendor reasons collapse to provider_error', () => {
  assert.equal(normaliseReason('face_mismatch'), 'face_mismatch');
  assert.equal(normaliseReason('SOME_VENDOR_CODE_77'), 'provider_error');
  assert.equal(normaliseReason(undefined), undefined);
});
