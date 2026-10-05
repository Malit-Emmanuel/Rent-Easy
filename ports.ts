// Every external vendor sits behind an interface (Plan §5.1, Risk R16).
export const SMS_PORT = Symbol('SMS_PORT');
export const PAYMENTS_PORT = Symbol('PAYMENTS_PORT');

export interface SmsPort { send(toE164: string, body: string): Promise<{ providerMessageId: string }> }

export interface StkPushRequest {
  idempotencyKey: string; phoneE164: string; amountMinor: bigint; currency: 'KES'; reference: string;
}
export interface PaymentsPort {
  requestStkPush(r: StkPushRequest): Promise<{ pspReference: string }>;
  /** Must verify the PSP signature and reject replays. */
  verifyWebhook(headers: Record<string, string>, rawBody: string): { eventId: string; payload: unknown };
  queryStatus(pspReference: string): Promise<'pending' | 'succeeded' | 'failed'>;
}

// ---- Identity verification: vendor-neutral contract (ADR-0009) ----
export type VerificationStatus = 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'FAILED' | 'REVIEW_REQUIRED' | 'EXPIRED';
export type CheckOutcome = 'passed' | 'failed' | 'not_run';

/** Our own result shape. Adapters translate every vendor's statuses and reasons into this. */
export interface NormalisedIdentityResult {
  status: VerificationStatus;
  reasonCode?: string;                                   // must be from verification.reason_codes
  checks?: Partial<Record<'document' | 'face_match' | 'liveness' | 'government_record' | 'aml', CheckOutcome>>;
  idType?: string;
  documentNumber?: string;                               // transient: hashed by the service, never stored
}

export interface IdentityProviderPort {
  readonly name: string;
  /** verificationId is our opaque reference; never send phone numbers or names as the reference. */
  createSession(r: { verificationId: string }): Promise<{ providerSessionId: string; redirectUrl?: string; expiresAt: Date }>;
  getStatus(providerSessionId: string): Promise<NormalisedIdentityResult>;
  /** Must verify the vendor's signature (throw UnauthorizedException if bad) and return a stable event id. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string):
    { eventId: string; providerSessionId: string; result: NormalisedIdentityResult };
  /** Direct government-record lookup. Not exposed via the API until counsel confirms ID-number handling (ADR-0002). */
  verifyIdentity(r: { idType: string; idNumber: string }): Promise<NormalisedIdentityResult>;
}
export const IDENTITY_PROVIDERS = Symbol('IDENTITY_PROVIDERS');
