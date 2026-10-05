import { VerificationStatus } from '../../providers/ports';

const ALLOWED: Record<VerificationStatus, VerificationStatus[]> = {
  PENDING: ['IN_PROGRESS', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'EXPIRED'],
  IN_PROGRESS: ['VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'EXPIRED'],
  REVIEW_REQUIRED: ['VERIFIED', 'FAILED'],       // only a reviewer resolves this
  VERIFIED: [], FAILED: [], EXPIRED: [],         // terminal: start a new session instead
};
export const canTransition = (from: VerificationStatus, to: VerificationStatus) => ALLOWED[from].includes(to);

export const REASON_CODES = ['id_mismatch', 'face_mismatch', 'liveness_failed', 'document_invalid',
  'duplicate_identity', 'provider_error', 'expired', 'manual_approve', 'manual_reject'] as const;
/** Vendors invent their own reasons; anything outside our controlled list becomes provider_error. */
export const normaliseReason = (c?: string) => (c && (REASON_CODES as readonly string[]).includes(c) ? c : c ? 'provider_error' : undefined);
