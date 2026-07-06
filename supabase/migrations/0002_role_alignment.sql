-- =============================================================================
-- MERL Dashboard – Migration 0002: Role enum alignment (contract L&D C.08)
-- =============================================================================
-- Aligns merl.user_role with the five contract roles implemented by the
-- frontend (frontend/src/types.ts) and documented in docs/user-manual.md §2
-- and docs/architecture.md §5.1:
--
--   DB value              Frontend constant    Contract role
--   ------------------    -----------------    ------------------------
--   administrator         ROLE_ADMIN           System Administrator
--   docc_senior_officer   ROLE_DOCC_SENIOR     DoCC Senior Officer
--   docc_me_officer       ROLE_DOCC_MEO        DoCC M&E Officer
--   project_manager       ROLE_PROJ_MANAGER    Project Manager
--   field_staff           ROLE_FIELD_STAFF     Field Staff
--
-- Existing rows are migrated as follows:
--   administrator      → administrator
--   project_manager    → project_manager
--   merl_officer       → docc_me_officer      (same function, contract name)
--   finance_officer    → docc_senior_officer  (senior office-based role)
--   partner_viewer     → field_staff          (external partner: datasets/analysis only)
--   community_reporter → field_staff          (field-level data submission)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop RLS policies that embed old role literals
-- ---------------------------------------------------------------------------
-- Policy expressions store enum constants, so every policy comparing against
-- merl.user_role values must be dropped before the type can be replaced.
-- (merl.users policies only use merl.is_admin(), whose plpgsql body is
-- re-parsed at run time, so they can stay.)

DROP POLICY indicators_insert ON merl.indicators;
DROP POLICY indicators_update ON merl.indicators;

DROP POLICY iv_insert ON merl.indicator_values;
DROP POLICY iv_update ON merl.indicator_values;
DROP POLICY iv_delete ON merl.indicator_values;

DROP POLICY activities_insert ON merl.activities;
DROP POLICY activities_update ON merl.activities;

DROP POLICY am_write ON merl.activity_milestones;

DROP POLICY ft_insert ON merl.financial_transactions;
DROP POLICY ft_update ON merl.financial_transactions;

DROP POLICY lde_write ON merl.ld_events;

DROP POLICY ce_write ON merl.community_engagements;

DROP POLICY le_write ON merl.learning_entries;

DROP POLICY du_update ON merl.document_uploads;

-- ---------------------------------------------------------------------------
-- 2. Replace the enum and migrate merl.users.role
-- ---------------------------------------------------------------------------

ALTER TYPE merl.user_role RENAME TO user_role_legacy;

CREATE TYPE merl.user_role AS ENUM (
    'administrator',
    'docc_senior_officer',
    'docc_me_officer',
    'project_manager',
    'field_staff'
);

ALTER TABLE merl.users
    ALTER COLUMN role TYPE merl.user_role
    USING (
        CASE role::TEXT
            WHEN 'administrator'      THEN 'administrator'
            WHEN 'project_manager'    THEN 'project_manager'
            WHEN 'merl_officer'       THEN 'docc_me_officer'
            WHEN 'finance_officer'    THEN 'docc_senior_officer'
            WHEN 'partner_viewer'     THEN 'field_staff'
            WHEN 'community_reporter' THEN 'field_staff'
        END::merl.user_role
    );

DROP TYPE merl.user_role_legacy;

-- ---------------------------------------------------------------------------
-- 3. Recreate RLS policies against the five contract roles
-- ---------------------------------------------------------------------------
-- Access matrix (docs/user-manual.md §2, docs/architecture.md §5.1):
--   administrator        full access, all modules
--   docc_senior_officer  read everything + approve/verify submissions
--   docc_me_officer      full read/write on all MERL data
--   project_manager      read/write on project data (activities, values, events)
--   field_staff          datasets & analysis: read + submit field data

-- 3.1 indicators — register maintained by the M&E function
CREATE POLICY indicators_insert ON merl.indicators
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'docc_me_officer')
    );

CREATE POLICY indicators_update ON merl.indicators
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'docc_me_officer')
    );

-- 3.2 indicator_values — data submission open to field staff and managers;
--     senior officers may update (approve/verify); submitters may fix their own rows
CREATE POLICY iv_insert ON merl.indicator_values
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager', 'field_staff')
    );

CREATE POLICY iv_update ON merl.indicator_values
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_senior_officer', 'docc_me_officer')
        OR reported_by = (merl.current_db_user()).id
    );

CREATE POLICY iv_delete ON merl.indicator_values
    FOR DELETE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'docc_me_officer')
    );

-- 3.3 activities — work plan managed by M&E officers and project managers
CREATE POLICY activities_insert ON merl.activities
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    );

CREATE POLICY activities_update ON merl.activities
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    );

-- 3.4 activity_milestones
CREATE POLICY am_write ON merl.activity_milestones
    FOR ALL
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    );

-- 3.5 financial_transactions — finance data entered by the M&E function;
--     senior officers read via ft_select (all authenticated)
CREATE POLICY ft_insert ON merl.financial_transactions
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'docc_me_officer')
    );

CREATE POLICY ft_update ON merl.financial_transactions
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'docc_me_officer')
    );

-- 3.6 ld_events — official event registry
CREATE POLICY lde_write ON merl.ld_events
    FOR ALL
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    );

-- 3.7 community_engagements — field staff record engagements directly
CREATE POLICY ce_write ON merl.community_engagements
    FOR ALL
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager', 'field_staff')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager', 'field_staff')
    );

-- 3.8 learning_entries
CREATE POLICY le_write ON merl.learning_entries
    FOR ALL
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_me_officer', 'project_manager')
    );

-- 3.9 document_uploads — reviewers (M&E Officers and above, user-manual §6)
--     may update during review; uploaders keep control of their own files
CREATE POLICY du_update ON merl.document_uploads
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_senior_officer', 'docc_me_officer')
        OR uploaded_by = (merl.current_db_user()).id
    );

COMMIT;
