import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { Roles } from '../../common/rbac';
import { AuditService, PG_POOL } from '../audit/audit.service';
import { normaliseKenyanPhone } from '../auth/phone';
import { SMS_PORT, SmsPort } from '../../providers/ports';

const INVITE_ROLES = ['manager_staff', 'manager_admin', 'agent'];
const sha = (s: string) => createHash('sha256').update(s).digest();

@Controller()
export class MembersController {
  constructor(@Inject(PG_POOL) private pool: Pool, @Inject(AuditService) private audit: AuditService, @Inject(SMS_PORT) private sms: SmsPort) {}

  @Post('orgs/:orgId/invitations') @Roles('manager_admin')
  async invite(@Req() req: any, @Param('orgId', new ParseUUIDPipe()) orgId: string, @Body() b: any) {
    const phone = normaliseKenyanPhone(b?.phone ?? ''), role = b?.role;
    if (!phone || !INVITE_ROLES.includes(role)) throw new BadRequestException('valid phone and role required');
    const already = await this.pool.query(`SELECT 1 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.org_id=$1 AND u.phone=$2`, [orgId, phone]);
    if (already.rowCount) throw new ConflictException('Already a member');
    const code = randomBytes(8).toString('hex').toUpperCase();
    const org = (await this.pool.query('SELECT name FROM identity.organizations WHERE id=$1', [orgId])).rows[0];
    const r = await this.pool.query(`INSERT INTO identity.invitations (org_id, phone, role, invited_by, token_hash, expires_at)
      VALUES ($1,$2,$3,$4,$5, now() + interval '7 days') RETURNING id, expires_at`, [orgId, phone, role, req.user.id, sha(code)]);
    await this.sms.send(phone, `You have been invited to join ${org.name}. Sign in and enter code ${code} within 7 days.`);
    await this.audit.record({ actorId: req.user.id, action: 'org.invitation_created', subjectType: 'organization', subjectId: orgId, metadata: { role } });
    return { invitationId: r.rows[0].id, expiresAt: r.rows[0].expires_at };
  }

  /** The invitee must be signed in with the invited phone number; the code alone is not enough. */
  @Post('invitations/accept') @HttpCode(200)
  async accept(@Req() req: any, @Body() b: any) {
    if (typeof b?.code !== 'string') throw new BadRequestException('code required');
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const inv = (await c.query(`SELECT i.id, i.org_id, i.role, i.phone FROM identity.invitations i
        WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at > now() FOR UPDATE`, [sha(b.code.trim().toUpperCase())])).rows[0];
      const me = (await c.query('SELECT phone FROM identity.users WHERE id=$1', [req.user.id])).rows[0];
      if (!inv || inv.phone !== me.phone) { await c.query('COMMIT'); throw new NotFoundException('Invalid or expired invitation'); }
      await c.query('INSERT INTO identity.memberships (user_id, org_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.user.id, inv.org_id, inv.role]);
      await c.query('UPDATE identity.invitations SET accepted_at = now() WHERE id=$1', [inv.id]);
      await c.query('COMMIT');
      await this.audit.record({ actorId: req.user.id, action: 'org.invitation_accepted', subjectType: 'organization', subjectId: inv.org_id, metadata: { role: inv.role } });
      return { orgId: inv.org_id, role: inv.role };
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }

  @Get('orgs/:orgId/members') @Roles('manager_admin', 'manager_staff')
  async list(@Param('orgId', new ParseUUIDPipe()) orgId: string) {
    const r = await this.pool.query(`SELECT u.id AS "userId", u.full_name AS name, m.role, '***' || right(u.phone, 3) AS phone
      FROM identity.memberships m JOIN identity.users u ON u.id = m.user_id WHERE m.org_id=$1 ORDER BY m.created_at`, [orgId]);
    return r.rows;
  }

  @Delete('orgs/:orgId/members/:userId') @HttpCode(204) @Roles('manager_admin')
  async remove(@Req() req: any, @Param('orgId', new ParseUUIDPipe()) orgId: string, @Param('userId', new ParseUUIDPipe()) userId: string) {
    const admins = (await this.pool.query(`SELECT user_id FROM identity.memberships WHERE org_id=$1 AND role='manager_admin'`, [orgId])).rows;
    if (admins.length === 1 && admins[0].user_id === userId) throw new BadRequestException('Cannot remove the last administrator');
    const r = await this.pool.query('DELETE FROM identity.memberships WHERE org_id=$1 AND user_id=$2', [orgId, userId]);
    if (!r.rowCount) throw new NotFoundException();
    await this.audit.record({ actorId: req.user.id, action: 'org.member_removed', subjectType: 'organization', subjectId: orgId, metadata: { userId } });
  }

  @Patch('me/profile')
  async profile(@Req() req: any, @Body() b: any) {
    const name = b?.fullName, locale = b?.locale;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.length > 100)) throw new BadRequestException('invalid fullName');
    if (locale !== undefined && !['en', 'sw'].includes(locale)) throw new BadRequestException('locale must be en or sw');
    const r = await this.pool.query(`UPDATE identity.users SET full_name = COALESCE($2, full_name), locale = COALESCE($3, locale) WHERE id=$1 RETURNING full_name AS "fullName", locale`,
      [req.user.id, name?.trim() ?? null, locale ?? null]);
    return r.rows[0];
  }
}
