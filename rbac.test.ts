import test from 'node:test';
import assert from 'node:assert/strict';
import { RolesGuard, AuthUser } from './rbac';

const guardFor = (required: string[], user: AuthUser | undefined, orgId?: string) => {
  const reflector: any = { get: () => required };
  const ctx: any = { getHandler: () => null, switchToHttp: () => ({ getRequest: () => ({ user, params: { orgId } }) }) };
  return () => new RolesGuard(reflector).canActivate(ctx);
};

test('manager_admin of org A cannot act on org B (cross-tenant)', () => {
  const u: AuthUser = { id: 'u1', platformRoles: [], memberships: [{ orgId: 'A', role: 'manager_admin' }] };
  assert.equal(guardFor(['manager_admin'], u, 'A')(), true);
  assert.throws(guardFor(['manager_admin'], u, 'B'));
});
test('anonymous is rejected', () => assert.throws(guardFor(['tenant'], undefined)));
test('reviewer platform role passes', () => {
  const u: AuthUser = { id: 'u2', platformRoles: ['reviewer'], memberships: [] };
  assert.equal(guardFor(['reviewer'], u)(), true);
});
