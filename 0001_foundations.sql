-- M0 Foundations. Money = integer minor units. UUID keys. Ledger + audit are append-only.
-- Extensions live in their own schema (Supabase convention); we always qualify what we use from it.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS verification;
CREATE SCHEMA IF NOT EXISTS supply;
CREATE SCHEMA IF NOT EXISTS txn;

CREATE OR REPLACE FUNCTION governance.forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only; write a correcting entry instead', TG_TABLE_NAME; END $$ LANGUAGE plpgsql SET search_path = pg_catalog;

CREATE OR REPLACE FUNCTION governance.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql SET search_path = pg_catalog;

-- ---------- Identity (M1) ----------
CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  full_name text,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','sw')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_touch BEFORE UPDATE ON identity.users FOR EACH ROW EXECUTE FUNCTION governance.touch_updated_at();

CREATE TABLE identity.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('agency','management_firm','landlord','developer','lender')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One user, many organisations, different role in each (Plan §3.2)
CREATE TABLE identity.memberships (
  user_id uuid NOT NULL REFERENCES identity.users(id),
  org_id  uuid NOT NULL REFERENCES identity.organizations(id),
  role text NOT NULL CHECK (role IN ('manager_admin','manager_staff','landlord','agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, role)
);

CREATE TABLE identity.platform_roles (
  user_id uuid NOT NULL REFERENCES identity.users(id),
  role text NOT NULL CHECK (role IN ('tenant','reviewer','support','super_admin')),
  PRIMARY KEY (user_id, role)
);

-- ---------- Governance (M11): audit + consent ----------
CREATE TABLE governance.audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  prev_hash bytea,
  hash bytea NOT NULL
);
-- Tamper-evident hash chain, serialised by an advisory lock
CREATE OR REPLACE FUNCTION governance.audit_chain() RETURNS trigger AS $$
DECLARE last bytea;
BEGIN
  PERFORM pg_advisory_xact_lock(7001);
  SELECT hash INTO last FROM governance.audit_events ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last;
  NEW.hash := extensions.digest(coalesce(last,'\x') || convert_to(
    NEW.occurred_at::text || coalesce(NEW.actor_id::text,'') || NEW.action ||
    NEW.subject_type || NEW.subject_id || NEW.metadata::text, 'UTF8'), 'sha256');
  RETURN NEW;
END $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
CREATE TRIGGER audit_chain_ins BEFORE INSERT ON governance.audit_events FOR EACH ROW EXECUTE FUNCTION governance.audit_chain();
CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON governance.audit_events FOR EACH ROW EXECUTE FUNCTION governance.forbid_mutation();

CREATE TABLE governance.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id uuid NOT NULL REFERENCES identity.users(id),
  grantee_org_id uuid REFERENCES identity.organizations(id),
  grantee_user_id uuid REFERENCES identity.users(id),
  scope text[] NOT NULL CHECK (cardinality(scope) > 0),
  purpose text NOT NULL,
  policy_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (grantee_org_id IS NOT NULL OR grantee_user_id IS NOT NULL)
);

CREATE TABLE governance.data_access_log (
  id bigserial PRIMARY KEY,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  accessor_id uuid NOT NULL,
  subject_user_id uuid,
  resource text NOT NULL,
  consent_id uuid REFERENCES governance.consents(id),
  reason text
);
CREATE TRIGGER dal_no_mutation BEFORE UPDATE OR DELETE ON governance.data_access_log FOR EACH ROW EXECUTE FUNCTION governance.forbid_mutation();

-- ---------- Verification (M2) ----------
CREATE TABLE verification.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','organization','property','unit','listing')),
  subject_id uuid NOT NULL,
  level text NOT NULL CHECK (level IN ('id_verified','registered_agent','t1_documented','t2_video','t3_field')),
  verified_by uuid REFERENCES identity.users(id),
  evidence_ref text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,          -- T1 12 months, T2 6 months (Plan §4.3)
  revoked_at timestamptz,
  revoke_reason_code text,
  CHECK (revoked_at IS NULL OR revoke_reason_code IS NOT NULL)  -- reason codes mandatory
);

