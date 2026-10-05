import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService, PG_POOL } from '../audit/audit.service';
import { EventBus } from '../events/event-bus';
import { AccessRequest, ConsentRow, isAccessAllowed } from './consent.logic';

export interface GrantInput {
  grantorId: string; granteeOrgId?: string; granteeUserId?: string;
  scope: string[]; purpose: string; policyVersion: string;
}

@Injectable()
export class ConsentService {
  constructor(@Inject(PG_POOL) private pool: Pool, @Inject(AuditService) private audit: AuditService, @Inject(EventBus) private bus: EventBus) {}

  async grant(i: GrantInput): Promise<string> {
    if (!i.scope.length) throw new BadRequestException('scope required');
    if (!i.granteeOrgId && !i.granteeUserId) throw new BadRequestException('grantee required');
    const r = await this.pool.query(
      `INSERT INTO governance.consents (grantor_id, grantee_org_id, grantee_user_id, scope, purpose, policy_version)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [i.grantorId, i.granteeOrgId ?? null, i.granteeUserId ?? null, i.scope, i.purpose, i.policyVersion]);
    const id: string = r.rows[0].id;
    await this.audit.record({ actorId: i.grantorId, action: 'consent.granted', subjectType: 'consent', subjectId: id,
      metadata: { scope: i.scope, purpose: i.purpose, policyVersion: i.policyVersion } });
    await this.bus.emit({ type: 'ConsentGranted', consentId: id });
    return id;
  }

  /** Only the person who granted a consent can revoke it. Revocation is immediate. */
  async revoke(consentId: string, actorId: string): Promise<void> {
    const found = await this.pool.query('SELECT grantor_id, revoked_at FROM governance.consents WHERE id=$1', [consentId]);
    if (!found.rows[0]) throw new NotFoundException();
    if (found.rows[0].grantor_id !== actorId) throw new ForbiddenException();
    if (found.rows[0].revoked_at) return;
    await this.pool.query('UPDATE governance.consents SET revoked_at = now() WHERE id=$1', [consentId]);
    await this.audit.record({ actorId, action: 'consent.revoked', subjectType: 'consent', subjectId: consentId });
    await this.bus.emit({ type: 'ConsentRevoked', consentId });
  }

  /** Decide access to one subject's data, and log the decision either way (data_access_log). */
  async check(subjectUserId: string, accessorId: string, q: AccessRequest): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT id, scope, purpose, granted_at, revoked_at, grantee_org_id, grantee_user_id
         FROM governance.consents WHERE grantor_id=$1`, [subjectUserId]);
    const rows: (ConsentRow & { id: string })[] = r.rows.map((x) => ({
      id: x.id, scope: x.scope, purpose: x.purpose, grantedAt: x.granted_at, revokedAt: x.revoked_at,
      granteeOrgId: x.grantee_org_id, granteeUserId: x.grantee_user_id }));
    const allowed = isAccessAllowed(rows, q);
    const match = allowed ? rows.find((c) => isAccessAllowed([c], q)) : undefined;
    await this.pool.query(
      `INSERT INTO governance.data_access_log (accessor_id, subject_user_id, resource, consent_id, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [accessorId, subjectUserId, q.scope, match?.id ?? null, allowed ? q.purpose : `DENIED: ${q.purpose}`]);
    return allowed;
  }
}
