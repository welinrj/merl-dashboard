-- =============================================================================
-- MERL Dashboard – Migration 0032: reporting-workflow hardening (Phase 2)
-- =============================================================================
-- Locks approved reporting periods and their period data, adds a controlled
-- reopen-with-reason flow (DoCC M&E Officer), and enforces the transition-role
-- rules at the database level. All workflow changes remain audited by the
-- existing trg_audit_reporting_periods trigger.
--
-- Workflow: draft -> submitted -> reviewed -> approved (locked)
--                       ^                        |
--                       └── returned ────────────┘   (reopen -> draft, audited)
-- =============================================================================

-- 1) Lock / reopen bookkeeping on reporting periods ---------------------------
ALTER TABLE merl.reporting_periods
    ADD COLUMN IF NOT EXISTS locked_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopened_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopened_by   UUID REFERENCES merl.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- Backfill: any already-approved period is locked as of its approval time.
UPDATE merl.reporting_periods
   SET locked_at = COALESCE(locked_at, approved_at, NOW())
 WHERE submission_status = 'approved' AND locked_at IS NULL;

-- 2) Approve now locks the period; review/return unchanged (M&E/SA only) ------
CREATE OR REPLACE FUNCTION public.review_reporting_period(p_id uuid, p_decision text, p_comments text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users; v_status TEXT;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('system_admin','docc_me_officer') THEN
        RAISE EXCEPTION 'Approver access required (DoCC M&E Officer)';
    END IF;
    v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned'
                    WHEN 'review' THEN 'reviewed' ELSE NULL END;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Invalid decision: %', p_decision; END IF;
    IF v_status = 'returned' AND COALESCE(TRIM(p_comments),'') = '' THEN
        RAISE EXCEPTION 'A review comment is required when returning a submission for correction';
    END IF;
    UPDATE merl.reporting_periods SET submission_status=v_status, reviewer_id=v_user.id,
           review_comments=p_comments,
           approved_at=CASE WHEN v_status='approved' THEN NOW() ELSE approved_at END,
           locked_at  =CASE WHEN v_status='approved' THEN NOW() ELSE locked_at  END,
           updated_by=v_user.id
     WHERE id=p_id AND submission_status IN ('submitted','reviewed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not awaiting review'; END IF;
END; $fn$;

-- 3) Reopen an approved period (DoCC M&E Officer, reason required, audited) ----
CREATE OR REPLACE FUNCTION public.reopen_reporting_period(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF NOT merl.has_permission('reports.reopen') THEN
        RAISE EXCEPTION 'Reopen requires the DoCC M&E Officer' USING ERRCODE='42501';
    END IF;
    IF COALESCE(TRIM(p_reason),'') = '' THEN
        RAISE EXCEPTION 'A reason is required to reopen an approved reporting period';
    END IF;
    UPDATE merl.reporting_periods
       SET submission_status='draft', approved_at=NULL, locked_at=NULL,
           reopened_at=NOW(), reopened_by=v_user.id, reopen_reason=p_reason,
           review_comments=p_reason, updated_by=v_user.id
     WHERE id=p_id AND submission_status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not in an approved state'; END IF;
END; $fn$;

-- 4) Guard edits/submits of an approved (locked) period -----------------------
CREATE OR REPLACE FUNCTION public.submit_reporting_period(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users; v_pid UUID;
BEGIN
    v_user := merl.require_editor();
    SELECT project_id INTO v_pid FROM merl.reporting_periods WHERE id=p_id;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
    IF NOT merl.can_access_project(v_pid) THEN
        RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
    END IF;
    UPDATE merl.reporting_periods SET submission_status='submitted', submitted_at=NOW(), updated_by=v_user.id
     WHERE id=p_id AND submission_status IN ('draft','returned');
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not in a submittable state'; END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION public.upsert_reporting_period(p_id uuid, p_project_id uuid, p_period_label text,
    p_period_type text DEFAULT NULL, p_period_start date DEFAULT NULL, p_period_end date DEFAULT NULL,
    p_reporting_officer_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users; v_id UUID; v_status TEXT;
BEGIN
    v_user := merl.require_editor();
    IF p_id IS NULL THEN
        IF NOT merl.can_access_project(p_project_id) THEN
            RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
        END IF;
        INSERT INTO merl.reporting_periods (project_id, period_label, period_type, period_start,
            period_end, reporting_officer_id, created_by, updated_by)
        VALUES (p_project_id, p_period_label, p_period_type, p_period_start, p_period_end,
            COALESCE(p_reporting_officer_id, v_user.id), v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        SELECT submission_status INTO v_status FROM merl.reporting_periods WHERE id=p_id;
        IF v_status = 'approved' THEN
            RAISE EXCEPTION 'This reporting period is approved and locked. Reopen it before editing.' USING ERRCODE='42501';
        END IF;
        UPDATE merl.reporting_periods SET period_label=p_period_label, period_type=p_period_type,
            period_start=p_period_start, period_end=p_period_end,
            reporting_officer_id=COALESCE(p_reporting_officer_id, reporting_officer_id), updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
    END IF;
    RETURN v_id;
END; $fn$;

-- 5) Lock the period DATA: block writes to indicator/financial progress rows
--    whose (project, period) is an approved reporting period. System
--    Administrator retains an emergency override (audited); everyone else must
--    have the M&E Officer reopen the period first.
CREATE OR REPLACE FUNCTION merl.fn_block_locked_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_pid UUID; v_period TEXT; v_actor merl.users;
BEGIN
    IF TG_OP = 'DELETE' THEN v_pid := OLD.project_id; v_period := OLD.reporting_period;
    ELSE                     v_pid := NEW.project_id; v_period := NEW.reporting_period; END IF;
    IF v_period IS NOT NULL AND EXISTS (
        SELECT 1 FROM merl.reporting_periods rp
        WHERE rp.project_id = v_pid AND rp.period_label = v_period AND rp.submission_status = 'approved'
    ) THEN
        v_actor := merl.current_db_user();
        IF v_actor.role IS DISTINCT FROM 'system_admin' THEN
            RAISE EXCEPTION 'This reporting period is approved and locked. The DoCC M&E Officer must reopen it before changes.'
                USING ERRCODE='42501';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $fn$;

DROP TRIGGER IF EXISTS trg_lock_indicator_progress ON merl.indicator_progress;
CREATE TRIGGER trg_lock_indicator_progress
    BEFORE INSERT OR UPDATE OR DELETE ON merl.indicator_progress
    FOR EACH ROW EXECUTE FUNCTION merl.fn_block_locked_period();

DROP TRIGGER IF EXISTS trg_lock_financial_progress ON merl.financial_progress;
CREATE TRIGGER trg_lock_financial_progress
    BEFORE INSERT OR UPDATE OR DELETE ON merl.financial_progress
    FOR EACH ROW EXECUTE FUNCTION merl.fn_block_locked_period();

-- 6) Expose lock state to the app (preserve existing columns; append new) -----
CREATE OR REPLACE VIEW public.v_reporting_periods WITH (security_invoker = on) AS
SELECT rp.id, rp.project_id, rp.period_label, rp.period_type, rp.period_start, rp.period_end,
       rp.reporting_officer_id, rp.submission_status, rp.submitted_at, rp.reviewer_id,
       rp.review_comments, rp.approved_at, rp.created_by, rp.created_at, rp.updated_by, rp.updated_at,
       ro.full_name AS reporting_officer_name, rv.full_name AS reviewer_name,
       rp.locked_at, rp.reopened_at, rp.reopened_by, rp.reopen_reason,
       (rp.submission_status = 'approved') AS is_locked
FROM merl.reporting_periods rp
  LEFT JOIN merl.users ro ON ro.id = rp.reporting_officer_id
  LEFT JOIN merl.users rv ON rv.id = rp.reviewer_id;

-- 7) Grants -------------------------------------------------------------------
DO $g$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.reopen_reporting_period(uuid,text) TO authenticated;
        GRANT SELECT ON public.v_reporting_periods TO authenticated;
    END IF;
END $g$;
