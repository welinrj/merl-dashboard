-- =============================================================================
-- MERL Dashboard - Migration 0017: Project profiles / KPI dashboards
-- =============================================================================
-- Stores a KPI profile per project (basic data, key dates, finance, ratings,
-- highlights and Development Objective Progress indicators) as flexible JSONB so
-- each project gets its own dashboard page. Seeded with VCAP2 (Adaptation to
-- Climate Change in the Coastal Zone in Vanuatu - Phase II) from its 2026 GEF
-- Project Implementation Report. Editors add/update profiles via RPCs.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS merl.project_profiles (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    acronym     TEXT,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.project_profiles IS
    'Per-project KPI dashboard profiles (basic data, finance, ratings, DO progress indicators) as JSONB.';

ALTER TABLE merl.project_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_profiles_select ON merl.project_profiles;
CREATE POLICY project_profiles_select ON merl.project_profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.v_project_profiles WITH (security_invoker = on) AS
SELECT code, name, acronym, data, updated_by, updated_at, created_at
FROM merl.project_profiles;

-- Upsert a project profile (editor-gated).
CREATE OR REPLACE FUNCTION public.upsert_project_profile(
    p_code TEXT, p_name TEXT, p_acronym TEXT, p_data JSONB
) RETURNS merl.project_profiles
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $fn$
DECLARE v_row merl.project_profiles; v_user merl.users;
BEGIN
    v_user := merl.require_editor();
    IF coalesce(trim(p_code),'') = '' OR coalesce(trim(p_name),'') = '' THEN
        RAISE EXCEPTION 'Project code and name are required';
    END IF;
    INSERT INTO merl.project_profiles (code, name, acronym, data, updated_by, updated_at)
    VALUES (upper(trim(p_code)), trim(p_name), NULLIF(trim(coalesce(p_acronym,'')),''),
            COALESCE(p_data,'{}'::jsonb), v_user.full_name, now())
    ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, acronym = EXCLUDED.acronym, data = EXCLUDED.data,
            updated_by = EXCLUDED.updated_by, updated_at = now()
    RETURNING * INTO v_row;
    RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.delete_project_profile(p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $fn$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_profiles WHERE code = upper(trim(p_code));
END; $fn$;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.project_profiles TO authenticated;
        GRANT SELECT ON public.v_project_profiles TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.upsert_project_profile(TEXT,TEXT,TEXT,JSONB),
            public.delete_project_profile(TEXT)
        TO authenticated;
    END IF;
END $$;

-- Seed VCAP2 -----------------------------------------------------------------
INSERT INTO merl.project_profiles (code, name, acronym, data, updated_by)
VALUES (
    'VCAP2',
    'Adaptation to the Coastal Waters of Vanuatu Project - Phase 2',
    'VCAP2',
    '{"official_title": "Adaptation to Climate Change in the Coastal Zone in Vanuatu - Phase II (VCAP II)", "objective": "To improve the resilience of vulnerable areas and the communities therein to the impacts of climate change through the conservation of biodiversity and natural ecosystems and the implementation of integrated approaches, in order to sustain livelihoods, food production and reduce land degradation - building on the lessons learned from the first phase project.", "source_document": "2026 GEF Project Implementation Report (PIR) - 3rd PIR, FY26", "period": "FY2026 (as of 30 Jun 2026)", "basic": {"GEF ID": "10415", "UNDP PIMS ID": "6374", "Country": "Vanuatu", "Project type": "Full Size", "Implementation status": "3rd PIR (FY26)", "Trust Fund": "GEF Trust Fund; Least Developed Countries Fund (LDCF)", "Implementing partner": "Ministry of Climate Change Adaptation, Meteorology, Geo-Hazards, Environment, Energy and Disaster Management (MCCAMGEEDM)", "UNDP technical team": "Water and Oceans", "Project Manager": "Jackson Tambe Vire"}, "dates": {"Project duration": "72 months", "PIF approval": "19 Dec 2019", "CEO endorsement": "12 May 2022", "Project start": "6 Jul 2022", "Inception workshop": "20 Apr 2023", "Mid-term review (actual)": "31 Dec 2025", "Terminal evaluation (expected)": "6 Apr 2028", "Planned closing": "6 Jul 2028"}, "finance": {"gef_grant": 12544037, "cofinancing": 50858080, "ppg": 300000, "disbursement": 6656333, "delivery_vs_approved_pct": 53.06, "delivery_vs_expected_pct": 57.41, "as_of": "30 Jun 2026"}, "ratings": {"Overall DO rating": "Not yet rated", "Overall IP rating": "Not yet rated", "Overall risk rating": "Low"}, "highlights": {"Direct beneficiaries": "6,684 (M 3,382 / F 3,302)", "People trained": "627 (M 414 / F 213)", "Terrestrial PAs created": "3,757 ha"}, "indicators": [{"code": "Indicator 11", "description": "# direct project beneficiaries (individuals, gender-disaggregated)", "baseline": "0", "midterm": "4,000", "end": "Entire population (307,150)", "current": "6,684 (M 3,382 / F 3,302)", "status": "exceeded"}, {"code": "Core Indicator 1.1", "description": "Terrestrial protected areas newly created (ha)", "baseline": "0", "midterm": "1,000 ha", "end": "2,298 ha", "current": "3,757 ha established; 12,546 ha mapped", "status": "exceeded"}, {"code": "Core Indicator 1.2", "description": "Terrestrial protected areas under improved management effectiveness (ha)", "baseline": "0", "midterm": "5,000 ha", "end": "11,215 ha", "current": "METTs completed for 3 CCAs (8,099 ha); 13 METTs done", "status": "on_track"}, {"code": "Indicator 10", "description": "# investments in climate-proofing of public conveyance, water provision and evacuation infrastructure", "baseline": "0", "midterm": "15", "end": "-", "current": "13 investments completed", "status": "on_track"}, {"code": "Indicator 12", "description": "% targeted V-CAP communities receiving timely, accurate early warnings of coastal hazards", "baseline": "0", "midterm": "10%", "end": "100%", "current": "Early-warning centre, TV weather station and AWS/river gauges under construction", "status": "in_progress"}, {"code": "Indicator 13", "description": "# climate change adaptation plans developed and integrated into Area Council Development Plans", "baseline": "0", "midterm": "10", "end": "20", "current": "3 CCAPs completed (South Epi)", "status": "on_track"}, {"code": "Indicator 15", "description": "# people trained (gender-disaggregated)", "baseline": "0", "midterm": "250 (F 50%)", "end": "1,000 (F 50%)", "current": "627 trained (M 414 / F 213)", "status": "exceeded"}]}'::jsonb,
    'System (from 2026 GEF PIR)'
)
ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name, acronym = EXCLUDED.acronym, data = EXCLUDED.data, updated_at = now();

COMMIT;
