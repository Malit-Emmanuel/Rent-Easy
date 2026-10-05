export type DomainEvent =
  | { type: 'UserVerified'; userId: string }
  | { type: 'UnitVerified'; unitId: string } | { type: 'BadgeExpired'; badgeId: string }
  | { type: 'ListingPublished'; listingId: string } | { type: 'ListingStale'; listingId: string }
  | { type: 'ViewingConfirmed'; viewingId: string; listingId: string }
  | { type: 'ApplicationSubmitted'; applicationId: string } | { type: 'ApplicationAccepted'; applicationId: string }
  | { type: 'LeaseSigned'; leaseId: string }
  | { type: 'PaymentConfirmed'; paymentRequestId: string } | { type: 'PaymentFailed'; paymentRequestId: string }
  | { type: 'ConsentGranted'; consentId: string } | { type: 'ConsentRevoked'; consentId: string }
  | { type: 'DisputeOpened'; disputeId: string } | { type: 'DisputeResolved'; disputeId: string };

type Handler<T extends DomainEvent['type']> = (e: Extract<DomainEvent, { type: T }>) => Promise<void> | void;

export class EventBus {
  private handlers = new Map<string, Handler<any>[]>();
  on<T extends DomainEvent['type']>(type: T, h: Handler<T>) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  /** One failing subscriber must not block the others; errors are collected and rethrown together. */
  async emit(e: DomainEvent) {
    const errors: unknown[] = [];
    for (const h of this.handlers.get(e.type) ?? []) { try { await h(e); } catch (err) { errors.push(err); } }
    if (errors.length) throw new AggregateError(errors, `handler(s) failed for ${e.type}`);
  }
}
