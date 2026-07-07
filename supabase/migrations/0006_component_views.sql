-- =============================================================================
-- MERL Dashboard – Migration 0006: public views for L&D Components (activities)
-- =============================================================================
-- The "components" of the programme are the work-plan activities. These
-- security_invoker views expose them (with computed expenditure and milestone
-- progress) plus their milestones, for the L&D Components page.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_activities
WITH (security_invoker = on) AS
SELECT
    a.id,
    a.code,
    a.name,
    a.description,
    a.domain::TEXT   AS domain,
    a.phase,
    a.start_date,
    a.end_date,
    a.status::TEXT   AS status,
    a.lead_officer,
    a.budget_vuv,
    a.budget_nzd,
    COALESCE((
        SELECT SUM(t.amount_vuv)
        FROM merl.financial_transactions t
        WHERE t.activity_id = a.id AND t.transaction_type = 'expenditure'
    ), 0)            AS spent_vuv,
    (SELECT COUNT(*) FROM merl.activity_milestones m WHERE m.activity_id = a.id)                          AS milestone_total,
    (SELECT COUNT(*) FROM merl.activity_milestones m WHERE m.activity_id = a.id AND m.status = 'completed') AS milestone_done
FROM merl.activities a;

CREATE OR REPLACE VIEW public.v_activity_milestones
WITH (security_invoker = on) AS
SELECT
    m.id,
    m.activity_id,
    m.milestone_name,
    m.due_date,
    m.completed_date,
    m.status::TEXT AS status,
    m.notes
FROM merl.activity_milestones m;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_activities, public.v_activity_milestones TO authenticated;
    END IF;
END;
$$;

COMMIT;
