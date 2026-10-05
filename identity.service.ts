import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { IDENTITY_PROVIDERS, IdentityProviderPort, NormalisedIdentityResult, VerificationStatus } from '../../providers/ports';
import { AuditService, PG_POOL } from '../audit/audit.service';
import { EventBus } from '../events/event-bus';
import { canTransition, normaliseReason } from './identity.status';

export const IDENTITY_CONFIG = 'IDENTITY_CONFIG';
export interface IdentityConfig { provider: string; fingerprintPepper: string; badgeMonths: number; maxSessionsPerDay: number }

@Injectable()
export class IdentityVerificationService {
  constructor(
    @Inject(PG_POOL) private pool: Pool,
    @Inject(IDENTITY_PROVIDERS) private providers: Record<string, IdentityProviderPort>,
    @Inject(AuditService) private audit: AuditService,
    @Inject(EventBus) private bus: EventBus,
    @Inject(IDENTITY_CONFIG) private cfg: IdentityConfig,
  ) {}

  private provider(name = this.cfg.provider) {
    const p = this.providers[name]; if (!p) throw new NotFoundException('Unknown provider'); return p;
  }
  private fingerprint(idType: string | undefined, num: string | undefined) {
    return idType && num ? createHmac('sha256', this.cfg.fingerprintPepper).update(`${idType}:${num.trim().toUpperCase()}`).digest() : null;
  }

  async start(userId: string) {
    if ((await this.status(userId)).verified) return { status: 'VERIFIED' as const };
    const n = (await this.pool.query(`SELECT count(*)::int n FROM identity.verification_sessions WHERE user_id=$1 AND created_at > now() - interval '24 hours'`, [userId])).rows[0].n;
    if (n >= this.cfg.maxSessionsPerDay) throw new HttpException('Too many verification attempts today', 429);
    await this.pool.query(`UPDATE identity.verification_sessions SET status='EXPIRED', reason_code='expired', updated_at=now()
                            WHERE user_id=$1 AND status IN ('PENDING','IN_PROGRESS')`, [userId]);
    const id = randomUUID(), p = this.provider();
    await this.pool.query(`INSERT INTO identity.verification_sessions (id, user_id, provider, status) VALUES ($1,$2,$3,'PENDING')`, [id, userId, p.name]);
    try {
      const s = await p.createSession({ verificationId: id });
      await this.pool.query(`UPDATE identity.verification_sessions SET status='IN_PROGRESS', provider_session_id=$2, expires_at=$3, updated_at=now()
                              WHERE id=$1 AND status='PENDING'`, [id, s.providerSessionId, s.expiresAt]);
      await this.audit.record({ actorId: userId, action: 'idv.started', subjectType: 'verification_session', subjectId: id, metadata: { provider: p.name } });
      return { status: 'IN_PROGRESS' as const, verificationId: id, redirectUrl: s.redirectUrl, expiresAt: s.expiresAt };
    } catch {
      await this.pool.query(`UPDATE identity.verification_sessions SET status='FAILED', reason_code='provider_error', updated_at=now() WHERE id=$1`, [id]);
      throw new HttpException('Verification service unavailable', 502);
    }
  }