-- ---------- Supply (M3/M4) ----------
CREATE TABLE supply.nodes (id serial PRIMARY KEY, name text NOT NULL UNIQUE);

CREATE TABLE supply.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES identity.organizations(id),
  node_id int REFERENCES supply.nodes(id),
  name text NOT NULL,
  address_text text NOT NULL,
  location extensions.geography(Point,4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_loc_gix ON supply.properties USING gist (location);

-- Units, not listings, are the core object
CREATE TABLE supply.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES supply.properties(id),
  label text NOT NULL,
  bedrooms smallint NOT NULL CHECK (bedrooms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, label)
);

CREATE TABLE supply.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES supply.units(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','stale','let','withdrawn')),
  published_at timestamptz,
  last_confirmed_at timestamptz,      -- reminder at 14d, hide at 21d (tunable)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supply.listing_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES supply.listings(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('rent','deposit','utility_deposit','service_charge','agent_fee')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),   -- zero is a valid value
  currency char(3) NOT NULL DEFAULT 'KES',
  UNIQUE (listing_id, cost_type)
);

-- Rule: complete cost disclosure — cannot publish unless all five cost rows exist
CREATE OR REPLACE FUNCTION supply.require_full_costs() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'published' AND (SELECT count(*) FROM supply.listing_costs WHERE listing_id = NEW.id) < 5 THEN
    RAISE EXCEPTION 'listing % cannot be published: rent, deposit, utility_deposit, service_charge and agent_fee are all required', NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
CREATE TRIGGER listings_full_costs BEFORE INSERT OR UPDATE OF status ON supply.listings FOR EACH ROW EXECUTE FUNCTION supply.require_full_costs();

-- ---------- Transactions (M8): idempotent payments + double-entry ledger ----------
CREATE TABLE txn.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  lease_id uuid NOT NULL,
  payer_id uuid NOT NULL REFERENCES identity.users(id),
  payee_ref text NOT NULL,              -- verified payee only
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','needs_reconciliation')),
  psp_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE txn.psp_webhook_events (   -- stored BEFORE processing; replay-safe
  id bigserial PRIMARY KEY,
  psp_event_id text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  processed_at timestamptz
);

CREATE TABLE txn.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,            -- e.g. TENANT:<lease>, LANDLORD:<org>, PSP_CLEARING
  currency char(3) NOT NULL DEFAULT 'KES'
);

CREATE TABLE txn.ledger_entries (
  id bigserial PRIMARY KEY,
  txn_id uuid NOT NULL,                 -- groups the legs of one transaction
  account_id uuid NOT NULL REFERENCES txn.ledger_accounts(id),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'KES',
  lease_id uuid,
  period text,                          -- e.g. 2026-10
  payment_ref text,
  reverses_entry_id bigint REFERENCES txn.ledger_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_txn_idx ON txn.ledger_entries (txn_id);
CREATE TRIGGER ledger_no_mutation BEFORE UPDATE OR DELETE ON txn.ledger_entries FOR EACH ROW EXECUTE FUNCTION governance.forbid_mutation();

-- Debits must equal credits per txn_id, checked at commit
CREATE OR REPLACE FUNCTION txn.assert_balanced() RETURNS trigger AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT coalesce(sum(amount_minor) FILTER (WHERE direction='debit'),0),
         coalesce(sum(amount_minor) FILTER (WHERE direction='credit'),0)
    INTO d, c FROM txn.ledger_entries WHERE txn_id = NEW.txn_id;
  IF d <> c THEN RAISE EXCEPTION 'ledger txn % unbalanced: debit % <> credit %', NEW.txn_id, d, c; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON txn.ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION txn.assert_balanced();
