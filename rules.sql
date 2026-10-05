-- Behavioural tests for DB-enforced rules. Each block must raise or pass as labelled.
\set ON_ERROR_STOP off
\echo '--- audit: insert, chain, and immutability'
INSERT INTO governance.audit_events(action,subject_type,subject_id) VALUES ('t1','x','1'),('t2','x','2');
SELECT (SELECT prev_hash FROM governance.audit_events WHERE action='t2') = (SELECT hash FROM governance.audit_events WHERE action='t1') AS chain_linked;
UPDATE governance.audit_events SET action='tamper';   -- EXPECT ERROR
DELETE FROM governance.audit_events;                  -- EXPECT ERROR

\echo '--- ledger: balanced ok, unbalanced rejected, immutable'
INSERT INTO txn.ledger_accounts(code) VALUES ('A'),('B');
BEGIN;
INSERT INTO txn.ledger_entries(txn_id,account_id,direction,amount_minor)
 SELECT '00000000-0000-0000-0000-000000000001', id, CASE code WHEN 'A' THEN 'debit' ELSE 'credit' END, 5000 FROM txn.ledger_accounts;
COMMIT;                                               -- EXPECT OK
BEGIN;
INSERT INTO txn.ledger_entries(txn_id,account_id,direction,amount_minor)
 SELECT '00000000-0000-0000-0000-000000000002', id, 'debit', 100 FROM txn.ledger_accounts WHERE code='A';
COMMIT;                                               -- EXPECT ERROR (unbalanced)
UPDATE txn.ledger_entries SET amount_minor=1;         -- EXPECT ERROR

\echo '--- listing: cannot publish without all 5 costs'
INSERT INTO identity.organizations(id,name,kind) VALUES ('11111111-1111-1111-1111-111111111111','Org','agency');
INSERT INTO supply.properties(id,org_id,name,address_text) VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','P','addr');
INSERT INTO supply.units(id,property_id,label,bedrooms) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','A1',1);
INSERT INTO supply.listings(id,unit_id) VALUES ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333');
UPDATE supply.listings SET status='published' WHERE id='44444444-4444-4444-4444-444444444444';  -- EXPECT ERROR
INSERT INTO supply.listing_costs(listing_id,cost_type,amount_minor)
 SELECT '44444444-4444-4444-4444-444444444444', t, 0 FROM unnest(ARRAY['rent','deposit','utility_deposit','service_charge','agent_fee']) t;
UPDATE supply.listings SET status='published' WHERE id='44444444-4444-4444-4444-444444444444';  -- EXPECT OK
