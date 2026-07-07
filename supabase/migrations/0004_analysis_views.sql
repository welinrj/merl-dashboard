-- =============================================================================
-- MERL Dashboard – Migration 0004: public analysis views for the Analysis & GIS page
-- =============================================================================
-- PostgREST only exposes the `public` schema, so the frontend cannot read the
-- `merl` tables directly. These security_invoker views surface the data the
-- Analysis & GIS page needs (indicator time-series, mappable L&D events, and
-- GEDSI engagement aggregates) while the caller's RLS on the underlying merl
-- tables still applies.
-- =============================================================================

BEGIN;

-- Indicator time-series (verified points) with target/baseline for % progress.
CREATE OR REPLACE VIEW public.v_indicator_trends
WITH (security_invoker = on) AS
SELECT
    iv.id,
    iv.indicator_id,
    i.code,
    i.name,
    i.domain::TEXT              AS domain,
    i.unit,
    i.baseline_value,
    i.target_value,
    iv.value,
    iv.reporting_period,
    iv.location_province,
    iv.disaggregation_key,
    iv.disaggregation_value,
    iv.verified
FROM merl.indicator_values iv
JOIN merl.indicators i ON i.id = iv.indicator_id;

-- L&D events with point coordinates extracted from PostGIS geometry.
CREATE OR REPLACE VIEW public.v_ld_events
WITH (security_invoker = on) AS
SELECT
    e.id,
    e.event_name,
    e.event_type::TEXT   AS event_type,
    e.onset_type::TEXT   AS onset_type,
    e.start_date,
    e.end_date,
    e.provinces_affected,
    e.islands_affected,
    e.economic_loss_vuv,
    ST_Y(e.geom)         AS lat,
    ST_X(e.geom)         AS lng
FROM merl.ld_events e
WHERE e.geom IS NOT NULL;

-- GEDSI-disaggregated engagement aggregates by province (for charts + map density).
CREATE OR REPLACE VIEW public.v_engagement_stats
WITH (security_invoker = on) AS
SELECT
    ce.province,
    COUNT(*)                          AS engagements,
    SUM(ce.total_participants)        AS total_participants,
    SUM(ce.male_participants)         AS male_participants,
    SUM(ce.female_participants)       AS female_participants,
    SUM(ce.youth_participants)        AS youth_participants,
    SUM(ce.disability_participants)   AS disability_participants
FROM merl.community_engagements ce
GROUP BY ce.province;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_indicator_trends,
                        public.v_ld_events,
                        public.v_engagement_stats
              TO authenticated;
    END IF;
END;
$$;

COMMIT;
