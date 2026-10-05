-- Portable rule tests: run with psql OR Supabase's SQL runner. Everything rolls back (it ends by raising).
-- Read the result in the final error message: "RULES: N passed, M failed [...]".
DO $$
DECLARE passed int := 0; failed text[] := '{}';
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;

  -- audit chain links, and cannot be edited or deleted
  INSERT INTO governance.audit_events(action,subject_type,subject_id) VALUES ('t1','x','1');
  INSERT INTO governance.audit_events(action,subject_type,subject_id) VALUES ('t2','x','2');
  IF (SELECT prev_hash FROM governance.audit_events WHERE action='t2') = (SELECT hash FROM governance.audit_events WHERE action='t1')
    THEN passed := passed + 1; ELSE failed := failed || 'audit chain not linked'; END IF;
  BEGIN UPDATE governance.audit_events SET action='tamper'; failed := failed || 'audit UPDATE allowed';
  EXCEPTION WHEN raise_exception THEN passed := passed + 1; END;
  BEGIN DELETE FROM governance.audit_events; failed := failed || 'audit DELETE allowed';
  EXCEPTION WHEN raise_exception THEN passed := passed + 1; END;

  -- ledger: balanced entries accepted, unbalanced rejected, immutable
  INSERT INTO txn.ledger_accounts(id, code) VALUES ('a0000000-0000-0000-0000-00000000000a','A'),('b0000000-0000-0000-0000-00000000000b','B');
  BEGIN
    INSERT INTO txn.ledger_entries(txn_id,account_id,direction,amount_minor) VALUES
      ('00000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','debit',5000),
      ('00000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','credit',5000);
    passed := passed + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ('balanced ledger rejected: ' || SQLERRM); END;
  BEGIN
    INSERT INTO txn.ledger_entries(txn_id,account_id,direction,amount_minor) VALUES
      ('00000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','debit',100);
    failed := failed || 'unbalanced ledger accepted';
  EXCEPTION WHEN raise_exception THEN passed := passed + 1; END;
  BEGIN UPDATE txn.ledger_entries SET amount_minor = 1; failed := failed || 'ledger UPDATE allowed';
  EXCEPTION WHEN raise_exception THEN passed := passed + 1; END;

  -- listing cannot be published without all five costs (zero allowed)
  INSERT INTO identity.organizations(id,name,kind) VALUES ('11111111-1111-1111-1111-111111111111','Org','agency');
  INSERT INTO supply.properties(id,org_id,name,address_text,location)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','P','addr', extensions.st_point(36.8,-1.29)::extensions.geography);
  INSERT INTO supply.units(id,property_id,label,bedrooms) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','A1',1);
  INSERT INTO supply.listings(id,unit_id) VALUES ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333');
  BEGIN UPDATE supply.listings SET status='published' WHERE id='44444444-4444-4444-4444-444444444444'; failed := failed || 'published without costs';
  EXCEPTION WHEN raise_exception THEN passed := passed + 1; END;
  INSERT INTO supply.listing_costs(listing_id,cost_type,amount_minor)
    SELECT '44444444-4444-4444-4444-444444444444', t, 0 FROM unnest(ARRAY['rent','deposit','utility_deposit','service_charge','agent_fee']) t;
  BEGIN UPDATE supply.listings SET status='published' WHERE id='44444444-4444-4444-4444-444444444444'; passed := passed + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ('publish with all costs rejected: ' || SQLERRM); END;

  -- data constraints
  BEGIN INSERT INTO identity.users(phone) VALUES ('0712345678'); failed := failed || 'bad phone accepted';
  EXCEPTION WHEN check_violation THEN passed := passed + 1; END;
  BEGIN INSERT INTO verification.badges(subject_type,subject_id,level,expires_at,revoked_at) VALUES ('user',gen_random_uuid(),'id_verified',now(),now());
    failed := failed || 'revoked badge without reason accepted';
  EXCEPTION WHEN check_violation THEN passed := passed + 1; END;

  RAISE EXCEPTION 'RULES: % passed, % failed %', passed, cardinality(failed), failed;
END $$;