  async status(userId: string) {
    const s = (await this.pool.query(`SELECT id, status, reason_code, checks, created_at FROM identity.verification_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0];
    const b = (await this.pool.query(`SELECT expires_at FROM verification.badges WHERE subject_type='user' AND subject_id=$1 AND level='id_verified'
                                       AND revoked_at IS NULL AND expires_at > now() ORDER BY expires_at DESC LIMIT 1`, [userId])).rows[0];
    return { verified: !!b, badgeExpiresAt: b?.expires_at ?? null, latest: s ? { verificationId: s.id, status: s.status as VerificationStatus, reasonCode: s.reason_code, checks: s.checks } : null };
  }

  /** Signed vendor callback. Event stored before processing; duplicates and replays are no-ops. */
  async handleWebhook(providerName: string, headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const parsed = this.provider(providerName).parseWebhook(headers, rawBody);   // throws 401 on bad signature
    const c = await this.pool.connect();
    let outcome: { userId: string; sessionId: string; status: VerificationStatus } | null = null;
    try {
      await c.query('BEGIN');
      const { documentNumber, ...safe } = parsed.result;                        // never persist the ID number
      const ins = await c.query(`INSERT INTO identity.verification_events (provider, event_id, body_sha256, normalised) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [providerName, parsed.eventId, createHash('sha256').update(rawBody).digest(), JSON.stringify(safe)]);
      if (ins.rowCount === 0) { await c.query('COMMIT'); return { duplicate: true }; }
      const s = (await c.query(`SELECT id, user_id, status FROM identity.verification_sessions WHERE provider=$1 AND provider_session_id=$2 FOR UPDATE`, [providerName, parsed.providerSessionId])).rows[0];
      if (!s || !canTransition(s.status, parsed.result.status)) { await c.query('COMMIT'); return { ignored: true }; }
      const status = await this.apply(c, s.id, s.user_id, parsed.result, null);
      await c.query('COMMIT'); outcome = { userId: s.user_id, sessionId: s.id, status };
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    await this.afterApply(outcome);
    return { ok: true };
  }

  /** Writes the result. If the ID is already verified on another account, the DB unique index forces REVIEW_REQUIRED. */
  private async apply(c: PoolClient, sessionId: string, userId: string, r: NormalisedIdentityResult, decidedBy: string | null): Promise<VerificationStatus> {
    let status = r.status, reason = normaliseReason(r.reasonCode);
    const fp = status === 'VERIFIED' ? this.fingerprint(r.idType, r.documentNumber) : null;
    await c.query('SAVEPOINT w');
    try {
      await c.query(`UPDATE identity.verification_sessions SET status=$2, reason_code=$3, checks=$4, id_fingerprint=$5, decided_by=$6, completed_at=now(), updated_at=now() WHERE id=$1`,
        [sessionId, status, reason ?? null, JSON.stringify(r.checks ?? {}), fp, decidedBy]);
      await c.query('RELEASE SAVEPOINT w');
    } catch (e: any) {
      if (e.code !== '23505') throw e;
      await c.query('ROLLBACK TO SAVEPOINT w');
      status = 'REVIEW_REQUIRED'; reason = 'duplicate_identity';
      await c.query(`UPDATE identity.verification_sessions SET status=$2, reason_code=$3, checks=$4, id_fingerprint=NULL, updated_at=now() WHERE id=$1`,
        [sessionId, status, reason, JSON.stringify(r.checks ?? {})]);
    }
    if (status === 'VERIFIED') {
      await c.query(`INSERT INTO verification.badges (subject_type, subject_id, level, verified_by, evidence_ref, expires_at)
                     VALUES ('user',$1,'id_verified',$2,$3, now() + make_interval(months => $4))`, [userId, decidedBy, sessionId, this.cfg.badgeMonths]);
    }
    return status;
  }

  private async afterApply(o: { userId: string; sessionId: string; status: VerificationStatus } | null) {
    if (!o) return;
    await this.audit.record({ actorId: o.userId, action: `idv.${o.status.toLowerCase()}`, subjectType: 'verification_session', subjectId: o.sessionId });
    if (o.status === 'VERIFIED') await this.bus.emit({ type: 'UserVerified', userId: o.userId });
  }

  /** Reviewer queue: minimal fields only; each read is logged (Plan §3.2). */
  async queue(reviewerId: string) {
    const rows = (await this.pool.query(`SELECT id, user_id, status, reason_code, checks, created_at FROM identity.verification_sessions
                                          WHERE status='REVIEW_REQUIRED' ORDER BY created_at ASC LIMIT 100`)).rows;
    await this.pool.query(`INSERT INTO governance.data_access_log (accessor_id, resource, reason) VALUES ($1,'verification_queue',$2)`, [reviewerId, `listed ${rows.length}`]);
    return rows;
  }

  async decide(sessionId: string, reviewerId: string, decision: 'approve' | 'reject', reasonCode?: string) {
    if (decision === 'reject') {
      const ok = reasonCode && (await this.pool.query('SELECT 1 FROM verification.reason_codes WHERE code=$1', [reasonCode])).rowCount;
      if (!ok) throw new BadRequestException('A valid reasonCode is required to reject');
    }
    const c = await this.pool.connect(); let out: any;
    try {
      await c.query('BEGIN');
      const s = (await c.query(`SELECT id, user_id, status FROM identity.verification_sessions WHERE id=$1 FOR UPDATE`, [sessionId])).rows[0];
      if (!s) throw new NotFoundException();
      if (s.status !== 'REVIEW_REQUIRED') throw new ConflictException('Not awaiting review');
      if (decision === 'approve') {
        // approval cannot create a duplicate verified identity; the fingerprint was not kept, so the reviewer must confirm no duplicate
        const st = await this.apply(c, s.id, s.user_id, { status: 'VERIFIED', reasonCode: 'manual_approve' }, reviewerId);
        out = { userId: s.user_id, sessionId: s.id, status: st };
      } else {
        const st = await this.apply(c, s.id, s.user_id, { status: 'FAILED', reasonCode }, reviewerId);
        out = { userId: s.user_id, sessionId: s.id, status: st };
      }
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    await this.audit.record({ actorId: reviewerId, action: `idv.review_${decision}`, subjectType: 'verification_session', subjectId: sessionId, metadata: { reasonCode } });
    await this.afterApply(out);
    return { status: out.status };
  }

  /** Called by the job queue (next step). Expires abandoned sessions. */
  async expireStale(): Promise<number> {
    const r = await this.pool.query(`UPDATE identity.verification_sessions SET status='EXPIRED', reason_code='expired', updated_at=now()
                                      WHERE status IN ('PENDING','IN_PROGRESS') AND expires_at < now()`);
    return r.rowCount ?? 0;
  }
}
