import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { IdentityProviderPort, NormalisedIdentityResult, VerificationStatus } from '../../providers/ports';

const STATUSES: VerificationStatus[] = ['PENDING', 'IN_PROGRESS', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'EXPIRED'];

/** Dev/test adapter with a signed-webhook flow that mirrors what real vendors do. Never used in production. */
@Injectable()
export class FakeIdentityProvider implements IdentityProviderPort {
  readonly name = 'fake';
  private secret = process.env.FAKE_IDV_WEBHOOK_SECRET ?? 'dev-only-fake-idv-secret';
  private sign = (body: string) => createHmac('sha256', this.secret).update(body).digest('hex');

  async createSession(r: { verificationId: string }) {
    return { providerSessionId: `fake-${randomUUID()}`, redirectUrl: `https://fake-idv.invalid/s/${r.verificationId}`,
             expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  }
  async getStatus(): Promise<NormalisedIdentityResult> { return { status: 'IN_PROGRESS' }; }

  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const sig = String(headers['x-signature'] ?? '');
    const expected = this.sign(rawBody);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new UnauthorizedException('bad signature');
    const p = JSON.parse(rawBody);
    if (!STATUSES.includes(p.status) || !p.eventId || !p.providerSessionId) throw new UnauthorizedException('bad payload');
    return { eventId: String(p.eventId), providerSessionId: String(p.providerSessionId),
      result: { status: p.status, reasonCode: p.reasonCode, checks: p.checks, idType: p.idType, documentNumber: p.documentNumber } as NormalisedIdentityResult };
  }

  async verifyIdentity(r: { idType: string; idNumber: string }): Promise<NormalisedIdentityResult> {
    return r.idNumber.endsWith('0') ? { status: 'FAILED', reasonCode: 'id_mismatch' }
      : { status: 'VERIFIED', idType: r.idType, documentNumber: r.idNumber, checks: { government_record: 'passed' } };
  }

  /** Test/dev helper: builds a correctly signed webhook as a vendor would send it. */
  buildWebhook(providerSessionId: string, result: Partial<NormalisedIdentityResult> & { status: VerificationStatus }, eventId = randomUUID()) {
    const rawBody = JSON.stringify({ eventId, providerSessionId, ...result });
    return { headers: { 'x-signature': this.sign(rawBody), 'content-type': 'application/json' }, rawBody };
  }
}
