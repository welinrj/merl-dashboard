-- =============================================================================
-- MERL Dashboard – Migration 0029: DoCC Standardised MERL Data Structure
-- =============================================================================
-- Brings the database up to the full "DoCC Standardised MERL Project Data
-- Collection Form" (12 modules). The existing schema already implements
--   Form 1  Project Profile   → merl.projects (+ project_profiles)
--   Form 2  Results Framework → merl.objectives / outcomes / outputs
--   Form 3  Indicators        → merl.project_indicators (base fields)
--   Form 5  Activities        → merl.project_activities (base fields)
-- This migration ADDS the missing modules and the reporting/GEDSI/risk layer:
--   Form 3+ indicator descriptive fields          (project_indicators columns)
--   Form 4  Indicator Progress   → merl.indicator_progress
--   Form 5+ activity operational fields            (project_activities columns)
--   Form 6  Financial Progress   → merl.financial_progress
--   Form 7  Geographic           → merl.project_locations
--   Form 8  Beneficiaries/GEDSI  → merl.beneficiaries
--   Form 9  Risks & Issues       → merl.risks_issues
--   Form 10 Achievements/Learning→ merl.learning_updates
--   Form 11 Reporting/Approval   → merl.reporting_periods
--   Form 12 Evidence Register    → merl.evidence
-- plus Vanuatu geographic reference tables and an auth-preserving reset.
--
-- Conventions (unchanged): tables live in schema `merl`, expose SELECT-only RLS
-- to signed-in users and are read through `public.v_*` security-invoker views;
-- all writes go through SECURITY DEFINER `public.*` RPCs gated by
-- merl.require_editor(); every content table carries an audit trigger.
--
-- NOTE: no explicit BEGIN/COMMIT — the migration tooling (supabase CLI /
-- apply_migration) runs each file inside its own transaction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Coding helper: width-configurable variant of merl.next_code
--    (existing next_code() pads to 2 digits for OBJ/OUT/OP; DoCC wants 3-digit
--     IND/ACT/RSK/ISS/EVD. We add a width-aware helper and keep the original.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merl.next_code_w(
    p_project_id UUID, p_record_type TEXT, p_prefix TEXT, p_width INTEGER DEFAULT 3
)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public
AS $$
DECLARE v_n INTEGER;
BEGIN
    INSERT INTO merl.code_counters (project_id, record_type, last_number)
    VALUES (p_project_id, p_record_type, 1)
    ON CONFLICT (project_id, record_type)
    DO UPDATE SET last_number = merl.code_counters.last_number + 1
    RETURNING last_number INTO v_n;
    RETURN p_prefix || '-' || lpad(v_n::TEXT, p_width, '0');
END;
$$;

-- NOTE ON PROJECT CODES: the portal already auto-generates portal-wide-unique
-- project identifiers via merl.next_project_code(p_year) in the DCC-YYYY-NNN
-- format (migration 0008). That satisfies the DoCC "auto-generated, portal-wide
-- unique Project ID" requirement, so we keep it rather than introducing a second
-- competing scheme. Child records use project-scoped codes (OBJ/OUT/OP/IND/ACT
-- from migration 0009; RSK/ISS/EVD added below).

-- ---------------------------------------------------------------------------
-- 1. Geographic reference tables (Form 7 dependent dropdowns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.ref_provinces (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS merl.ref_islands (
    id            BIGSERIAL PRIMARY KEY,
    province_code TEXT NOT NULL REFERENCES merl.ref_provinces (code) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    UNIQUE (province_code, name)
);
CREATE TABLE IF NOT EXISTS merl.ref_area_councils (
    id            BIGSERIAL PRIMARY KEY,
    province_code TEXT NOT NULL REFERENCES merl.ref_provinces (code) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    UNIQUE (province_code, name)
);

INSERT INTO merl.ref_provinces (code, name, sort) VALUES
    ('TORBA',   'Torba',   1),
    ('SANMA',   'Sanma',   2),
    ('PENAMA',  'Penama',  3),
    ('MALAMPA', 'Malampa', 4),
    ('SHEFA',   'Shefa',   5),
    ('TAFEA',   'Tafea',   6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO merl.ref_islands (province_code, name) VALUES
    ('TORBA','Vanua Lava'), ('TORBA','Mota Lava'), ('TORBA','Mota'), ('TORBA','Gaua'),
    ('TORBA','Ureparapara'), ('TORBA','Merig'), ('TORBA','Merelava'), ('TORBA','Hiu'),
    ('TORBA','Loh'), ('TORBA','Tegua'), ('TORBA','Toga'),
    ('SANMA','Espiritu Santo'), ('SANMA','Malo'), ('SANMA','Aore'), ('SANMA','Tutuba'),
    ('PENAMA','Ambae'), ('PENAMA','Maewo'), ('PENAMA','Pentecost'),
    ('MALAMPA','Malakula'), ('MALAMPA','Ambrym'), ('MALAMPA','Paama'), ('MALAMPA','Uripiv'),
    ('MALAMPA','Wala'), ('MALAMPA','Rano'), ('MALAMPA','Atchin'), ('MALAMPA','Vao'),
    ('SHEFA','Efate'), ('SHEFA','Epi'), ('SHEFA','Tongoa'), ('SHEFA','Tongariki'),
    ('SHEFA','Emae'), ('SHEFA','Makira'), ('SHEFA','Mataso'), ('SHEFA','Nguna'),
    ('SHEFA','Pele'), ('SHEFA','Emao'), ('SHEFA','Lelepa'), ('SHEFA','Moso'),
    ('TAFEA','Tanna'), ('TAFEA','Erromango'), ('TAFEA','Aniwa'), ('TAFEA','Futuna'),
    ('TAFEA','Aneityum')
ON CONFLICT (province_code, name) DO NOTHING;

-- Starter set of Area Councils (extend as the national list is finalised).
INSERT INTO merl.ref_area_councils (province_code, name) VALUES
    ('TORBA','Torres'), ('TORBA','Ureparapara'), ('TORBA','Mota Lava'), ('TORBA','Gaua'), ('TORBA','Vanua Lava'),
    ('SANMA','West Santo'), ('SANMA','East Santo'), ('SANMA','South Santo'), ('SANMA','North Santo'),
    ('SANMA','Canal-Fanafo'), ('SANMA','Big Bay Coast'), ('SANMA','Malo'),
    ('PENAMA','North Ambae'), ('PENAMA','West Ambae'), ('PENAMA','East Ambae'),
    ('PENAMA','Maewo'), ('PENAMA','North Pentecost'), ('PENAMA','Central Pentecost'), ('PENAMA','South Pentecost'),
    ('MALAMPA','North West Malakula'), ('MALAMPA','North East Malakula'), ('MALAMPA','Central Malakula'),
    ('MALAMPA','South West Malakula'), ('MALAMPA','South East Malakula'),
    ('MALAMPA','North Ambrym'), ('MALAMPA','West Ambrym'), ('MALAMPA','South East Ambrym'), ('MALAMPA','Paama'),
    ('SHEFA','North Efate'), ('SHEFA','Central Efate'), ('SHEFA','South Efate'), ('SHEFA','Port Vila'),
    ('SHEFA','Epi'), ('SHEFA','Tongoa-Shepherds'), ('SHEFA','Emae'),
    ('TAFEA','North Tanna'), ('TAFEA','West Tanna'), ('TAFEA','Middle Bush Tanna'),
    ('TAFEA','South West Tanna'), ('TAFEA','Whitesands'), ('TAFEA','Erromango'),
    ('TAFEA','Aniwa'), ('TAFEA','Futuna'), ('TAFEA','Aneityum')
ON CONFLICT (province_code, name) DO NOTHING;

CREATE OR REPLACE VIEW public.v_ref_provinces WITH (security_invoker = on) AS
    SELECT code, name, sort FROM merl.ref_provinces ORDER BY sort;
CREATE OR REPLACE VIEW public.v_ref_islands WITH (security_invoker = on) AS
    SELECT province_code, name FROM merl.ref_islands ORDER BY province_code, name;
CREATE OR REPLACE VIEW public.v_ref_area_councils WITH (security_invoker = on) AS
    SELECT province_code, name FROM merl.ref_area_councils ORDER BY province_code, name;

-- Reference tables are non-sensitive lookups: readable by anyone signed in.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ref_provinces','ref_islands','ref_area_councils'] LOOP
        EXECUTE format('ALTER TABLE merl.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON merl.%1$s', t);
        EXECUTE format('CREATE POLICY %1$s_select ON merl.%1$s FOR SELECT USING (true)', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Form 3 (Indicators) — descriptive columns
-- ---------------------------------------------------------------------------
ALTER TABLE merl.project_indicators
    ADD COLUMN IF NOT EXISTS indicator_level      VARCHAR(20)
        CHECK (indicator_level IS NULL OR indicator_level IN ('impact','outcome','output','process')),
    ADD COLUMN IF NOT EXISTS definition           TEXT,
    ADD COLUMN IF NOT EXISTS baseline_year        INTEGER,
    ADD COLUMN IF NOT EXISTS target_date          DATE,
    ADD COLUMN IF NOT EXISTS data_source          TEXT,
    ADD COLUMN IF NOT EXISTS collection_method    TEXT,
    ADD COLUMN IF NOT EXISTS responsible_officer_id UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS disaggregation       TEXT,
    ADD COLUMN IF NOT EXISTS verification_method   TEXT,
    ADD COLUMN IF NOT EXISTS assumptions          TEXT,
    -- Distinct level links (in addition to the polymorphic linked_level/linked_id)
    ADD COLUMN IF NOT EXISTS objective_id  UUID REFERENCES merl.objectives (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS outcome_id    UUID REFERENCES merl.outcomes (id)   ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS output_id     UUID REFERENCES merl.outputs (id)    ON DELETE SET NULL,
    -- Qualitative / inverse indicators (Section 14: don't blindly apply % formula)
    ADD COLUMN IF NOT EXISTS is_qualitative BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS higher_is_better BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 3. Form 5 (Activities) — operational / workplan columns
-- ---------------------------------------------------------------------------
ALTER TABLE merl.project_activities
    ADD COLUMN IF NOT EXISTS outcome_id           UUID REFERENCES merl.outcomes (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsible_org      TEXT,
    ADD COLUMN IF NOT EXISTS province             TEXT,
    ADD COLUMN IF NOT EXISTS island               TEXT,
    ADD COLUMN IF NOT EXISTS area_council         TEXT,
    ADD COLUMN IF NOT EXISTS community             TEXT,
    ADD COLUMN IF NOT EXISTS planned_start_date   DATE,
    ADD COLUMN IF NOT EXISTS planned_end_date     DATE,
    ADD COLUMN IF NOT EXISTS actual_start_date    DATE,
    ADD COLUMN IF NOT EXISTS actual_end_date      DATE,
    ADD COLUMN IF NOT EXISTS planned_budget       NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS actual_expenditure   NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS physical_progress_pct NUMERIC(5,2)
        CHECK (physical_progress_pct IS NULL OR (physical_progress_pct >= 0 AND physical_progress_pct <= 100)),
    ADD COLUMN IF NOT EXISTS key_achievement      TEXT,
    ADD COLUMN IF NOT EXISTS issue_delay          TEXT,
    ADD COLUMN IF NOT EXISTS next_action          TEXT,
    ADD COLUMN IF NOT EXISTS next_action_due      DATE,
    ADD CONSTRAINT project_activities_dates_check
        CHECK (planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
        NOT VALID;

-- Allow the DoCC Form 5 status set (adds 'on_hold' to the existing check).
DO $$
BEGIN
    ALTER TABLE merl.project_activities DROP CONSTRAINT IF EXISTS project_activities_status_check;
    ALTER TABLE merl.project_activities ADD CONSTRAINT project_activities_status_check
        CHECK (status IN ('not_started','in_progress','completed','delayed','cancelled','on_hold'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Form 1: widen merl.projects.status to the DoCC operational vocabulary
-- (Pipeline / Approved / Not Started / On Track / At Risk / Delayed / Suspended
--  / Completed / Closed), retaining the legacy values so existing rows stay valid.
ALTER TABLE merl.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE merl.projects ADD CONSTRAINT projects_status_check CHECK (
    (status)::text = ANY (ARRAY[
        'pipeline','approved','not_started','on_track','at_risk','delayed','suspended','completed','closed',
        'planning','active','on_hold','cancelled'
    ]::text[])
);

-- ---------------------------------------------------------------------------
-- 4. New module tables (Forms 4, 6, 7, 8, 9, 10, 11, 12)
--    Every table carries created_by/created_at/updated_by/updated_at for the
--    Section-18 audit trail, plus a row-level audit trigger.
-- ---------------------------------------------------------------------------

-- Form 4 — Indicator Progress (repeatable per reporting period) ---------------
CREATE TABLE IF NOT EXISTS merl.indicator_progress (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    indicator_id        UUID NOT NULL REFERENCES merl.project_indicators (id) ON DELETE CASCADE,
    reporting_period    TEXT NOT NULL,
    period_target       NUMERIC(18,4),
    actual_this_period  NUMERIC(18,4),
    cumulative_actual   NUMERIC(18,4),
    previous_value      NUMERIC(18,4),
    achievement_pct     NUMERIC(7,2),
    variance            NUMERIC(18,4),
    performance_status  VARCHAR(24)
        CHECK (performance_status IS NULL OR performance_status IN
            ('on_track','attention_required','off_track','target_achieved','no_data')),
    narrative           TEXT,
    variance_reason     TEXT,
    corrective_action   TEXT,
    reported_by         UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    date_reported       DATE,
    created_by          UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by          UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ip_indicator ON merl.indicator_progress (indicator_id);
CREATE INDEX IF NOT EXISTS idx_ip_project   ON merl.indicator_progress (project_id);

-- Form 6 — Financial Progress (repeatable per reporting period) ---------------
CREATE TABLE IF NOT EXISTS merl.financial_progress (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    reporting_period     TEXT NOT NULL,
    approved_budget      NUMERIC(18,2),
    annual_budget        NUMERIC(18,2),
    period_budget        NUMERIC(18,2),
    expenditure_period   NUMERIC(18,2) CHECK (expenditure_period IS NULL OR expenditure_period >= 0),
    cumulative_expenditure NUMERIC(18,2) CHECK (cumulative_expenditure IS NULL OR cumulative_expenditure >= 0),
    remaining_balance    NUMERIC(18,2),
    utilisation_pct      NUMERIC(7,2),
    funds_received       NUMERIC(18,2),
    funds_committed      NUMERIC(18,2),
    funds_available      NUMERIC(18,2),
    narrative            TEXT,
    created_by           UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by           UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fp_project ON merl.financial_progress (project_id);

-- Form 7 — Geographic Implementation ------------------------------------------
CREATE TABLE IF NOT EXISTS merl.project_locations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    province       TEXT,
    island         TEXT,
    area_council   TEXT,
    community      TEXT,
    latitude       NUMERIC(9,6)  CHECK (latitude  IS NULL OR (latitude  BETWEEN -90 AND 90)),
    longitude      NUMERIC(9,6)  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
    intervention   TEXT,
    status         VARCHAR(24),
    beneficiaries  INTEGER CHECK (beneficiaries IS NULL OR beneficiaries >= 0),
    created_by     UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loc_project  ON merl.project_locations (project_id);
CREATE INDEX IF NOT EXISTS idx_loc_province ON merl.project_locations (province);

-- Form 8 — Beneficiaries & GEDSI (repeatable). NULL ≠ 0 (Section 14): counts
-- are nullable so "Not Collected" stays distinct from a recorded zero. ---------
CREATE TABLE IF NOT EXISTS merl.beneficiaries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    reporting_period      TEXT,
    activity_id           UUID REFERENCES merl.project_activities (id) ON DELETE SET NULL,
    location              TEXT,
    total_direct          INTEGER CHECK (total_direct IS NULL OR total_direct >= 0),
    female                INTEGER CHECK (female     IS NULL OR female     >= 0),
    male                  INTEGER CHECK (male       IS NULL OR male       >= 0),
    other_gender          INTEGER CHECK (other_gender IS NULL OR other_gender >= 0),
    youth                 INTEGER CHECK (youth      IS NULL OR youth      >= 0),
    persons_with_disability INTEGER CHECK (persons_with_disability IS NULL OR persons_with_disability >= 0),
    other_vulnerable      TEXT,
    indirect              INTEGER CHECK (indirect   IS NULL OR indirect   >= 0),
    data_source           TEXT,
    double_counting_check BOOLEAN,
    comments              TEXT,
    created_by            UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by            UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ben_project ON merl.beneficiaries (project_id);

-- Form 9 — Risks, Issues & Corrective Actions (RSK-001 / ISS-001) -------------
CREATE TABLE IF NOT EXISTS merl.risks_issues (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    type           VARCHAR(10) NOT NULL CHECK (type IN ('risk','issue')),
    description    TEXT NOT NULL,
    category       VARCHAR(24) CHECK (category IS NULL OR category IN
        ('financial','technical','operational','environmental','social_gedsi',
         'governance','procurement','safeguards','other')),
    date_identified DATE,
    likelihood     INTEGER CHECK (likelihood IS NULL OR likelihood BETWEEN 1 AND 5),
    impact         INTEGER CHECK (impact IS NULL OR impact BETWEEN 1 AND 5),
    risk_rating    VARCHAR(12),               -- derived Low/Medium/High/Critical
    mitigation     TEXT,
    responsible_person TEXT,
    due_date       DATE,
    status         VARCHAR(16) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','monitoring','escalated','resolved','closed')),
    latest_update  TEXT,
    date_resolved  DATE,
    created_by     UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_risk_project ON merl.risks_issues (project_id);
CREATE INDEX IF NOT EXISTS idx_risk_status  ON merl.risks_issues (status);

-- Configurable Likelihood × Impact → rating (Section 9).
CREATE OR REPLACE FUNCTION merl.risk_rating(p_likelihood INTEGER, p_impact INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_likelihood IS NULL OR p_impact IS NULL THEN NULL
        WHEN p_likelihood * p_impact >= 15 THEN 'Critical'
        WHEN p_likelihood * p_impact >= 9  THEN 'High'
        WHEN p_likelihood * p_impact >= 4  THEN 'Medium'
        ELSE 'Low'
    END;
$$;

-- Form 10 — Achievements, Challenges & Learning (repeatable per period) -------
CREATE TABLE IF NOT EXISTS merl.learning_updates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    reporting_period   TEXT,
    key_achievements   TEXT,
    major_results      TEXT,
    challenges         TEXT,
    lessons_learned    TEXT,
    successful_approaches TEXT,
    what_did_not_work  TEXT,
    corrective_actions TEXT,
    recommendations    TEXT,
    emerging_opportunities TEXT,
    next_period_priorities TEXT,
    success_story      TEXT,
    created_by         UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by         UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learn_project ON merl.learning_updates (project_id);

-- Form 11 — Reporting Period Submission & Approval ----------------------------
CREATE TABLE IF NOT EXISTS merl.reporting_periods (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    period_label      TEXT NOT NULL,
    period_type       VARCHAR(16) CHECK (period_type IS NULL OR period_type IN
        ('monthly','quarterly','six_monthly','annual','final','ad_hoc')),
    period_start      DATE,
    period_end        DATE,
    reporting_officer_id UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    submission_status VARCHAR(12) NOT NULL DEFAULT 'draft'
        CHECK (submission_status IN ('draft','submitted','returned','reviewed','approved')),
    submitted_at      TIMESTAMPTZ,
    reviewer_id       UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    review_comments   TEXT,
    approved_at       TIMESTAMPTZ,
    created_by        UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by        UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reporting_periods_dates_check CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_rp_project ON merl.reporting_periods (project_id);

-- Form 12 — Documents & Evidence Register (EVD-001) ---------------------------
CREATE TABLE IF NOT EXISTS merl.evidence (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    code             VARCHAR(30) NOT NULL,
    reporting_period TEXT,
    indicator_id     UUID REFERENCES merl.project_indicators (id) ON DELETE SET NULL,
    activity_id      UUID REFERENCES merl.project_activities (id) ON DELETE SET NULL,
    document_type    VARCHAR(32) CHECK (document_type IS NULL OR document_type IN
        ('attendance_list','photograph','monitoring_report','survey_data','financial_report',
         'contract','completion_report','evaluation','map','other')),
    title            TEXT NOT NULL,
    description      TEXT,
    document_date    DATE,
    file_url         TEXT,
    verification_status VARCHAR(12) NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending','verified','rejected','superseded')),
    uploaded_by      UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_by       UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by       UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_evd_project ON merl.evidence (project_id);

-- ---------------------------------------------------------------------------
-- 5. RLS (SELECT-only for signed-in users) + audit triggers for new tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'indicator_progress','financial_progress','project_locations','beneficiaries',
        'risks_issues','learning_updates','reporting_periods','evidence'
    ] LOOP
        EXECUTE format('ALTER TABLE merl.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON merl.%1$s', t);
        EXECUTE format('CREATE POLICY %1$s_select ON merl.%1$s FOR SELECT USING ( merl.current_db_user() IS NOT NULL )', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON merl.%1$s', t);
        EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON merl.%1$s FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger()', t);
        EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON merl.%1$s FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at()', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Public read views (security_invoker so RLS is respected)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_indicator_progress WITH (security_invoker = on) AS
SELECT ip.*, i.code AS indicator_code, i.name AS indicator_name, i.unit,
       i.target_value AS final_target, i.is_qualitative, i.higher_is_better,
       ru.full_name AS reported_by_name
FROM merl.indicator_progress ip
JOIN merl.project_indicators i ON i.id = ip.indicator_id
LEFT JOIN merl.users ru ON ru.id = ip.reported_by;

CREATE OR REPLACE VIEW public.v_financial_progress WITH (security_invoker = on) AS
SELECT fp.* FROM merl.financial_progress fp;

CREATE OR REPLACE VIEW public.v_project_locations WITH (security_invoker = on) AS
SELECT l.* FROM merl.project_locations l;

CREATE OR REPLACE VIEW public.v_beneficiaries WITH (security_invoker = on) AS
SELECT b.*, a.code AS activity_code, a.name AS activity_name
FROM merl.beneficiaries b
LEFT JOIN merl.project_activities a ON a.id = b.activity_id;

CREATE OR REPLACE VIEW public.v_risks_issues WITH (security_invoker = on) AS
SELECT r.* FROM merl.risks_issues r;

CREATE OR REPLACE VIEW public.v_learning_updates WITH (security_invoker = on) AS
SELECT lu.* FROM merl.learning_updates lu;

CREATE OR REPLACE VIEW public.v_reporting_periods WITH (security_invoker = on) AS
SELECT rp.*, ro.full_name AS reporting_officer_name, rv.full_name AS reviewer_name
FROM merl.reporting_periods rp
LEFT JOIN merl.users ro ON ro.id = rp.reporting_officer_id
LEFT JOIN merl.users rv ON rv.id = rp.reviewer_id;

CREATE OR REPLACE VIEW public.v_evidence WITH (security_invoker = on) AS
SELECT e.*, i.code AS indicator_code, a.code AS activity_code, u.full_name AS uploaded_by_name
FROM merl.evidence e
LEFT JOIN merl.project_indicators i ON i.id = e.indicator_id
LEFT JOIN merl.project_activities a ON a.id = e.activity_id
LEFT JOIN merl.users u ON u.id = e.uploaded_by;

-- Extend the indicator read view with the new descriptive columns.
-- CREATE OR REPLACE VIEW only permits APPENDING columns, so the original
-- leading columns keep their order and the new ones are added at the end.
CREATE OR REPLACE VIEW public.v_project_indicators WITH (security_invoker = on) AS
SELECT i.id, i.project_id, i.code, i.name, i.unit, i.baseline_value, i.target_value,
       i.means_of_verification, i.frequency, i.linked_level, i.linked_id,
       COALESCE(obj.code, oc.code, op.code, act.code) AS linked_code,
       i.created_at, i.updated_at,
       i.indicator_level, i.definition, i.baseline_year, i.target_date, i.data_source,
       i.collection_method, i.responsible_officer_id, i.disaggregation,
       i.verification_method, i.assumptions, i.objective_id, i.outcome_id, i.output_id,
       i.is_qualitative, i.higher_is_better
FROM merl.project_indicators i
LEFT JOIN merl.objectives         obj ON i.linked_level = 'objective' AND obj.id = i.linked_id
LEFT JOIN merl.outcomes           oc  ON i.linked_level = 'outcome'   AND oc.id  = i.linked_id
LEFT JOIN merl.outputs            op  ON i.linked_level = 'output'    AND op.id  = i.linked_id
LEFT JOIN merl.project_activities act ON i.linked_level = 'activity'  AND act.id = i.linked_id;

-- Extend the activity read view with the new operational columns (appended).
CREATE OR REPLACE VIEW public.v_project_activities WITH (security_invoker = on) AS
SELECT a.id, a.project_id, a.output_id, a.code, a.name, a.description,
       op.code AS output_code,
       a.responsible_officer_id, ru.full_name AS responsible_officer_name,
       a.status, a.created_at, a.updated_at,
       a.outcome_id, a.responsible_org, a.province, a.island, a.area_council,
       a.community, a.planned_start_date, a.planned_end_date, a.actual_start_date,
       a.actual_end_date, a.planned_budget, a.actual_expenditure, a.physical_progress_pct,
       a.key_achievement, a.issue_delay, a.next_action, a.next_action_due
FROM merl.project_activities a
JOIN merl.outputs op ON op.id = a.output_id
LEFT JOIN merl.users ru ON ru.id = a.responsible_officer_id;

-- ---------------------------------------------------------------------------
-- 7. Write RPCs (SECURITY DEFINER, editor-gated). Upsert (p_id NULL = insert)
--    + delete per table, following the migration-0009 pattern.
-- ---------------------------------------------------------------------------

-- Form 4 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_indicator_progress(
    p_id UUID, p_project_id UUID, p_indicator_id UUID, p_reporting_period TEXT,
    p_period_target NUMERIC DEFAULT NULL, p_actual_this_period NUMERIC DEFAULT NULL,
    p_cumulative_actual NUMERIC DEFAULT NULL, p_previous_value NUMERIC DEFAULT NULL,
    p_achievement_pct NUMERIC DEFAULT NULL, p_variance NUMERIC DEFAULT NULL,
    p_performance_status TEXT DEFAULT NULL, p_narrative TEXT DEFAULT NULL,
    p_variance_reason TEXT DEFAULT NULL, p_corrective_action TEXT DEFAULT NULL,
    p_date_reported DATE DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();
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
END; $$;

CREATE OR REPLACE FUNCTION public.delete_indicator_progress(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.indicator_progress WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Indicator progress not found'; END IF;
END; $$;

-- Form 6 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_financial_progress(
    p_id UUID, p_project_id UUID, p_reporting_period TEXT,
    p_approved_budget NUMERIC DEFAULT NULL, p_annual_budget NUMERIC DEFAULT NULL,
    p_period_budget NUMERIC DEFAULT NULL, p_expenditure_period NUMERIC DEFAULT NULL,
    p_cumulative_expenditure NUMERIC DEFAULT NULL, p_funds_received NUMERIC DEFAULT NULL,
    p_funds_committed NUMERIC DEFAULT NULL, p_narrative TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID; v_remaining NUMERIC; v_util NUMERIC; v_avail NUMERIC;
BEGIN
    v_user := merl.require_editor();
    -- Server-side calculations (Section 6): balance, utilisation %, funds available.
    v_remaining := CASE WHEN p_approved_budget IS NOT NULL AND p_cumulative_expenditure IS NOT NULL
                        THEN p_approved_budget - p_cumulative_expenditure END;
    v_util := CASE WHEN p_approved_budget IS NOT NULL AND p_approved_budget <> 0 AND p_cumulative_expenditure IS NOT NULL
                   THEN round(p_cumulative_expenditure / p_approved_budget * 100, 2) END;
    v_avail := CASE WHEN p_funds_received IS NOT NULL
                    THEN COALESCE(p_funds_received,0) - COALESCE(p_funds_committed,0) END;
    IF p_id IS NULL THEN
        INSERT INTO merl.financial_progress (project_id, reporting_period, approved_budget,
            annual_budget, period_budget, expenditure_period, cumulative_expenditure,
            remaining_balance, utilisation_pct, funds_received, funds_committed, funds_available,
            narrative, created_by, updated_by)
        VALUES (p_project_id, p_reporting_period, p_approved_budget, p_annual_budget,
            p_period_budget, p_expenditure_period, p_cumulative_expenditure, v_remaining,
            v_util, p_funds_received, p_funds_committed, v_avail, p_narrative, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.financial_progress SET reporting_period=p_reporting_period,
            approved_budget=p_approved_budget, annual_budget=p_annual_budget,
            period_budget=p_period_budget, expenditure_period=p_expenditure_period,
            cumulative_expenditure=p_cumulative_expenditure, remaining_balance=v_remaining,
            utilisation_pct=v_util, funds_received=p_funds_received,
            funds_committed=p_funds_committed, funds_available=v_avail,
            narrative=p_narrative, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Financial progress not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_financial_progress(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.financial_progress WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial progress not found'; END IF;
END; $$;

-- Form 7 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_project_location(
    p_id UUID, p_project_id UUID, p_province TEXT DEFAULT NULL, p_island TEXT DEFAULT NULL,
    p_area_council TEXT DEFAULT NULL, p_community TEXT DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL, p_longitude NUMERIC DEFAULT NULL,
    p_intervention TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_beneficiaries INTEGER DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();
    IF p_id IS NULL THEN
        INSERT INTO merl.project_locations (project_id, province, island, area_council,
            community, latitude, longitude, intervention, status, beneficiaries, created_by, updated_by)
        VALUES (p_project_id, p_province, p_island, p_area_council, p_community, p_latitude,
            p_longitude, p_intervention, p_status, p_beneficiaries, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.project_locations SET province=p_province, island=p_island,
            area_council=p_area_council, community=p_community, latitude=p_latitude,
            longitude=p_longitude, intervention=p_intervention, status=p_status,
            beneficiaries=p_beneficiaries, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_project_location(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_locations WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
END; $$;

-- Form 8 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_beneficiaries(
    p_id UUID, p_project_id UUID, p_reporting_period TEXT DEFAULT NULL,
    p_activity_id UUID DEFAULT NULL, p_location TEXT DEFAULT NULL,
    p_total_direct INTEGER DEFAULT NULL, p_female INTEGER DEFAULT NULL,
    p_male INTEGER DEFAULT NULL, p_other_gender INTEGER DEFAULT NULL,
    p_youth INTEGER DEFAULT NULL, p_persons_with_disability INTEGER DEFAULT NULL,
    p_other_vulnerable TEXT DEFAULT NULL, p_indirect INTEGER DEFAULT NULL,
    p_data_source TEXT DEFAULT NULL, p_double_counting_check BOOLEAN DEFAULT NULL,
    p_comments TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();
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
END; $$;

CREATE OR REPLACE FUNCTION public.delete_beneficiaries(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.beneficiaries WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Beneficiary record not found'; END IF;
END; $$;

-- Form 9 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_risk_issue(
    p_id UUID, p_project_id UUID, p_type TEXT, p_description TEXT,
    p_category TEXT DEFAULT NULL, p_date_identified DATE DEFAULT NULL,
    p_likelihood INTEGER DEFAULT NULL, p_impact INTEGER DEFAULT NULL,
    p_mitigation TEXT DEFAULT NULL, p_responsible_person TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL, p_status TEXT DEFAULT 'open',
    p_latest_update TEXT DEFAULT NULL, p_date_resolved DATE DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID; v_code TEXT; v_rating TEXT;
BEGIN
    v_user := merl.require_editor();
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
END; $$;

CREATE OR REPLACE FUNCTION public.delete_risk_issue(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.risks_issues WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Risk/issue not found'; END IF;
END; $$;

-- Form 10 ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_learning_update(
    p_id UUID, p_project_id UUID, p_reporting_period TEXT DEFAULT NULL,
    p_key_achievements TEXT DEFAULT NULL, p_major_results TEXT DEFAULT NULL,
    p_challenges TEXT DEFAULT NULL, p_lessons_learned TEXT DEFAULT NULL,
    p_successful_approaches TEXT DEFAULT NULL, p_what_did_not_work TEXT DEFAULT NULL,
    p_corrective_actions TEXT DEFAULT NULL, p_recommendations TEXT DEFAULT NULL,
    p_emerging_opportunities TEXT DEFAULT NULL, p_next_period_priorities TEXT DEFAULT NULL,
    p_success_story TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();
    IF p_id IS NULL THEN
        INSERT INTO merl.learning_updates (project_id, reporting_period, key_achievements,
            major_results, challenges, lessons_learned, successful_approaches, what_did_not_work,
            corrective_actions, recommendations, emerging_opportunities, next_period_priorities,
            success_story, created_by, updated_by)
        VALUES (p_project_id, p_reporting_period, p_key_achievements, p_major_results, p_challenges,
            p_lessons_learned, p_successful_approaches, p_what_did_not_work, p_corrective_actions,
            p_recommendations, p_emerging_opportunities, p_next_period_priorities, p_success_story,
            v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.learning_updates SET reporting_period=p_reporting_period,
            key_achievements=p_key_achievements, major_results=p_major_results, challenges=p_challenges,
            lessons_learned=p_lessons_learned, successful_approaches=p_successful_approaches,
            what_did_not_work=p_what_did_not_work, corrective_actions=p_corrective_actions,
            recommendations=p_recommendations, emerging_opportunities=p_emerging_opportunities,
            next_period_priorities=p_next_period_priorities, success_story=p_success_story, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Learning update not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_learning_update(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.learning_updates WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Learning update not found'; END IF;
END; $$;

-- Form 11 — period record + approval workflow ---------------------------------
CREATE OR REPLACE FUNCTION public.upsert_reporting_period(
    p_id UUID, p_project_id UUID, p_period_label TEXT, p_period_type TEXT DEFAULT NULL,
    p_period_start DATE DEFAULT NULL, p_period_end DATE DEFAULT NULL,
    p_reporting_officer_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();
    IF p_id IS NULL THEN
        INSERT INTO merl.reporting_periods (project_id, period_label, period_type, period_start,
            period_end, reporting_officer_id, created_by, updated_by)
        VALUES (p_project_id, p_period_label, p_period_type, p_period_start, p_period_end,
            COALESCE(p_reporting_officer_id, v_user.id), v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.reporting_periods SET period_label=p_period_label, period_type=p_period_type,
            period_start=p_period_start, period_end=p_period_end,
            reporting_officer_id=COALESCE(p_reporting_officer_id, reporting_officer_id), updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_reporting_period(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.require_editor();
    UPDATE merl.reporting_periods
       SET submission_status='submitted', submitted_at=NOW(), updated_by=v_user.id
     WHERE id=p_id AND submission_status IN ('draft','returned');
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not in a submittable state'; END IF;
END; $$;

-- Approvals require an approver role (admin / senior officer / M&E officer).
CREATE OR REPLACE FUNCTION public.review_reporting_period(
    p_id UUID, p_decision TEXT, p_comments TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_status TEXT;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('administrator','docc_senior_officer','docc_me_officer') THEN
        RAISE EXCEPTION 'Approver access required';
    END IF;
    v_status := CASE p_decision
        WHEN 'approve' THEN 'approved'
        WHEN 'return'  THEN 'returned'
        WHEN 'review'  THEN 'reviewed'
        ELSE NULL END;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Invalid decision: %', p_decision; END IF;
    UPDATE merl.reporting_periods
       SET submission_status=v_status,
           reviewer_id=v_user.id,
           review_comments=p_comments,
           approved_at=CASE WHEN v_status='approved' THEN NOW() ELSE approved_at END,
           updated_by=v_user.id
     WHERE id=p_id AND submission_status IN ('submitted','reviewed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not awaiting review'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_reporting_period(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.reporting_periods WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
END; $$;

-- Form 12 ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_evidence(
    p_id UUID, p_project_id UUID, p_title TEXT, p_document_type TEXT DEFAULT NULL,
    p_reporting_period TEXT DEFAULT NULL, p_indicator_id UUID DEFAULT NULL,
    p_activity_id UUID DEFAULT NULL, p_description TEXT DEFAULT NULL,
    p_document_date DATE DEFAULT NULL, p_file_url TEXT DEFAULT NULL,
    p_verification_status TEXT DEFAULT 'pending'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID; v_code TEXT;
BEGIN
    v_user := merl.require_editor();
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
END; $$;

CREATE OR REPLACE FUNCTION public.delete_evidence(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.evidence WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evidence not found'; END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 8. Grants: SELECT on tables + views to authenticated; EXECUTE on RPCs.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON
            merl.indicator_progress, merl.financial_progress, merl.project_locations,
            merl.beneficiaries, merl.risks_issues, merl.learning_updates,
            merl.reporting_periods, merl.evidence,
            merl.ref_provinces, merl.ref_islands, merl.ref_area_councils
        TO authenticated;
        GRANT SELECT ON
            public.v_indicator_progress, public.v_financial_progress, public.v_project_locations,
            public.v_beneficiaries, public.v_risks_issues, public.v_learning_updates,
            public.v_reporting_periods, public.v_evidence,
            public.v_ref_provinces, public.v_ref_islands, public.v_ref_area_councils
        TO authenticated;
        GRANT SELECT ON
            public.v_ref_provinces, public.v_ref_islands, public.v_ref_area_councils
        TO anon;
    END IF;
END $$;

-- Grant EXECUTE on the new RPCs to authenticated, revoke from anon/public.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
            'upsert_indicator_progress','delete_indicator_progress',
            'upsert_financial_progress','delete_financial_progress',
            'upsert_project_location','delete_project_location',
            'upsert_beneficiaries','delete_beneficiaries',
            'upsert_risk_issue','delete_risk_issue',
            'upsert_learning_update','delete_learning_update',
            'upsert_reporting_period','submit_reporting_period','review_reporting_period','delete_reporting_period',
            'upsert_evidence','delete_evidence'
        )
    LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Auth-preserving operational RESET (Sections 2–4).
--    Deletes ALL project / MERL operational data while preserving user
--    accounts, credentials, roles and permissions. auth.* and merl.users are
--    never touched. Admin-only; immutable audit_logs are retained by design.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_operational_data(p_confirm TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE t TEXT;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required to reset operational data';
    END IF;
    IF p_confirm IS DISTINCT FROM 'RESET' THEN
        RAISE EXCEPTION 'Reset not confirmed. Pass the literal text RESET to proceed.';
    END IF;

    -- Truncate operational tables. TRUNCATE ... CASCADE follows FK chains, so
    -- truncating merl.projects clears objectives/outcomes/outputs/activities/
    -- indicators/progress/locations/beneficiaries/risks/learning/periods/evidence.
    -- merl.users, auth.*, and reference tables are deliberately excluded.
    FOREACH t IN ARRAY ARRAY[
        'merl.projects',                 -- cascades to the whole per-project tree
        'merl.project_profiles',
        'merl.code_counters',
        'merl.portal_counters',
        'merl.srf_activities',           -- cascades to srf photos/reports/columns links
        -- legacy single-project MERL tables from migration 0001
        'merl.indicators','merl.indicator_values','merl.activities','merl.activity_milestones',
        'merl.financial_transactions','merl.ld_events','merl.community_engagements',
        'merl.learning_entries','merl.document_uploads'
    ] LOOP
        IF to_regclass(t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE TABLE %s RESTART IDENTITY CASCADE', t);
        END IF;
    END LOOP;

    -- public.datasets is operational demo/upload data (not auth).
    IF to_regclass('public.datasets') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE public.datasets RESTART IDENTITY CASCADE';
    END IF;

    RETURN 'Operational data reset complete. User accounts, roles and authentication were preserved.';
END; $$;

REVOKE EXECUTE ON FUNCTION public.reset_operational_data(TEXT) FROM anon, public;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.reset_operational_data(TEXT) TO authenticated;
    END IF;
END $$;
