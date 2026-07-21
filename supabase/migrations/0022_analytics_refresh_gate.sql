-- =============================================================================
-- MERL Dashboard — Migration 0022: gate the analytics-cache refresh RPC
-- =============================================================================
-- public.refresh_analytics_cache() was executable by any signed-in user, which
-- let anyone force repeated materialized-view refreshes (minor DB-load abuse).
-- Restrict it to editors; the automatic trigger on merl.srf_activities keeps the
-- cache fresh for everyone else.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_analytics_cache()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    PERFORM merl.refresh_analytics_cache();
END;
$$;
