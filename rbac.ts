import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type Role =
  | 'tenant' | 'landlord' | 'manager_admin' | 'manager_staff' | 'agent'
  | 'reviewer' | 'support' | 'super_admin';

export interface AuthUser {
  id: string;
  platformRoles: Role[];
  memberships: { orgId: string; role: Role }[];
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Server-side RBAC. Org-scoped roles are checked against the :orgId route param (Plan §3.2). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<Role[]>(ROLES_KEY, ctx.getHandler());
    if (!required?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;   // populated by the auth layer (next step)
    if (!user) throw new ForbiddenException();
    const orgId: string | undefined = req.params?.orgId;
    const ok = required.some(
      (r) => user.platformRoles.includes(r) ||
             user.memberships.some((m) => m.role === r && (!orgId || m.orgId === orgId)),
    );
    if (!ok) throw new ForbiddenException();
    return true;
  }
}
