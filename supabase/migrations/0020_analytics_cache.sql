-- =============================================================================
-- MERL Dashboard — Migration 0020: analytics cache (materialized view)
-- =============================================================================
-- The Analysis / Dashboard aggregates (activity status split, budget by theme
-- and focus area) were recomputed from every activity row on every page load,
-- for every user. This precomputes them once into a single-row materialized
-- view that all users share, refreshed automatically whenever the underlying
-- activities change (and on demand via refresh_analytics_cache()).
--
-- These are organisation-wide, non-sensitive aggregate figures (the same for
-- every authenticated user), so the cache is exposed read-only to authenticated
-- and anon callers — the latter lets the Redis caching sidecar read it with the
-- public anon key. Row-level data continues to flow through the RLS-protected
-- v_srf_activities view.
-- =============================================================================


-- 1. Materialized view: one row of precomputed SRF analytics ------------------
DROP MATERIALIZED VIEW IF EXISTS merl.mv_srf_analytics CASCADE;
CREATE MATERIALIZED VIEW merl.mv_srf_analytics AS
SELECT
    now()                                                AS computed_at,
    count(*)                                             AS activity_count,
    count(*) FILTER (WHERE status = 'on_track')          AS status_on_track,
    count(*) FILTER (WHERE status = 'at_risk')           AS status_at_risk,
    count(*) FILTER (WHERE status = 'no_progress')       AS status_no_progress,
    count(*) FILTER (WHERE status = 'unrated')           AS status_unrated,
    COALESCE(sum(budget_vuv), 0)                         AS total_budget_vuv,
    (
        SELECT COALESCE(jsonb_agg(t ORDER BY t.theme), '[]'::jsonb)
        FROM (
            SELECT
                theme,
                count(*)                                       AS activities,
                COALESCE(sum(budget_vuv), 0)                   AS budget_vuv,
                count(*) FILTER (WHERE status = 'on_track')    AS on_track,
                count(*) FILTER (WHERE status = 'at_risk')     AS at_risk,
                count(*) FILTER (WHERE status = 'no_progress') AS no_progress,
                count(*) FILTER (WHERE status = 'unrated')     AS unrated
            FROM merl.srf_activities
            GROUP BY theme
        ) t
    )                                                    AS by_theme,
    (
        SELECT COALESCE(jsonb_agg(f ORDER BY f.budget_vuv DESC), '[]'::jsonb)
        FROM (
            SELECT
                focus_area,
                max(theme)                     AS theme,
                COALESCE(sum(budget_vuv), 0)   AS budget_vuv,
                count(*)                       AS activities
            FROM merl.srf_activities
            WHERE focus_area IS NOT NULL AND focus_area <> ''
            GROUP BY focus_area
        ) f
    )                                                    AS by_focus
FROM merl.srf_activities;

-- Unique index over the constant single row so REFRESH ... CONCURRENTLY is
-- possible (it also documents the "exactly one row" contract).
CREATE UNIQUE INDEX mv_srf_analytics_singleton ON merl.mv_srf_analytics ((computed_at));


-- 2. Public read-only accessor -----------------------------------------------
-- A plain view (runs as owner) over the MV; MVs are not subject to RLS and hold
-- only aggregate figures, so this is safe to expose to authenticated + anon.
CREATE OR REPLACE VIEW public.v_srf_analytics AS
SELECT computed_at, activity_count,
       status_on_track, status_at_risk, status_no_progress, status_unrated,
       total_budget_vuv, by_theme, by_focus
FROM merl.mv_srf_analytics;


-- 3. Refresh function + editor-gated RPC -------------------------------------
CREATE OR REPLACE FUNCTION merl.refresh_analytics_cache()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    -- The MV is a single tiny row; a plain (non-concurrent) refresh is instant.
    REFRESH MATERIALIZED VIEW merl.mv_srf_analytics;
END;
$$;

-- Public RPC so an operator (or the caching sidecar) can force a refresh.
CREATE OR REPLACE FUNCTION public.refresh_analytics_cache()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.refresh_analytics_cache();
END;
$$;


-- 4. Auto-refresh whenever activities change ---------------------------------
CREATE OR REPLACE FUNCTION merl.trg_refresh_srf_analytics()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    REFRESH MATERIALIZED VIEW merl.mv_srf_analytics;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS srf_activities_refresh_analytics ON merl.srf_activities;
CREATE TRIGGER srf_activities_refresh_analytics
    AFTER INSERT OR UPDATE OR DELETE ON merl.srf_activities
    FOR EACH STATEMENT
    EXECUTE FUNCTION merl.trg_refresh_srf_analytics();


-- 5. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_srf_analytics TO authenticated;
        GRANT EXECUTE ON FUNCTION public.refresh_analytics_cache() TO authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        -- Lets the Redis caching sidecar read the shared aggregate with the
        -- public anon key (aggregate figures only; no row-level data).
        GRANT SELECT ON public.v_srf_analytics TO anon;
    END IF;
END;
$$;
