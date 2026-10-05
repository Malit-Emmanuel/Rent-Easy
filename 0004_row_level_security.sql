-- Defence in depth. The API connects as the database owner (bypasses RLS) and does all authorisation.
-- Enabling RLS with no policies means anyone using Supabase's auto-generated API roles sees nothing,
-- even if one of these schemas is ever exposed by mistake.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('identity','governance','verification','supply','txn')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA identity, governance, verification, supply, txn FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA identity, governance, verification, supply, txn FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA identity, governance, verification, supply, txn FROM anon, authenticated';
  END IF;
END $$;
