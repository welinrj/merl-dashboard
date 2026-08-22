-- =============================================================================
-- 0025_realtime_core.sql
-- -----------------------------------------------------------------------------
-- Puts the core M&E tables on the Supabase realtime publication so dashboards
-- update live instead of only on page mount (ToR: "improves decision-making
-- using real-time information"). Previously only public.datasets and
-- merl.projects were published.
--
-- Guarded so it is idempotent and a no-op where the publication is absent
-- (e.g. a plain Postgres without the Supabase realtime stack).
-- =============================================================================
DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY[
        'merl.srf_activities',
        'merl.project_profiles',
        'merl.indicator_values'
    ];
    sch TEXT;
    tbl TEXT;
BEGIN
    IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RETURN;
    END IF;

    FOREACH t IN ARRAY tbls LOOP
        sch := split_part(t, '.', 1);
        tbl := split_part(t, '.', 2);
        IF NOT EXISTS (
            SELECT FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = sch
              AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
        END IF;
    END LOOP;
END $$;
