-- =============================================================================
-- MERL Dashboard – Migration 0035: enforce project scoping on writes, close the
-- approval lock, guard the administrator account, and validate form input.
-- =============================================================================
-- A full pass over the portal's data-entry surface (every form submitted as each
-- of the five official roles) surfaced twenty-one defects. This migration fixes
-- the database side of all of them. Frontend-only items are handled separately.
--
-- The two serious ones:
--
--  1. PROJECT SCOPING WAS NOT ENFORCED ON WRITES. Migration 0031 added
--     RESTRICTIVE `*_scope` policies calling can_access_project(), but every
--     write in the portal goes through a SECURITY DEFINER RPC owned by
--     `postgres`, which also owns the tables — and RLS is enabled without FORCE,
--     so the owner bypasses those policies entirely. A Project Manager assigned
--     to one project could rename a different project and delete its indicators,
--     while being unable to *read* that project at all.
--
--     Rather than add a guard to each of the 49 write RPCs (easy to miss one,
--     and any future RPC starts unguarded), scoping is enforced with row
--     triggers on the project-scoped tables. Triggers fire inside SECURITY
--     DEFINER functions, so this closes every write path at once — RPCs, future
--     RPCs, and any direct table access that ever bypasses RLS.
--
--  2. THE LAST ADMINISTRATOR COULD DELETE THEIR OWN ACCOUNT, leaving the portal
--     with zero administrators and no way to recover through its own UI.
--
-- Everything else is input validation that was missing at the database layer:
-- the approval lock covered only two of six period-scoped tables; beneficiary
-- disaggregation was never reconciled against its total; reporting periods were
-- free text, so a typo filed a record where no filter would ever find it.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Theme / Sector could not store two of its own dropdown options
-- =============================================================================
-- merl.projects.category is VARCHAR(30). Two of the twelve options the Project
-- Profile form offers are 43 characters ('Climate Information & Early Warning
-- Systems', 'Research, Monitoring & Knowledge Management'), so choosing either
-- failed with a raw "value too long for type character varying(30)". The
-- sibling column primary_climate_theme is already VARCHAR(120); match it.
--
-- Two views read these columns, and Postgres will not retype a column a view
-- depends on. Capture their definitions, widen, then put them back exactly as
-- they were — rather than hard-coding a copy of each view here, which would
-- silently revert whatever the latest migration made them.
DO $$
DECLARE
    v_projects_def  TEXT;
    v_locations_def TEXT;
BEGIN
    SELECT pg_get_viewdef('public.v_projects'::regclass, true) INTO v_projects_def;
    SELECT pg_get_viewdef('public.v_project_locations'::regclass, true) INTO v_locations_def;

    DROP VIEW IF EXISTS public.v_projects CASCADE;
    DROP VIEW IF EXISTS public.v_project_locations CASCADE;

    ALTER TABLE merl.projects           ALTER COLUMN category      TYPE VARCHAR(120);
    ALTER TABLE merl.projects           ALTER COLUMN coverage_type TYPE VARCHAR(60);
    ALTER TABLE merl.project_locations  ALTER COLUMN status        TYPE VARCHAR(60);

    EXECUTE format('CREATE VIEW public.v_projects WITH (security_invoker = on) AS %s', v_projects_def);
    EXECUTE format('CREATE VIEW public.v_project_locations WITH (security_invoker = on) AS %s', v_locations_def);

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_projects, public.v_project_locations TO authenticated;
    END IF;
END $$;

-- =============================================================================
-- 2. Project scoping, enforced on every write path
-- =============================================================================

-- Raise unless the caller may act on this project. Portfolio-wide roles
-- (administrator, M&E officer, viewer) always pass; Project Managers and Data
-- Entry Officers need an active assignment.
CREATE OR REPLACE FUNCTION merl.require_project_access(p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    -- A NULL project id carries no scope to check (and the NOT NULL constraints
    -- catch it where it matters), so let it through rather than masking the
    -- real error with a permissions message.
    IF p_project_id IS NULL THEN RETURN; END IF;
    IF NOT merl.can_access_project(p_project_id) THEN
        RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE = '42501';
    END IF;
END; $$;

-- Row trigger for tables carrying a project_id. Checks the row being written
-- and, on UPDATE, the row's previous project too — so a record cannot be moved
-- out of a project the caller controls into one they do not, or vice versa.
CREATE OR REPLACE FUNCTION merl.fn_enforce_project_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM merl.require_project_access(OLD.project_id);
        RETURN OLD;
    END IF;
    PERFORM merl.require_project_access(NEW.project_id);
    IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
        PERFORM merl.require_project_access(OLD.project_id);
    END IF;
    RETURN NEW;
END; $$;

-- The projects table itself is scoped on its own id.
--
-- INSERT is deliberately not gated here. Creating a project cannot be a scoping
-- violation — there is no existing project for the caller to be outside of, and
-- a brand-new row has no assignments yet by definition. Who may create one is
-- already decided by the require_editor() check inside upsert_project /
-- admin_create_project. Gating INSERT on projects.create here would additionally
-- strip Project Managers of the ability to register a project, which is a
-- permissions change nobody asked for and not what this migration is fixing.
CREATE OR REPLACE FUNCTION merl.fn_enforce_projects_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM merl.require_project_access(OLD.id);
        RETURN OLD;
    END IF;
    PERFORM merl.require_project_access(NEW.id);
    RETURN NEW;
END; $$;

-- Attach to every project-scoped table the portal writes through.
-- Deliberately excluded: code_counters (internal sequence bookkeeping),
-- user_project_assignments (the assignment table itself — guarded by
-- require_assignment_manager), and report_runs (an append-only export log).
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'objectives','outcomes','outputs','project_activities','project_indicators',
        'project_locations','reporting_periods','indicator_progress','financial_progress',
        'beneficiaries','risks_issues','learning_updates','evidence','activity_progress'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_scope_%1$s ON merl.%1$s', t);
        EXECUTE format(
            'CREATE TRIGGER trg_scope_%1$s BEFORE INSERT OR UPDATE OR DELETE ON merl.%1$s
             FOR EACH ROW EXECUTE FUNCTION merl.fn_enforce_project_scope()', t);
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_scope_projects ON merl.projects;
CREATE TRIGGER trg_scope_projects BEFORE INSERT OR UPDATE OR DELETE ON merl.projects
FOR EACH ROW EXECUTE FUNCTION merl.fn_enforce_projects_scope();

-- =============================================================================
-- 3. The permission catalogue now actually governs access
-- =============================================================================
-- Migration 0031 built a granular permission catalogue and granted the Data
-- Entry Officer five write permissions — activities.edit, beneficiaries.enter,
-- evidence.upload, indicator_progress.enter, risks.edit. Nothing ever consulted
-- it: every write RPC calls require_editor(), which hard-codes three roles and
-- excludes that one. The result was a role named "Data Entry Officer" that was
-- refused on all sixteen forms.
--
-- require_editor() gains an optional permission code. Passed one, it honours the
-- catalogue; called bare, it keeps the existing three-role behaviour, so the
-- RPCs not listed below are unchanged.
--
-- Adding a defaulted argument creates an OVERLOAD rather than replacing the
-- existing zero-argument function, which would make every bare require_editor()
-- call ambiguous. Drop the old signature first. Nothing hard-depends on it:
-- plpgsql bodies resolve function names at execution time, not at definition.
DROP FUNCTION IF EXISTS merl.require_editor();

CREATE OR REPLACE FUNCTION merl.require_editor(p_permission TEXT DEFAULT NULL)
RETURNS merl.users LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = merl, public AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user.id IS NULL THEN
        RAISE EXCEPTION 'Editor access required';
    END IF;
    IF p_permission IS NOT NULL THEN
        IF NOT merl.has_permission(p_permission) THEN
            RAISE EXCEPTION 'Editor access required';
        END IF;
        RETURN v_user;
    END IF;
    IF v_user.role NOT IN ('system_admin','docc_me_officer','project_manager') THEN
        RAISE EXCEPTION 'Editor access required';
    END IF;
    RETURN v_user;
END; $$;

-- =============================================================================
-- 4. The approval lock covered two of six period-scoped tables
-- =============================================================================
-- Once the M&E Officer approves a reporting period it is meant to be frozen
-- until formally reopened. merl.fn_block_locked_period was attached only to
-- indicator_progress and financial_progress, so Beneficiaries (Form 8),
-- Achievements & Learning (Form 10) and Evidence (Form 12) could all still be
-- written against an approved period. The UI hides the button, but the lock is
-- an audit control and belongs in the database.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['beneficiaries','learning_updates','evidence','activity_progress'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_lock_%1$s ON merl.%1$s', t);
        EXECUTE format(
            'CREATE TRIGGER trg_lock_%1$s BEFORE INSERT OR UPDATE OR DELETE ON merl.%1$s
             FOR EACH ROW EXECUTE FUNCTION merl.fn_block_locked_period()', t);
    END LOOP;
END $$;

-- =============================================================================
-- 5. A reporting period typo filed records where no filter could find them
-- =============================================================================
-- reporting_period is free text on every period-scoped table. Progress recorded
-- against 'Q9 1999' — a period that does not exist — saved cleanly and then sat
-- invisible in every period filter and rollup. Require that the label names a
-- real period on that project.
CREATE OR REPLACE FUNCTION merl.fn_check_reporting_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    IF NEW.reporting_period IS NULL OR btrim(NEW.reporting_period) = '' THEN
        RETURN NEW;   -- optional on some forms; NOT NULL handles it where required
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM merl.reporting_periods rp
        WHERE rp.project_id = NEW.project_id
          AND rp.period_label = NEW.reporting_period
    ) THEN
        RAISE EXCEPTION 'Reporting period "%" does not exist on this project. Create it first.',
            NEW.reporting_period;
    END IF;
    RETURN NEW;
END; $$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'indicator_progress','financial_progress','beneficiaries','learning_updates','evidence'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_period_%1$s ON merl.%1$s', t);
        EXECUTE format(
            'CREATE TRIGGER trg_period_%1$s BEFORE INSERT OR UPDATE ON merl.%1$s
             FOR EACH ROW EXECUTE FUNCTION merl.fn_check_reporting_period()', t);
    END LOOP;
END $$;

-- =============================================================================
-- 6. Column-level guards for values the forms accepted but should not have
-- =============================================================================

-- A negative approved budget was accepted (-5,000,000 VUV).
ALTER TABLE merl.projects DROP CONSTRAINT IF EXISTS projects_budget_nonneg;
ALTER TABLE merl.projects ADD CONSTRAINT projects_budget_nonneg
    CHECK (budget_vuv IS NULL OR budget_vuv >= 0);

-- Beneficiary disaggregation was never reconciled: female 900 + male 900 +
-- other 900 saved happily against a total_direct of 100, and those figures roll
-- up to the Overview's GEDSI panel.
ALTER TABLE merl.beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_gender_reconciles;
ALTER TABLE merl.beneficiaries ADD CONSTRAINT beneficiaries_gender_reconciles
    CHECK (
        total_direct IS NULL
        OR COALESCE(female,0) + COALESCE(male,0) + COALESCE(other_gender,0) <= total_direct
    );

-- Youth and persons with disability are subsets of the same total, counted on a
-- different axis, so each is bounded individually rather than summed with the
-- gender split.
ALTER TABLE merl.beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_subsets_within_total;
ALTER TABLE merl.beneficiaries ADD CONSTRAINT beneficiaries_subsets_within_total
    CHECK (
        total_direct IS NULL
        OR (COALESCE(youth,0) <= total_direct
            AND COALESCE(persons_with_disability,0) <= total_direct)
    );

-- An indicator baseline year of 1300 was accepted.
ALTER TABLE merl.project_indicators DROP CONSTRAINT IF EXISTS indicators_baseline_year_plausible;
ALTER TABLE merl.project_indicators ADD CONSTRAINT indicators_baseline_year_plausible
    CHECK (baseline_year IS NULL OR baseline_year BETWEEN 1980 AND 2100);

-- A risk could be marked resolved before it was identified.
ALTER TABLE merl.risks_issues DROP CONSTRAINT IF EXISTS risks_resolved_after_identified;
ALTER TABLE merl.risks_issues ADD CONSTRAINT risks_resolved_after_identified
    CHECK (date_resolved IS NULL OR date_identified IS NULL OR date_resolved >= date_identified);

-- A location row with every field NULL was accepted; the form has no client
-- validation either, so an empty submit wrote an empty record.
ALTER TABLE merl.project_locations DROP CONSTRAINT IF EXISTS locations_not_empty;
ALTER TABLE merl.project_locations ADD CONSTRAINT locations_not_empty
    CHECK (
        COALESCE(btrim(province),'')  <> ''
     OR COALESCE(btrim(island),'')    <> ''
     OR COALESCE(btrim(community),'') <> ''
    );

-- =============================================================================
-- 7. Cross-project links in the results framework
-- =============================================================================
-- An indicator on one project could be linked to an objective, outcome or output
-- belonging to a different project, quietly corrupting the rollups on both. The
-- dropdowns only offer the current project's records, so this is not reachable
-- by clicking — but the RPC never checked, and the link survives once made.
CREATE OR REPLACE FUNCTION merl.fn_check_indicator_parentage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
DECLARE v_owner UUID;
BEGIN
    IF NEW.objective_id IS NOT NULL THEN
        SELECT project_id INTO v_owner FROM merl.objectives WHERE id = NEW.objective_id;
        IF v_owner IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION 'That objective belongs to a different project';
        END IF;
    END IF;
    IF NEW.outcome_id IS NOT NULL THEN
        SELECT project_id INTO v_owner FROM merl.outcomes WHERE id = NEW.outcome_id;
        IF v_owner IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION 'That outcome belongs to a different project';
        END IF;
    END IF;
    IF NEW.output_id IS NOT NULL THEN
        SELECT project_id INTO v_owner FROM merl.outputs WHERE id = NEW.output_id;
        IF v_owner IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION 'That output belongs to a different project';
        END IF;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_indicator_parentage ON merl.project_indicators;
CREATE TRIGGER trg_indicator_parentage BEFORE INSERT OR UPDATE ON merl.project_indicators
FOR EACH ROW EXECUTE FUNCTION merl.fn_check_indicator_parentage();

-- =============================================================================
-- 8. The administrator account could be removed by its only holder
-- =============================================================================
CREATE OR REPLACE FUNCTION merl.assert_not_last_admin(p_target UUID, p_verb TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = merl, public AS $$
DECLARE v_actor merl.users; v_target merl.users; v_remaining INT;
BEGIN
    v_actor  := merl.current_db_user();
    SELECT * INTO v_target FROM merl.users WHERE id = p_target;
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

    IF v_target.id = v_actor.id THEN
        RAISE EXCEPTION 'You cannot % your own account. Ask another administrator to do it.', p_verb;
    END IF;

    IF v_target.role = 'system_admin' AND v_target.active THEN
        SELECT count(*) INTO v_remaining
        FROM merl.users WHERE role = 'system_admin' AND active AND id <> p_target;
        IF v_remaining = 0 THEN
            RAISE EXCEPTION 'This is the only active administrator. Appoint another before you % it.', p_verb;
        END IF;
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_active(p_id UUID, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;
    -- Only deactivation can strand the portal; reactivating is always safe.
    IF p_active = FALSE THEN
        PERFORM merl.assert_not_last_admin(p_id, 'deactivate');
    END IF;
    UPDATE merl.users SET active = p_active WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public, auth AS $$
DECLARE v_auth UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;
    PERFORM merl.assert_not_last_admin(p_id, 'delete');

    SELECT auth_user_id INTO v_auth FROM merl.users WHERE id = p_id;
    DELETE FROM merl.users WHERE id = p_id;
    IF v_auth IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_auth;
    END IF;
EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'This user has linked records and cannot be deleted. Deactivate the account instead.';
END; $$;

-- =============================================================================
-- 9. admin_create_user accepted an address that could never receive a login
-- =============================================================================
-- 'not-an-email' created an account, as did a whitespace-only full name.
CREATE OR REPLACE FUNCTION merl.assert_valid_user_input(p_email TEXT, p_full_name TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name is required';
    END IF;
    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RAISE EXCEPTION 'Email address is required';
    END IF;
    -- Deliberately permissive: one @, a dot-bearing domain, no whitespace. The
    -- point is to catch a typo before an account is created that can never sign
    -- in, not to adjudicate RFC 5322.
    IF btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' THEN
        RAISE EXCEPTION 'That does not look like a valid email address';
    END IF;
END; $$;

-- =============================================================================
-- 10. The results framework accepted blank statements
-- =============================================================================
-- All six create/update RPCs btrim() the statement but never check the result,
-- so an empty objective, outcome or output could be stored. The forms block it;
-- the database did not.
CREATE OR REPLACE FUNCTION merl.assert_statement(p_statement TEXT, p_what TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_statement IS NULL OR btrim(p_statement) = '' THEN
        RAISE EXCEPTION '% statement is required', p_what;
    END IF;
    RETURN btrim(p_statement);
END; $$;

-- =============================================================================
-- 11. RLS predicate depended on every user column being non-NULL
-- =============================================================================
-- The policies from 0031 test `merl.current_db_user() IS NOT NULL`. That is a
-- composite comparison: it is only true when EVERY field of the row is non-NULL.
-- It works today purely because fn_users_normalise backfills keycloak_id and
-- organisation — but a profile with no linked login account (auth_user_id NULL)
-- is treated as signed-out and sees zero rows everywhere, with no error to
-- explain why. Test the primary key instead, which is what was meant.
DO $$
DECLARE r RECORD; v_new TEXT;
BEGIN
    FOR r IN
        SELECT p.polname, c.relname, n.nspname,
               pg_get_expr(p.polqual, p.polrelid) AS qual
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pg_get_expr(p.polqual, p.polrelid) LIKE '%current_db_user() IS NOT NULL%'
    LOOP
        -- Swap the whole sub-expression, prefix included, so the result stays
        -- parenthesis-balanced whether it stands alone or sits inside an OR.
        v_new := replace(r.qual,
                         'merl.current_db_user() IS NOT NULL',
                         '(merl.current_db_user()).id IS NOT NULL');
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                       r.polname, r.nspname, r.relname, v_new);
    END LOOP;
END $$;

-- =============================================================================
-- 12. RPCs updated to honour the permission catalogue and validate statements
-- =============================================================================
-- Regenerated from the live definitions with two targeted substitutions, so no
-- behaviour drifts beyond the change being made:
--
--   · The ten RPCs covering the Data Entry Officer's five granted permissions
--     now pass their permission code to require_editor(), so the catalogue
--     governs access instead of the hard-coded three-role list.
--   · The six results-framework RPCs route the statement through
--     merl.assert_statement(), which rejects a blank one instead of storing it.
CREATE OR REPLACE FUNCTION public.upsert_indicator_progress(p_id uuid, p_project_id uuid, p_indicator_id uuid, p_reporting_period text, p_period_target numeric DEFAULT NULL::numeric, p_actual_this_period numeric DEFAULT NULL::numeric, p_cumulative_actual numeric DEFAULT NULL::numeric, p_previous_value numeric DEFAULT NULL::numeric, p_achievement_pct numeric DEFAULT NULL::numeric, p_variance numeric DEFAULT NULL::numeric, p_performance_status text DEFAULT NULL::text, p_narrative text DEFAULT NULL::text, p_variance_reason text DEFAULT NULL::text, p_corrective_action text DEFAULT NULL::text, p_date_reported date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor('indicator_progress.enter');
    IF p_id IS NULL THEN
        INSERT INTO merl.indicator_progress (project_id, indicator_id, reporting_period,
            period_target, actual_this_period, cumulative_actual, previous_value,
            achievement_pct, variance, performance_status, narrative, variance_reason,
            corrective_action, reported_by, date_reported, created_by, updated_by)
        VALUES (p_project_id, p_indicator_id, p_reporting_period, p_period_target,
            p_actual_this_period, p_cumulative_actual, p_previous_value, p_achievement_pct,
            p_variance, p_performance_status, p_narrative, p_variance_reason,
            p_corrective_action, v_user.id, p_date_reported, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.indicator_progress SET reporting_period=p_reporting_period,
            period_target=p_period_target, actual_this_period=p_actual_this_period,
            cumulative_actual=p_cumulative_actual, previous_value=p_previous_value,
            achievement_pct=p_achievement_pct, variance=p_variance,
            performance_status=p_performance_status, narrative=p_narrative,
            variance_reason=p_variance_reason, corrective_action=p_corrective_action,
            date_reported=p_date_reported, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Indicator progress not found'; END IF;
    END IF;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_indicator_progress(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor('indicator_progress.enter');
    DELETE FROM merl.indicator_progress WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Indicator progress not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.upsert_beneficiaries(p_id uuid, p_project_id uuid, p_reporting_period text DEFAULT NULL::text, p_activity_id uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_total_direct integer DEFAULT NULL::integer, p_female integer DEFAULT NULL::integer, p_male integer DEFAULT NULL::integer, p_other_gender integer DEFAULT NULL::integer, p_youth integer DEFAULT NULL::integer, p_persons_with_disability integer DEFAULT NULL::integer, p_other_vulnerable text DEFAULT NULL::text, p_indirect integer DEFAULT NULL::integer, p_data_source text DEFAULT NULL::text, p_double_counting_check boolean DEFAULT NULL::boolean, p_comments text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor('beneficiaries.enter');
    IF p_id IS NULL THEN
        INSERT INTO merl.beneficiaries (project_id, reporting_period, activity_id, location,
            total_direct, female, male, other_gender, youth, persons_with_disability,
            other_vulnerable, indirect, data_source, double_counting_check, comments, created_by, updated_by)
        VALUES (p_project_id, p_reporting_period, p_activity_id, p_location, p_total_direct,
            p_female, p_male, p_other_gender, p_youth, p_persons_with_disability,
            p_other_vulnerable, p_indirect, p_data_source, p_double_counting_check, p_comments, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.beneficiaries SET reporting_period=p_reporting_period, activity_id=p_activity_id,
            location=p_location, total_direct=p_total_direct, female=p_female, male=p_male,
            other_gender=p_other_gender, youth=p_youth, persons_with_disability=p_persons_with_disability,
            other_vulnerable=p_other_vulnerable, indirect=p_indirect, data_source=p_data_source,
            double_counting_check=p_double_counting_check, comments=p_comments, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Beneficiary record not found'; END IF;
    END IF;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_beneficiaries(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor('beneficiaries.enter');
    DELETE FROM merl.beneficiaries WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Beneficiary record not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.upsert_evidence(p_id uuid, p_project_id uuid, p_title text, p_document_type text DEFAULT NULL::text, p_reporting_period text DEFAULT NULL::text, p_indicator_id uuid DEFAULT NULL::uuid, p_activity_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_document_date date DEFAULT NULL::date, p_file_url text DEFAULT NULL::text, p_verification_status text DEFAULT 'pending'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_user merl.users; v_id UUID; v_code TEXT;
BEGIN
    v_user := merl.require_editor('evidence.upload');
    IF p_id IS NULL THEN
        v_code := merl.next_code_w(p_project_id, 'evidence', 'EVD', 3);
        INSERT INTO merl.evidence (project_id, code, reporting_period, indicator_id, activity_id,
            document_type, title, description, document_date, file_url, verification_status,
            uploaded_by, created_by, updated_by)
        VALUES (p_project_id, v_code, p_reporting_period, p_indicator_id, p_activity_id,
            p_document_type, btrim(p_title), p_description, p_document_date, p_file_url,
            COALESCE(p_verification_status,'pending'), v_user.id, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.evidence SET reporting_period=p_reporting_period, indicator_id=p_indicator_id,
            activity_id=p_activity_id, document_type=p_document_type, title=btrim(p_title),
            description=p_description, document_date=p_document_date, file_url=p_file_url,
            verification_status=COALESCE(p_verification_status, verification_status), updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Evidence not found'; END IF;
    END IF;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_evidence(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor('evidence.upload');
    DELETE FROM merl.evidence WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evidence not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.upsert_project_activity_full(p_id uuid, p_output_id uuid, p_name text, p_description text DEFAULT NULL::text, p_responsible_officer_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'not_started'::text, p_outcome_id uuid DEFAULT NULL::uuid, p_responsible_org text DEFAULT NULL::text, p_province text DEFAULT NULL::text, p_island text DEFAULT NULL::text, p_area_council text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_planned_start_date date DEFAULT NULL::date, p_planned_end_date date DEFAULT NULL::date, p_actual_start_date date DEFAULT NULL::date, p_actual_end_date date DEFAULT NULL::date, p_planned_budget numeric DEFAULT NULL::numeric, p_actual_expenditure numeric DEFAULT NULL::numeric, p_physical_progress_pct numeric DEFAULT NULL::numeric, p_key_achievement text DEFAULT NULL::text, p_issue_delay text DEFAULT NULL::text, p_next_action text DEFAULT NULL::text, p_next_action_due date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor('activities.edit');
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Activity title is required'; END IF;
    IF p_id IS NULL THEN
        SELECT project_id INTO v_proj FROM merl.outputs WHERE id = p_output_id;
        IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent output not found'; END IF;
        INSERT INTO merl.project_activities (
            project_id, output_id, code, name, description, responsible_officer_id, status, outcome_id,
            responsible_org, province, island, area_council, community, planned_start_date, planned_end_date,
            actual_start_date, actual_end_date, planned_budget, actual_expenditure, physical_progress_pct,
            key_achievement, issue_delay, next_action, next_action_due
        ) VALUES (
            v_proj, p_output_id, merl.next_code_w(v_proj,'activity','ACT',3), btrim(p_name), p_description,
            p_responsible_officer_id, COALESCE(p_status,'not_started'), p_outcome_id, p_responsible_org,
            p_province, p_island, p_area_council, p_community, p_planned_start_date, p_planned_end_date,
            p_actual_start_date, p_actual_end_date, p_planned_budget, p_actual_expenditure,
            p_physical_progress_pct, p_key_achievement, p_issue_delay, p_next_action, p_next_action_due
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE merl.project_activities SET
            output_id = p_output_id, name = btrim(p_name), description = p_description,
            responsible_officer_id = p_responsible_officer_id, status = COALESCE(p_status,status),
            outcome_id = p_outcome_id, responsible_org = p_responsible_org, province = p_province,
            island = p_island, area_council = p_area_council, community = p_community,
            planned_start_date = p_planned_start_date, planned_end_date = p_planned_end_date,
            actual_start_date = p_actual_start_date, actual_end_date = p_actual_end_date,
            planned_budget = p_planned_budget, actual_expenditure = p_actual_expenditure,
            physical_progress_pct = p_physical_progress_pct, key_achievement = p_key_achievement,
            issue_delay = p_issue_delay, next_action = p_next_action, next_action_due = p_next_action_due,
            updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Activity not found'; END IF;
    END IF;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_project_activity(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor('activities.edit');
    DELETE FROM merl.project_activities WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.upsert_risk_issue(p_id uuid, p_project_id uuid, p_type text, p_description text, p_category text DEFAULT NULL::text, p_date_identified date DEFAULT NULL::date, p_likelihood integer DEFAULT NULL::integer, p_impact integer DEFAULT NULL::integer, p_mitigation text DEFAULT NULL::text, p_responsible_person text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_status text DEFAULT 'open'::text, p_latest_update text DEFAULT NULL::text, p_date_resolved date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_user merl.users; v_id UUID; v_code TEXT; v_rating TEXT;
BEGIN
    v_user := merl.require_editor('risks.edit');
    v_rating := merl.risk_rating(p_likelihood, p_impact);
    IF p_id IS NULL THEN
        v_code := merl.next_code_w(p_project_id, CASE WHEN p_type='issue' THEN 'issue' ELSE 'risk' END,
                                   CASE WHEN p_type='issue' THEN 'ISS' ELSE 'RSK' END, 3);
        INSERT INTO merl.risks_issues (project_id, code, type, description, category, date_identified,
            likelihood, impact, risk_rating, mitigation, responsible_person, due_date, status,
            latest_update, date_resolved, created_by, updated_by)
        VALUES (p_project_id, v_code, p_type, btrim(p_description), p_category, p_date_identified,
            p_likelihood, p_impact, v_rating, p_mitigation, p_responsible_person, p_due_date, p_status,
            p_latest_update, p_date_resolved, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.risks_issues SET type=p_type, description=btrim(p_description), category=p_category,
            date_identified=p_date_identified, likelihood=p_likelihood, impact=p_impact,
            risk_rating=v_rating, mitigation=p_mitigation, responsible_person=p_responsible_person,
            due_date=p_due_date, status=p_status, latest_update=p_latest_update,
            date_resolved=p_date_resolved, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Risk/issue not found'; END IF;
    END IF;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_risk_issue(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor('risks.edit');
    DELETE FROM merl.risks_issues WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Risk/issue not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_objective(p_project_id uuid, p_statement text, p_climate_theme text DEFAULT NULL::text, p_expected_outcome text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
    PERFORM merl.require_editor();
    INSERT INTO merl.objectives (project_id, code, statement, climate_theme, expected_outcome, notes)
    VALUES (p_project_id, merl.next_code(p_project_id, 'objective', 'OBJ'),
            merl.assert_statement(p_statement, 'Objective'), p_climate_theme, p_expected_outcome, p_notes)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_outcome(p_objective_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.objectives WHERE id = p_objective_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent objective not found'; END IF;
    INSERT INTO merl.outcomes (project_id, objective_id, code, statement, responsible_officer_id)
    VALUES (v_proj, p_objective_id, merl.next_code(v_proj, 'outcome', 'OUT'),
            merl.assert_statement(p_statement, 'Outcome'), p_responsible_officer_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_output(p_outcome_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.outcomes WHERE id = p_outcome_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent outcome not found'; END IF;
    INSERT INTO merl.outputs (project_id, outcome_id, code, statement, responsible_officer_id)
    VALUES (v_proj, p_outcome_id, merl.next_code(v_proj, 'output', 'OP'),
            merl.assert_statement(p_statement, 'Output'), p_responsible_officer_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.update_objective(p_id uuid, p_statement text, p_climate_theme text DEFAULT NULL::text, p_expected_outcome text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_status text DEFAULT 'draft'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.objectives SET
        statement = merl.assert_statement(p_statement, 'Objective'), climate_theme = p_climate_theme,
        expected_outcome = p_expected_outcome, notes = p_notes,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.update_outcome(p_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'draft'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outcomes SET
        statement = merl.assert_statement(p_statement, 'Outcome'), responsible_officer_id = p_responsible_officer_id,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Outcome not found'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.update_output(p_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'draft'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outputs SET
        statement = merl.assert_statement(p_statement, 'Output'), responsible_officer_id = p_responsible_officer_id,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Output not found'; END IF;
END; $function$
;


-- admin_create_user: reject a malformed address or an empty name before an
-- account is created that can never sign in.
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT, p_full_name TEXT, p_role TEXT, p_organisation TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public, auth, extensions AS $$
DECLARE v_pw TEXT; v_uid UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;
    PERFORM merl.assert_valid_user_input(p_email, p_full_name);

    IF EXISTS (SELECT 1 FROM merl.users WHERE email = lower(btrim(p_email))) THEN
        RAISE EXCEPTION 'A user with the email address % already exists.', lower(btrim(p_email));
    END IF;

    v_pw  := encode(extensions.gen_random_bytes(9), 'base64');
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        lower(btrim(p_email)), extensions.crypt(v_pw, extensions.gen_salt('bf')),
        NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        NOW(), NOW(), '', '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_uid, v_uid::TEXT,
        jsonb_build_object('sub', v_uid::TEXT, 'email', lower(btrim(p_email)), 'email_verified', true),
        'email', NOW(), NOW(), NOW()
    );

    INSERT INTO merl.users (email, full_name, role, organisation, auth_user_id)
    VALUES (lower(btrim(p_email)), btrim(p_full_name), p_role::merl.user_role, p_organisation, v_uid);

    RETURN v_pw;
END; $$;

COMMIT;
