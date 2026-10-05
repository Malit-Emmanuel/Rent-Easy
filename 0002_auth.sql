-- B2: OTP challenges and rotating refresh tokens. Only hashes are stored, never raw codes or tokens.
CREATE TABLE identity.otp_challenges (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  code_hmac bytea NOT NULL,             -- HMAC(pepper, id || code); 6-digit codes are never stored
  attempts smallint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_created_idx ON identity.otp_challenges (phone, created_at DESC);

CREATE TABLE identity.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,              -- one family per login session
  user_id uuid NOT NULL REFERENCES identity.users(id),
  token_hash bytea NOT NULL UNIQUE,     -- SHA-256 of the opaque token
  device_id text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES identity.refresh_tokens(id)
);
CREATE INDEX refresh_family_idx ON identity.refresh_tokens (family_id);
CREATE INDEX refresh_user_idx ON identity.refresh_tokens (user_id);
