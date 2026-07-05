-- =============================================================================
-- MERL Dashboard – PostgreSQL 16 + PostGIS Schema Initialisation
-- Project : Vanuatu Loss and Damage Fund Development Project
-- Schema  : merl
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS merl;

-- ---------------------------------------------------------------------------
-- 2. Enumerations
-- ---------------------------------------------------------------------------

CREATE TYPE merl.domain_type AS ENUM (
    'governance',
    'financial',
    'community',
    'events',
    'learning'
);

CREATE TYPE merl.disaggregation_type AS ENUM (
    'gender',
    'age',
    'disability',
    'location',
    'none'
);

CREATE TYPE merl.activity_status AS ENUM (
    'planned',
    'in_progress',
    'completed',
    'delayed'
);

CREATE TYPE merl.transaction_type AS ENUM (
    'disbursement',
    'expenditure',
    'refund'
);

CREATE TYPE merl.event_type AS ENUM (
    'cyclone',
    'flood',
    'drought',
    'sea_level_rise',
    'acidification',
    'other'
);

CREATE TYPE merl.onset_type AS ENUM (
    'extreme',
    'slow_onset'
);

CREATE TYPE merl.engagement_type AS ENUM (
    'consultation',
    'workshop',
    'training',
    'reporting'
);

CREATE TYPE merl.lesson_type AS ENUM (
    'success',
    'challenge',
    'adaptation',
    'innovation'
);

CREATE TYPE merl.user_role AS ENUM (
    'administrator',
    'project_manager',
    'merl_officer',
    'finance_officer',
    'partner_viewer',
    'community_reporter'
);

CREATE TYPE merl.milestone_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'overdue'
);

-- ---------------------------------------------------------------------------
-- 3. Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merl.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------------

-- 4.1  users ----------------------------------------------------------------
CREATE TABLE merl.users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id     VARCHAR(255) UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    role            merl.user_role NOT NULL,
    organisation    VARCHAR(255),
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  merl.users IS 'Application users, linked to Keycloak identity provider.';
COMMENT ON COLUMN merl.users.keycloak_id IS 'Subject claim from the Keycloak JWT; used for SSO lookup.';

