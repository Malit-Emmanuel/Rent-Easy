export interface ConsentRow {
  scope: string[]; purpose: string; grantedAt: Date; revokedAt: Date | null;
  granteeOrgId?: string | null; granteeUserId?: string | null;
}
export interface AccessRequest { scope: string; purpose: string; orgId?: string; userId?: string; at?: Date }

/** Access is allowed only under an unrevoked consent matching grantee, scope AND stated purpose (Plan §4.3). */
export function isAccessAllowed(rows: ConsentRow[], q: AccessRequest): boolean {
  const at = q.at ?? new Date();
  return rows.some((c) =>
    c.grantedAt <= at && (!c.revokedAt || c.revokedAt > at) &&
    c.scope.includes(q.scope) && c.purpose === q.purpose &&
    ((q.orgId && c.granteeOrgId === q.orgId) || (q.userId && c.granteeUserId === q.userId)));
}
