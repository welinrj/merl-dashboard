-- MERL Dashboard – least privilege on the PostgREST surface
-- Adapted after the results-engine rebuild so it is safe when legacy tables
-- have already been retired.

DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('v','m')
      AND c.relname NOT LIKE 'public_portal_%'
      AND c.relname NOT IN ('geometry_columns','geography_columns')
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      v.relname
    );
  END LOOP;
END $$;

DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('v','m')
      AND c.relname LIKE 'v\_%'
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon',v.relname);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','activities','activity_milestones','community_engagements',
    'document_uploads','financial_transactions','indicator_values',
    'indicators','ld_events','learning_entries'
  ] LOOP
    IF to_regclass(format('merl.%I',t)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON merl.%I FROM anon, authenticated',
        t
      );
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
