import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccessAllowed, ConsentRow } from './consent.logic';

const base: ConsentRow = { scope: ['profile.income_proof'], purpose: 'rental_application', grantedAt: new Date('2026-01-01'), revokedAt: null, granteeOrgId: 'A' };
const q = { scope: 'profile.income_proof', purpose: 'rental_application', orgId: 'A', at: new Date('2026-06-01') };

test('allows matching consent', () => assert.equal(isAccessAllowed([base], q), true));
test('denies other org', () => assert.equal(isAccessAllowed([base], { ...q, orgId: 'B' }), false));
test('denies other scope', () => assert.equal(isAccessAllowed([base], { ...q, scope: 'ledger' }), false));
test('denies other purpose', () => assert.equal(isAccessAllowed([base], { ...q, purpose: 'lending' }), false));
test('denies after revocation', () =>
  assert.equal(isAccessAllowed([{ ...base, revokedAt: new Date('2026-03-01') }], q), false));
test('denies with no consent', () => assert.equal(isAccessAllowed([], q), false));