-- 4.2  indicators -----------------------------------------------------------
CREATE TABLE merl.indicators (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(30) NOT NULL UNIQUE,
    name                VARCHAR(500) NOT NULL,
    description         TEXT,
    domain              merl.domain_type        NOT NULL,
    unit                VARCHAR(100),
    baseline_value      NUMERIC(18, 4),
    target_value        NUMERIC(18, 4),
    target_year         INTEGER     CHECK (target_year BETWEEN 2020 AND 2050),
    data_source         VARCHAR(500),
    disaggregation_type merl.disaggregation_type NOT NULL DEFAULT 'none',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.indicators IS 'Results-framework indicator register.';

-- 4.3  indicator_values -----------------------------------------------------
CREATE TABLE merl.indicator_values (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_id        UUID        NOT NULL REFERENCES merl.indicators (id) ON DELETE CASCADE,
    value               NUMERIC(18, 4) NOT NULL,
    reporting_period    DATE        NOT NULL,
    reported_by         UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    location_island     VARCHAR(100),
    location_province   VARCHAR(100),
    disaggregation_key  VARCHAR(100),
    disaggregation_value VARCHAR(200),
    notes               TEXT,
    evidence_url        VARCHAR(2000),
    verified            BOOLEAN     NOT NULL DEFAULT FALSE,
    verified_by         UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.indicator_values IS 'Time-series data points for each indicator.';

-- 4.4  activities -----------------------------------------------------------
CREATE TABLE merl.activities (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) NOT NULL UNIQUE,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    domain          merl.domain_type NOT NULL,
    phase           INTEGER     NOT NULL CHECK (phase BETWEEN 1 AND 5),
    start_date      DATE,
    end_date        DATE,
    status          merl.activity_status NOT NULL DEFAULT 'planned',
    lead_officer    VARCHAR(255),
    budget_vuv      NUMERIC(18, 2),
    budget_nzd      NUMERIC(18, 2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT activities_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE merl.activities IS 'Project work-plan activities organised by phase.';

-- 4.5  activity_milestones --------------------------------------------------
CREATE TABLE merl.activity_milestones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id     UUID        NOT NULL REFERENCES merl.activities (id) ON DELETE CASCADE,
    milestone_name  VARCHAR(500) NOT NULL,
    due_date        DATE        NOT NULL,
    completed_date  DATE,
    status          merl.milestone_status NOT NULL DEFAULT 'pending',
    notes           TEXT,
    CONSTRAINT milestone_completion_check CHECK (
        completed_date IS NULL OR completed_date >= due_date - INTERVAL '180 days'
    )
);

COMMENT ON TABLE merl.activity_milestones IS 'Key milestones associated with each activity.';

-- 4.6  financial_transactions -----------------------------------------------
CREATE TABLE merl.financial_transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date    DATE        NOT NULL,
    description         TEXT        NOT NULL,
    amount_vuv          NUMERIC(18, 2) NOT NULL,
    amount_nzd          NUMERIC(18, 2),
    transaction_type    merl.transaction_type NOT NULL,
    activity_id         UUID        REFERENCES merl.activities (id) ON DELETE SET NULL,
    donor_reference     VARCHAR(255),
    payment_method      VARCHAR(100),
    approved_by         VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.financial_transactions IS 'Fund disbursements, expenditures, and refunds.';

-- 4.7  ld_events ------------------------------------------------------------
CREATE TABLE merl.ld_events (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name                      VARCHAR(500) NOT NULL,
    event_type                      merl.event_type NOT NULL,
    onset_type                      merl.onset_type NOT NULL,
    start_date                      DATE,
    end_date                        DATE,
    islands_affected                TEXT[],
    provinces_affected              TEXT[],
    economic_loss_vuv               NUMERIC(18, 2),
    non_economic_loss_description   TEXT,
    response_actions                TEXT,
    data_source                     VARCHAR(500),
    geom                            GEOMETRY(Point, 4326),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ld_events_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE merl.ld_events IS 'Documented loss and damage events affecting Vanuatu communities.';

-- 4.8  community_engagements ------------------------------------------------
CREATE TABLE merl.community_engagements (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_date         DATE        NOT NULL,
    community_name          VARCHAR(255) NOT NULL,
    island                  VARCHAR(100) NOT NULL,
    province                VARCHAR(100) NOT NULL,
    engagement_type         merl.engagement_type NOT NULL,
    total_participants      INTEGER     NOT NULL DEFAULT 0 CHECK (total_participants >= 0),
    male_participants       INTEGER     NOT NULL DEFAULT 0 CHECK (male_participants >= 0),
    female_participants     INTEGER     NOT NULL DEFAULT 0 CHECK (female_participants >= 0),
    youth_participants      INTEGER     NOT NULL DEFAULT 0 CHECK (youth_participants >= 0),
    disability_participants INTEGER     NOT NULL DEFAULT 0 CHECK (disability_participants >= 0),
    outcomes                TEXT,
    follow_up_required      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_gender_total_check CHECK (
        male_participants + female_participants <= total_participants
    )
);

COMMENT ON TABLE merl.community_engagements IS 'GEDSI-disaggregated community engagement records.';

-- 4.9  learning_entries -----------------------------------------------------
CREATE TABLE merl.learning_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date      DATE        NOT NULL,
    title           VARCHAR(500) NOT NULL,
    domain          merl.domain_type NOT NULL,
    lesson_type     merl.lesson_type NOT NULL,
    description     TEXT        NOT NULL,
    implications    TEXT,
    action_taken    TEXT,
    recorded_by     UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    tags            TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.learning_entries IS 'Lessons learned, adaptations, and knowledge management entries.';

-- 4.10 document_uploads -----------------------------------------------------
CREATE TABLE merl.document_uploads (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by             UUID        NOT NULL REFERENCES merl.users (id) ON DELETE RESTRICT,
    filename                VARCHAR(500) NOT NULL,
    file_path               VARCHAR(2000) NOT NULL,
    file_type               VARCHAR(100),
    related_entity_type     VARCHAR(100),
    related_entity_id       UUID,
    description             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.document_uploads IS 'Evidence documents and supporting files linked to MERL entities.';

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

-- indicator_values
CREATE INDEX idx_iv_indicator_id     ON merl.indicator_values (indicator_id);
CREATE INDEX idx_iv_reporting_period ON merl.indicator_values (reporting_period DESC);
CREATE INDEX idx_iv_reported_by      ON merl.indicator_values (reported_by);
CREATE INDEX idx_iv_province         ON merl.indicator_values (location_province);
CREATE INDEX idx_iv_indicator_period ON merl.indicator_values (indicator_id, reporting_period DESC);

-- activities
CREATE INDEX idx_act_domain  ON merl.activities (domain);
CREATE INDEX idx_act_status  ON merl.activities (status);
CREATE INDEX idx_act_phase   ON merl.activities (phase);
CREATE INDEX idx_act_dates   ON merl.activities (start_date, end_date);

-- activity_milestones
CREATE INDEX idx_am_activity_id ON merl.activity_milestones (activity_id);
CREATE INDEX idx_am_due_date    ON merl.activity_milestones (due_date);
CREATE INDEX idx_am_status      ON merl.activity_milestones (status);

-- financial_transactions
CREATE INDEX idx_ft_transaction_date ON merl.financial_transactions (transaction_date DESC);
CREATE INDEX idx_ft_activity_id      ON merl.financial_transactions (activity_id);
CREATE INDEX idx_ft_type             ON merl.financial_transactions (transaction_type);

-- ld_events
CREATE INDEX idx_lde_event_type  ON merl.ld_events (event_type);
CREATE INDEX idx_lde_start_date  ON merl.ld_events (start_date DESC);
CREATE INDEX idx_lde_onset_type  ON merl.ld_events (onset_type);
CREATE INDEX idx_lde_geom        ON merl.ld_events USING GIST (geom);

-- community_engagements
CREATE INDEX idx_ce_engagement_date ON merl.community_engagements (engagement_date DESC);
CREATE INDEX idx_ce_province        ON merl.community_engagements (province);
CREATE INDEX idx_ce_island          ON merl.community_engagements (island);
CREATE INDEX idx_ce_type            ON merl.community_engagements (engagement_type);

-- learning_entries
CREATE INDEX idx_le_entry_date  ON merl.learning_entries (entry_date DESC);
CREATE INDEX idx_le_domain      ON merl.learning_entries (domain);
CREATE INDEX idx_le_lesson_type ON merl.learning_entries (lesson_type);
CREATE INDEX idx_le_recorded_by ON merl.learning_entries (recorded_by);
CREATE INDEX idx_le_tags        ON merl.learning_entries USING GIN (tags);

-- indicators
CREATE INDEX idx_ind_domain ON merl.indicators (domain);

-- document_uploads
CREATE INDEX idx_du_uploaded_by         ON merl.document_uploads (uploaded_by);
CREATE INDEX idx_du_related_entity      ON merl.document_uploads (related_entity_type, related_entity_id);

-- users
CREATE INDEX idx_users_role   ON merl.users (role);
CREATE INDEX idx_users_active ON merl.users (active);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_indicators_updated_at
    BEFORE UPDATE ON merl.indicators
    FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at();

CREATE TRIGGER trg_activities_updated_at
    BEFORE UPDATE ON merl.activities
    FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at();

-- ===========================================================================
-- 7. AUDIT LOGGING — immutable audit trail
-- ===========================================================================

-- 7.1  audit_logs table -------------------------------------------------------
-- Rows are INSERT-only. DELETE and TRUNCATE are revoked from all app roles.
-- The trigger function runs as a SECURITY DEFINER to bypass RLS on this table.

CREATE TABLE merl.audit_logs (
    id              BIGSERIAL   PRIMARY KEY,
    schema_name     VARCHAR(63) NOT NULL DEFAULT 'merl',
    table_name      VARCHAR(63) NOT NULL,
    record_id       UUID,
    action          VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    user_id         UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    app_user_name   VARCHAR(255),          -- display name from JWT claim
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    old_values      JSONB,
    new_values      JSONB
);

COMMENT ON TABLE merl.audit_logs IS
    'Immutable audit trail. INSERT-only. DELETE/TRUNCATE revoked from all non-superuser roles.';

CREATE INDEX idx_audit_table_name  ON merl.audit_logs (table_name);
CREATE INDEX idx_audit_record_id   ON merl.audit_logs (record_id);
CREATE INDEX idx_audit_user_id     ON merl.audit_logs (user_id);
CREATE INDEX idx_audit_changed_at  ON merl.audit_logs (changed_at DESC);

-- Revoke destructive permissions from all non-superuser roles
REVOKE DELETE  ON merl.audit_logs FROM PUBLIC;
REVOKE TRUNCATE ON merl.audit_logs FROM PUBLIC;

-- 7.2  Generic audit trigger function ----------------------------------------

CREATE OR REPLACE FUNCTION merl.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                     -- bypasses RLS so we can always write
SET search_path = merl, public
AS $$
DECLARE
    v_record_id UUID;
    v_old       JSONB;
    v_new       JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id;
        v_old       := to_jsonb(OLD);
        v_new       := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id;
        v_old       := NULL;
        v_new       := to_jsonb(NEW);
    ELSE   -- UPDATE
        v_record_id := NEW.id;
        v_old       := to_jsonb(OLD);
        v_new       := to_jsonb(NEW);
    END IF;

    INSERT INTO merl.audit_logs (
        table_name, record_id, action,
        app_user_name, changed_at,
        old_values, new_values
    ) VALUES (
        TG_TABLE_NAME,
        v_record_id,
        TG_OP,
        current_setting('app.current_user_name', TRUE),   -- set by backend on each connection
        NOW(),
        v_old,
        v_new
    );

    RETURN NULL;   -- AFTER trigger; return value is ignored
END;
$$;

-- 7.3  Attach audit trigger to all core tables --------------------------------

CREATE TRIGGER trg_audit_indicators
    AFTER INSERT OR UPDATE OR DELETE ON merl.indicators
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_indicator_values
    AFTER INSERT OR UPDATE OR DELETE ON merl.indicator_values
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_activities
    AFTER INSERT OR UPDATE OR DELETE ON merl.activities
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_financial_transactions
    AFTER INSERT OR UPDATE OR DELETE ON merl.financial_transactions
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_ld_events
    AFTER INSERT OR UPDATE OR DELETE ON merl.ld_events
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_community_engagements
    AFTER INSERT OR UPDATE OR DELETE ON merl.community_engagements
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_document_uploads
    AFTER INSERT OR UPDATE OR DELETE ON merl.document_uploads
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON merl.users
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();


-- ===========================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ===========================================================================
-- Strategy:
--   • merl.users.keycloak_id is matched against current_setting('app.current_user_id').
--   • The backend sets this via: SET LOCAL app.current_user_id = '<keycloak_sub>';
--   • Administrators bypass RLS via a helper function.
--   • All other roles see only data for their assigned project (where applicable).
--   • Read-only roles (senior_officer, partner_viewer) cannot INSERT/UPDATE/DELETE.
-- ===========================================================================

-- 8.1  Helper: resolve the current DB user row --------------------------------

CREATE OR REPLACE FUNCTION merl.current_db_user()
RETURNS merl.users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_user merl.users;
    v_kid  TEXT;
BEGIN
    v_kid := current_setting('app.current_user_id', TRUE);
    IF v_kid IS NULL OR v_kid = '' THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_user FROM merl.users WHERE keycloak_id = v_kid AND active = TRUE;
    RETURN v_user;
END;
$$;

-- 8.2  Helper: is the current user an administrator? --------------------------

CREATE OR REPLACE FUNCTION merl.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    RETURN v_user IS NOT NULL AND v_user.role = 'administrator';
END;
$$;

-- 8.3  Enable RLS on all core tables ------------------------------------------

ALTER TABLE merl.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.indicators             ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.indicator_values       ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.activities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.activity_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.ld_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.community_engagements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.learning_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.document_uploads       ENABLE ROW LEVEL SECURITY;

-- NOTE: merl.audit_logs deliberately has NO RLS — it is INSERT-only via
-- SECURITY DEFINER trigger; all roles can SELECT their own entries.

-- 8.4  users table policies ---------------------------------------------------

-- Any authenticated user can see their own row; admins see all.
CREATE POLICY users_select ON merl.users
    FOR SELECT
    USING (
        merl.is_admin()
        OR keycloak_id = current_setting('app.current_user_id', TRUE)
    );

-- Only admins can create users.
CREATE POLICY users_insert ON merl.users
    FOR INSERT
    WITH CHECK ( merl.is_admin() );

-- Only admins can update users.
CREATE POLICY users_update ON merl.users
    FOR UPDATE
    USING ( merl.is_admin() );

-- Only admins can deactivate (soft-delete) users.
CREATE POLICY users_delete ON merl.users
    FOR DELETE
    USING ( merl.is_admin() );

-- 8.5  indicators table policies ----------------------------------------------
-- All authenticated users may read indicators.
-- Only merl_officer and administrator may write.

CREATE POLICY indicators_select ON merl.indicators
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY indicators_insert ON merl.indicators
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer')
    );

CREATE POLICY indicators_update ON merl.indicators
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer')
    );

CREATE POLICY indicators_delete ON merl.indicators
    FOR DELETE
    USING ( merl.is_admin() );

-- 8.6  indicator_values policies ----------------------------------------------
-- All authenticated users may read values.
-- project_manager and above may insert; only merl_officer/admin may update/delete.

CREATE POLICY iv_select ON merl.indicator_values
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY iv_insert ON merl.indicator_values
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'merl_officer', 'project_manager', 'finance_officer')
    );

