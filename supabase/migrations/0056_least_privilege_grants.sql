-- =============================================================================
-- MERL Dashboard – Migration 0056: least privilege on the PostgREST surface
-- =============================================================================
-- The portal never writes through PostgREST. Every one of its ~30 mutations
-- goes through a SECURITY DEFINER RPC that performs its own role check
-- (merl.require_editor(), merl.has_permission(), an explicit role test), and
-- every SECURITY INVOKER function in `public` belongs to PostGIS. Verified
-- before writing this: the frontend contains zero .insert()/.update()/
-- .delete()/.upsert() calls against a table or view.
--
-- Despite that, `anon` and `authenticated` held INSERT, UPDATE and DELETE on
-- ~38 public views, 20 of which are simple enough for Postgres to treat as
-- auto-updatable onto their base tables, and `authenticated` held the same on
-- ten legacy merl tables. Row-level security was the only thing standing
-- between a signed-in Viewer and those tables.
--
-- RLS does currently hold — checked by evaluating each write policy under each
-- real role: a Viewer is refused on activities, indicators, ld_events,
-- financials and users, and an identity with no MERL profile is refused
-- everything. So this migration fixes no live exploit. What it removes is the
-- standing assumption that every future policy will be written perfectly: with
-- the grants gone, a permissive policy or an accidental `DISABLE ROW LEVEL
-- SECURITY` on one of these tables is no longer instantly a write primitive
-- for anyone holding the public anon key.
--
-- Deliberately NOT revoked:
--   · SELECT for `authenticated` — every read path depends on it, filtered by
--     RLS on the base tables.
--   · anything on public_portal_projects / _area_councils / _summary, which is
--     the anonymous public dashboard's only data source.
--   · anything from service_role or postgres, which the translation worker,
--     the village importer and the migrations themselves run as.
-- =============================================================================

-- 1) No write privileges through any public view, for either browser role. ----
--    Done dynamically so a view added later by an earlier-numbered migration
--    cannot be missed, and re-runnable.
DO $$
DECLARE v RECORD;
BEGIN
    FOR v IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('v', 'm')
          AND c.relname NOT LIKE 'public_portal_%'
          -- PostGIS's own metadata views are not ours to re-grant.
          AND c.relname NOT IN ('geometry_columns', 'geography_columns')
    LOOP
        EXECUTE format(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
            v.relname);
    END LOOP;
END $$;

-- 2) The anonymous role reads the published snapshot and nothing else. --------
--    These views are security_invoker, so `anon` could not actually read the
--    rows behind them either way (the underlying merl tables grant it nothing).
--    Removing the SELECT as well means the API stops advertising them, and the
--    grant no longer implies an access that does not exist.
DO $$
DECLARE v RECORD;
BEGIN
    FOR v IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('v', 'm')
          AND c.relname LIKE 'v\_%'
    LOOP
        EXECUTE format('REVOKE SELECT ON public.%I FROM anon', v.relname);
    END LOOP;
END $$;

-- 3) No direct writes to the legacy base tables. ------------------------------
--    These ten are the only merl tables that ever granted the browser role
--    INSERT/UPDATE/DELETE. Their RLS policies (role checks via
--    merl.current_db_user()) stay exactly as they are; this removes the
--    privilege that made those policies load-bearing.
--    merl.users is the one that matters most: it holds the role column, so a
--    write primitive here is a privilege escalation.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'activities', 'activity_milestones', 'community_engagements',
        'document_uploads', 'financial_transactions', 'indicator_values',
        'indicators', 'ld_events', 'learning_entries'
    ] LOOP
        EXECUTE format(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON merl.%I FROM anon, authenticated',
            t);
    END LOOP;
END $$;

-- 4) Stop the platform default from re-granting writes on views added later. --
--    Scoped to writes only: SELECT is left to the default so a new read view
--    keeps working, which is the common case and the safe one.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
