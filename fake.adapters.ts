import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isProductionEnv } from '../config/env';
import { PaymentsPort, SmsPort, StkPushRequest } from './ports';

/** Dev/test adapters. Real vendors replace these only after sandbox + legal review (ADR-0004). */
@Injectable()
export class FakeSms implements SmsPort {
  private log = new Logger('FakeSms');
  readonly outbox: { to: string; body: string }[] = [];   // for tests; capped
  async send(to: string, body: string) {
    if (isProductionEnv()) throw new Error('FakeSms must never run in production');
    this.outbox.push({ to, body }); if (this.outbox.length > 100) this.outbox.shift();
    this.log.log(`[DEV ONLY] SMS to ***${to.slice(-3)}: ${body}`);
    return { providerMessageId: randomUUID() };
  }
}

@Injectable()
export class FakePayments implements PaymentsPort {
  private seen = new Map<string, string>();
  async requestStkPush(r: StkPushRequest) {
    const existing = this.seen.get(r.idempotencyKey);      // retries never double-charge
    if (existing) return { pspReference: existing };
    const ref = `FAKE-${randomUUID()}`; this.seen.set(r.idempotencyKey, ref);
    return { pspReference: ref };
  }
  verifyWebhook(_h: Record<string, string>, rawBody: string) {
    const payload = JSON.parse(rawBody);
    return { eventId: String(payload.eventId), payload };
  }
  async queryStatus() { return 'pending' as const; }
}