CREATE POLICY iv_update ON merl.indicator_values
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer')
        OR reported_by = (merl.current_db_user()).id
    );

CREATE POLICY iv_delete ON merl.indicator_values
    FOR DELETE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer')
    );

-- 8.7  activities policies ----------------------------------------------------

CREATE POLICY activities_select ON merl.activities
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY activities_insert ON merl.activities
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    );

CREATE POLICY activities_update ON merl.activities
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    );

CREATE POLICY activities_delete ON merl.activities
    FOR DELETE
    USING ( merl.is_admin() );

-- 8.8  financial_transactions policies ----------------------------------------

CREATE POLICY ft_select ON merl.financial_transactions
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY ft_insert ON merl.financial_transactions
    FOR INSERT
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'finance_officer')
    );

CREATE POLICY ft_update ON merl.financial_transactions
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'finance_officer')
    );

CREATE POLICY ft_delete ON merl.financial_transactions
    FOR DELETE
    USING ( merl.is_admin() );

-- 8.9  ld_events policies -----------------------------------------------------

CREATE POLICY lde_select ON merl.ld_events
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY lde_write ON merl.ld_events
    FOR ALL
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    );

-- 8.10 community_engagements policies -----------------------------------------

CREATE POLICY ce_select ON merl.community_engagements
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY ce_write ON merl.community_engagements
    FOR ALL
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'merl_officer', 'project_manager', 'community_reporter')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN
            ('administrator', 'merl_officer', 'project_manager', 'community_reporter')
    );

-- 8.11 learning_entries policies ----------------------------------------------

CREATE POLICY le_select ON merl.learning_entries
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY le_write ON merl.learning_entries
    FOR ALL
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    );

-- 8.12 document_uploads policies ----------------------------------------------

CREATE POLICY du_select ON merl.document_uploads
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY du_insert ON merl.document_uploads
    FOR INSERT
    WITH CHECK ( merl.current_db_user() IS NOT NULL );

CREATE POLICY du_update ON merl.document_uploads
    FOR UPDATE
    USING (
        merl.is_admin()
        OR uploaded_by = (merl.current_db_user()).id
    );

CREATE POLICY du_delete ON merl.document_uploads
    FOR DELETE
    USING (
        merl.is_admin()
        OR uploaded_by = (merl.current_db_user()).id
    );

-- 8.13 activity_milestones policies -------------------------------------------

ALTER TABLE merl.activity_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY am_select ON merl.activity_milestones
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY am_write ON merl.activity_milestones
    FOR ALL
    USING (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    )
    WITH CHECK (
        (merl.current_db_user()).role IN ('administrator', 'merl_officer', 'project_manager')
    );

