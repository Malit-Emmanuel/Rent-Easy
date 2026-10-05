# ADR-0009 Vendor-neutral ID verification layer

Status: Accepted | Date: 2026-10-01

## Decision
Platform code depends only on `IdentityVerificationService` and the `IdentityProviderPort` contract
(`createSession`, `getStatus`, `parseWebhook`, `verifyIdentity`). Each vendor is an adapter that translates its
statuses and reasons into ours: PENDING, IN_PROGRESS, VERIFIED, FAILED, REVIEW_REQUIRED, EXPIRED, plus a controlled
reason-code list. Only a fake adapter exists today. Candidates to evaluate: Smile ID, Didit, Sumsub.

## Rules built in
- We store our normalised result only: no ID numbers, images or raw vendor payloads.
- A keyed hash of (ID type + number) enforces one verified account per ID, in the database.
- Webhooks are signature-checked by the adapter, stored before processing, and idempotent by vendor event id.
- Terminal states never change; REVIEW_REQUIRED is resolved only by a reviewer, with a mandatory reason code on rejection.
- Reviewer queue reads are written to the data-access log.
- Direct ID-number lookup (`verifyIdentity`) is in the contract but not exposed through the API until counsel confirms handling of ID numbers (ADR-0002).
- ID verification and payment verification are separate ports; M-PESA/Daraja sits behind the payments adapter.

## Open items
Vendor choice follows legal review and the sandbox scorecard (docs/vendor-evaluation). Review-queue SLAs and reviewer
separation-of-duties arrive with B3.
