-- B2: vendor-neutral ID verification records, controlled reason codes, staff invitations.
-- Data minimisation: no ID numbers, images or raw vendor payloads are stored. Only our own normalised result.
CREATE TABLE verification.reason_codes (
  code text PRIMARY KEY, description text NOT NULL
);
INSERT INTO verification.reason_codes VALUES
  ('id_mismatch','Government record does not match the ID supplied'),
  ('face_mismatch','Selfie does not match the ID photo'),
  ('liveness_failed','Liveness check failed'),
  ('document_invalid','Document unreadable, expired or not accepted'),
  ('duplicate_identity','This ID is already verified on another account'),
  ('provider_error','Verification provider error'),
  ('expired','Verification session expired'),
  ('manual_approve','Approved by a reviewer'),
  ('manual_reject','Rejected by a reviewer');

CREATE TABLE identity.verification_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id),
  provider text NOT NULL,
  provider_session_id text,
  status text NOT NULL CHECK (status IN ('PENDING','IN_PROGRESS','VERIFIED','FAILED','REVIEW_REQUIRED','EXPIRED')),
  reason_code text REFERENCES verification.reason_codes(code),
  checks jsonb NOT NULL DEFAULT '{}',
  id_fingerprint bytea,                 -- keyed hash of (id type + number); the number itself is never stored
  decided_by uuid REFERENCES identity.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (provider, provider_session_id)
);
CREATE INDEX vsess_user_idx ON identity.verification_sessions (user_id, created_at DESC);
CREATE INDEX vsess_status_idx ON identity.verification_sessions (status, created_at);
-- One verified account per real-world ID, enforced by the database
CREATE UNIQUE INDEX vsess_one_verified_per_id ON identity.verification_sessions (id_fingerprint)
  WHERE status = 'VERIFIED' AND id_fingerprint IS NOT NULL;

CREATE TABLE identity.verification_events (   -- stored BEFORE processing; provider event ids make webhooks idempotent
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  body_sha256 bytea NOT NULL,
  normalised jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE identity.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id),
  phone text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager_admin','manager_staff','agent')),
  invited_by uuid NOT NULL REFERENCES identity.users(id),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_org_idx ON identity.invitations (org_id);
