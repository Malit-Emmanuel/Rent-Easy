import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Pool } from 'pg';
import { Roles } from '../../common/rbac';
import { AuditService, PG_POOL } from '../audit/audit.service';

const KINDS = { agency: 'manager_admin', management_firm: 'manager_admin', landlord: 'landlord' } as const;

@Controller('orgs')
export class OrgsController {
  constructor(@Inject(PG_POOL) private pool: Pool, @Inject(AuditService) private audit: AuditService) {}

  /** Creator becomes the organisation's first admin. Organisation must be verified (B3) before it can publish. */
  @Post()
  async create(@Req() req: any, @Body() b: any) {
    const kind = b?.kind as keyof typeof KINDS;
    if (typeof b?.name !== 'string' || b.name.trim().length < 2 || !(kind in KINDS)) throw new BadRequestException('name and valid kind required');
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const org = (await c.query('INSERT INTO identity.organizations (name, kind) VALUES ($1,$2) RETURNING id', [b.name.trim(), kind])).rows[0];
      await c.query('INSERT INTO identity.memberships (user_id, org_id, role) VALUES ($1,$2,$3)', [req.user.id, org.id, KINDS[kind]]);
      await c.query('COMMIT');
      await this.audit.record({ actorId: req.user.id, action: 'org.created', subjectType: 'organization', subjectId: org.id, metadata: { kind } });
      return { id: org.id, name: b.name.trim(), kind };
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }

  @Get(':orgId') @Roles('manager_admin', 'manager_staff', 'landlord', 'agent')
  async get(@Param('orgId', new ParseUUIDPipe()) orgId: string) {
    const r = await this.pool.query('SELECT id, name, kind FROM identity.organizations WHERE id=$1', [orgId]);
    if (!r.rows[0]) throw new NotFoundException();
    return r.rows[0];
  }
}
