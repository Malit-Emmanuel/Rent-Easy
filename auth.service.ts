import { ForbiddenException, HttpException, Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { Pool, PoolClient } from 'pg';
import { AuthUser, Role } from '../../common/rbac';
import { SMS_PORT, SmsPort } from '../../providers/ports';
import { AuditService, PG_POOL } from '../audit/audit.service';
import { normaliseKenyanPhone } from './phone';

export const AUTH_CONFIG = 'AUTH_CONFIG';
export interface AuthConfig {
  jwtSecret: string; otpPepper: string; resendCooldownSec: number;
  accessTtlSec: number; refreshTtlDays: number; otpTtlSec: number; maxAttempts: number; maxRequestsPer10Min: number;
}
export const defaultAuthTuning = { accessTtlSec: 15 * 60, refreshTtlDays: 30, otpTtlSec: 5 * 60, maxAttempts: 5, maxRequestsPer10Min: 3 };

export interface TokenPair { accessToken: string; refreshToken: string; expiresIn: number }
const sha256 = (s: string) => createHash('sha256').update(s).digest();
const unauthorized = () => new UnauthorizedException('Invalid or expired credentials');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private pool: Pool,
    @Inject(SMS_PORT) private sms: SmsPort,
    @Inject(AuditService) private audit: AuditService,
    @Inject(AUTH_CONFIG) private cfg: AuthConfig,
  ) {}

  private hmac(challengeId: string, code: string) {
    return createHmac('sha256', this.cfg.otpPepper).update(`${challengeId}:${code}`).digest();
  }

  /** Always answers the same way whether or not the number has an account (no user enumeration). */
  async requestOtp(rawPhone: string): Promise<{ expiresInSec: number }> {
    const phone = normaliseKenyanPhone(rawPhone ?? '');
    if (!phone) throw new BadRequestException('Enter a valid Kenyan mobile number');
    const recent = await this.pool.query(
      `SELECT count(*)::int AS n, max(created_at) AS last FROM identity.otp_challenges
        WHERE phone=$1 AND created_at > now() - interval '10 minutes'`, [phone]);
    const { n, last } = recent.rows[0];
    const tooSoon = last && Date.now() - new Date(last).getTime() < this.cfg.resendCooldownSec * 1000;
    if (n >= this.cfg.maxRequestsPer10Min || tooSoon) throw new HttpException('Too many code requests. Try again later.', 429);

    const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.pool.query(
      `INSERT INTO identity.otp_challenges (id, phone, code_hmac, expires_at)
       VALUES ($1,$2,$3, now() + make_interval(secs => $4))`, [id, phone, this.hmac(id, code), this.cfg.otpTtlSec]);
    await this.sms.send(phone, `Your verification code is ${code}. It expires in ${Math.round(this.cfg.otpTtlSec / 60)} minutes.`);
    await this.audit.record({ action: 'auth.otp_requested', subjectType: 'otp_challenge', subjectId: id });  // no phone in audit
    return { expiresInSec: this.cfg.otpTtlSec };
  }

  async verifyOtp(rawPhone: string, code: string, deviceId?: string): Promise<TokenPair> {
    const phone = normaliseKenyanPhone(rawPhone ?? '');
    if (!phone || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw unauthorized();
    const c = await this.pool.connect();
    let failed = false;
    try {
      await c.query('BEGIN');
      const ch = (await c.query(
        `SELECT id, code_hmac, attempts FROM identity.otp_challenges
          WHERE phone=$1 AND consumed_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone])).rows[0];
      if (!ch || ch.attempts >= this.cfg.maxAttempts) { await c.query('COMMIT'); throw unauthorized(); }
      const good = timingSafeEqual(this.hmac(ch.id, code), ch.code_hmac);
      if (!good) {
        await c.query('UPDATE identity.otp_challenges SET attempts = attempts + 1 WHERE id=$1', [ch.id]);
        await c.query('COMMIT'); failed = true;         // persist the attempt count, then reject
      } else {
        await c.query('UPDATE identity.otp_challenges SET consumed_at = now() WHERE id=$1', [ch.id]);
        const u = (await c.query(
          `INSERT INTO identity.users (phone) VALUES ($1)
           ON CONFLICT (phone) DO UPDATE SET updated_at = now() RETURNING id, status, (xmax = 0) AS created`, [phone])).rows[0];
        if (u.status !== 'active') { await c.query('COMMIT'); throw new ForbiddenException('Account suspended'); }
        await c.query(`INSERT INTO identity.platform_roles (user_id, role) VALUES ($1,'tenant') ON CONFLICT DO NOTHING`, [u.id]);
        const tokens = await this.issue(c, u.id, randomUUID(), deviceId);
        await c.query('COMMIT');
        await this.audit.record({ actorId: u.id, action: u.created ? 'auth.signup' : 'auth.login', subjectType: 'user', subjectId: u.id });
        return tokens;
      }
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
    if (failed) throw unauthorized();
    throw unauthorized();
  }

  private async issue(c: PoolClient, userId: string, familyId: string, deviceId?: string): Promise<TokenPair & { rowId: string }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const r = await c.query(
      `INSERT INTO identity.refresh_tokens (family_id, user_id, token_hash, device_id, expires_at)
       VALUES ($1,$2,$3,$4, now() + make_interval(days => $5)) RETURNING id`,
      [familyId, userId, sha256(refreshToken), deviceId ?? null, this.cfg.refreshTtlDays]);
    const accessToken = jwt.sign({ sub: userId }, this.cfg.jwtSecret, { algorithm: 'HS256', expiresIn: this.cfg.accessTtlSec });
    return { accessToken, refreshToken, expiresIn: this.cfg.accessTtlSec, rowId: r.rows[0].id };
  }

  /** Rotates on every use. Reusing a rotated/revoked token kills the whole session family. */
  async refresh(token: string, deviceId?: string): Promise<TokenPair> {
    if (typeof token !== 'string' || !token) throw unauthorized();
    const c = await this.pool.connect();
    let reuse: { familyId: string; userId: string } | null = null;
    try {
      await c.query('BEGIN');
      const t = (await c.query('SELECT * FROM identity.refresh_tokens WHERE token_hash=$1 FOR UPDATE', [sha256(token)])).rows[0];
      if (!t) { await c.query('COMMIT'); throw unauthorized(); }
      const deviceMismatch = t.device_id && deviceId !== t.device_id;
      if (t.rotated_at || t.revoked_at || deviceMismatch) {
        await c.query('UPDATE identity.refresh_tokens SET revoked_at = now() WHERE family_id=$1 AND revoked_at IS NULL', [t.family_id]);
        await c.query('COMMIT'); reuse = { familyId: t.family_id, userId: t.user_id };
      } else if (new Date(t.expires_at) <= new Date()) {
        await c.query('COMMIT'); throw unauthorized();
      } else {
        const user = (await c.query('SELECT status FROM identity.users WHERE id=$1', [t.user_id])).rows[0];
        if (user?.status !== 'active') { await c.query('COMMIT'); throw unauthorized(); }
        const next = await this.issue(c, t.user_id, t.family_id, t.device_id ?? deviceId);
        await c.query('UPDATE identity.refresh_tokens SET rotated_at = now(), replaced_by = $2 WHERE id=$1', [t.id, next.rowId]);
        await c.query('COMMIT');
        return { accessToken: next.accessToken, refreshToken: next.refreshToken, expiresIn: next.expiresIn };
      }
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
    if (reuse) await this.audit.record({ actorId: reuse.userId, action: 'auth.refresh_reuse_detected', subjectType: 'session', subjectId: reuse.familyId });
    throw unauthorized();
  }

  async logout(token: string): Promise<void> {
    if (typeof token !== 'string' || !token) return;
    await this.pool.query(
      `UPDATE identity.refresh_tokens SET revoked_at = now()
        WHERE revoked_at IS NULL AND family_id = (SELECT family_id FROM identity.refresh_tokens WHERE token_hash=$1)`, [sha256(token)]);
  }

  /** Roles are read from the database on every request so suspensions and role changes apply immediately. */
  async authenticate(accessToken: string): Promise<AuthUser> {
    let sub: string;
    try { sub = (jwt.verify(accessToken, this.cfg.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload).sub as string; }
    catch { throw unauthorized(); }
    const u = (await this.pool.query('SELECT status FROM identity.users WHERE id=$1', [sub])).rows[0];
    if (u?.status !== 'active') throw unauthorized();
    const roles = await this.pool.query('SELECT role FROM identity.platform_roles WHERE user_id=$1', [sub]);
    const mem = await this.pool.query('SELECT org_id, role FROM identity.memberships WHERE user_id=$1', [sub]);
    return { id: sub, platformRoles: roles.rows.map((r) => r.role as Role),
      memberships: mem.rows.map((m) => ({ orgId: m.org_id, role: m.role as Role })) };
  }

  /** Scheduled cleanup. Expired OTPs and long-dead refresh tokens have no value and hold personal data. */
  async purgeExpired(): Promise<{ otp: number; refreshTokens: number }> {
    const otp = await this.pool.query(`DELETE FROM identity.otp_challenges WHERE created_at < now() - interval '1 day'`);
    // Only by expiry: a token that replaced another always expires later, so the replaced_by FK is never orphaned.
    const rt = await this.pool.query(`DELETE FROM identity.refresh_tokens WHERE expires_at < now() - interval '7 days'`);
    return { otp: otp.rowCount ?? 0, refreshTokens: rt.rowCount ?? 0 };
  }
}
