-- DoCC's 10 November 2026 roster. Keep historical and partner records intact.
ALTER TABLE merl.projects
  ADD COLUMN IF NOT EXISTS excluded_from_current_portfolio boolean NOT NULL DEFAULT false;

-- Use the existing service-role maintenance path for register updates.
DO $roster$
DECLARE previous_role text := current_setting('request.jwt.claim.role', true);
BEGIN
PERFORM set_config('request.jwt.claim.role', 'service_role', true);

-- Reuse the CBIT record and its framework. CBIT-VU is a MERL register key.
UPDATE merl.projects
SET code = coalesce(code, 'CBIT-VU'), status = 'active'
WHERE upper(acronym) = 'CBIT'
  AND (code IS NULL OR code = 'CBIT-VU')
  AND (code IS NULL OR status <> 'active');

-- These are distinct from the previous NDC, completed 24B498, and both L&D records.
INSERT INTO merl.projects (code, name, acronym, category, primary_climate_theme, lead_agency, status, description)
VALUES
  ('CBIT-VU', 'CBIT – Capacity-building Initiative for Transparency (FAO)', 'CBIT', 'CC-MITIG', 'Mitigation', 'Department of Climate Change', 'active', NULL),
  ('BOLD-VU', 'Building Our Pacific Loss and Damage (BOLD) Response Project – Vanuatu', 'BOLD', 'CC-ADAPT', 'Loss and Damage', 'Department of Climate Change', 'planning', NULL),
  ('NDC-3-VU', 'Vanuatu Nationally Determined Contribution 3.0', 'NDC 3.0', 'CC-MITIG', 'Mitigation', 'Department of Climate Change', 'active', NULL),
  ('NAPS-PAPS-VU', 'National Adaptation Plan and Provincial Adaptation Plans', 'NAPs/PAPs', 'CC-ADAPT', 'Adaptation', 'Department of Climate Change', 'active', NULL),
  ('FRLD-VU', 'Fund for Responding to Loss and Damage', 'FRLD', 'CC-ADAPT', 'Loss and Damage', 'Department of Climate Change', 'pipeline', 'Vanuatu project in the recruitment stage.')
ON CONFLICT (code) DO NOTHING;

-- Only the directly identified REDD+ profile is marked completed. The
-- readiness profile and other legacy records are excluded by roster membership.
UPDATE merl.projects
SET status = 'completed'
WHERE code = 'DOCC-WEB-REDD' AND status <> 'completed';

WITH current_codes(code) AS (VALUES
  ('VCCRP-001'), ('23A398'), ('PARTNER-2-PLUS-VU'), ('CBIT-VU'),
  ('ICAT-VU-II'), ('24B298'), ('NDC-3-VU'), ('BOLD-VU'), ('NAPS-PAPS-VU'),
  ('DOCC-SRC-PEBACC+'), ('FRLD-VU')
), scope AS (
  SELECT p.id, c.code IS NULL AS excluded
  FROM merl.projects p
  LEFT JOIN current_codes c ON c.code = p.code
)
UPDATE merl.projects p
SET excluded_from_current_portfolio = scope.excluded
FROM scope
WHERE p.id = scope.id AND p.excluded_from_current_portfolio IS DISTINCT FROM scope.excluded;

PERFORM set_config('request.jwt.claim.role', coalesce(previous_role, ''), true);
END;
$roster$;

DO $migration$
DECLARE
  definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'v_projects'
      AND column_name = 'excluded_from_current_portfolio'
  ) THEN
    SELECT pg_get_viewdef('public.v_projects'::regclass, true) INTO definition;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_projects WITH (security_invoker = true) AS
      SELECT base.*, p.excluded_from_current_portfolio FROM (' ||
      rtrim(definition, E';\n ') || ') base JOIN merl.projects p ON p.id = base.id';
  END IF;

  SELECT pg_get_functiondef('merl.refresh_public_portal()'::regprocedure) INTO definition;
  IF position('AND NOT p.excluded_from_current_portfolio' in definition) = 0 THEN
    IF position($old$AND coalesce(p.code::text,'') NOT IN ('BOLD-VU','GGGI-SUPPORT-VU');$old$ in definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected public portfolio definition';
    END IF;
    definition := replace(definition,
      $old$AND coalesce(p.code::text,'') NOT IN ('BOLD-VU','GGGI-SUPPORT-VU');$old$,
      $new$AND NOT p.excluded_from_current_portfolio
      AND lower(p.status::text) <> 'cancelled';$new$);
    EXECUTE definition;
  END IF;

  -- The two newly visible profiles have internal framework records. Only
  -- explicitly public indicators can enter their public category breakdowns.
  SELECT pg_get_functiondef('merl.refresh_public_indicator_categories()'::regprocedure) INTO definition;
  IF position($guard$OR i.is_public IS TRUE$guard$ in definition) = 0 THEN
    IF position($old$AND nullif(btrim(i.name::text),'') IS NOT NULL;$old$ in definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected public indicator definition';
    END IF;
    definition := replace(definition,
      $old$AND nullif(btrim(i.name::text),'') IS NOT NULL;$old$,
      $new$AND nullif(btrim(i.name::text),'') IS NOT NULL
    AND (p.code NOT IN ('CBIT-VU','BOLD-VU') OR p.code IS NULL OR i.is_public IS TRUE);$new$);
    EXECUTE definition;
  END IF;

  SELECT pg_get_functiondef('merl.refresh_public_portal_supplemental()'::regprocedure) INTO definition;
  IF position($guard$coalesce(p.code, '') NOT IN ('CBIT-VU','BOLD-VU')$guard$ in definition) = 0 THEN
    IF position($old$WHERE p.registration_status = 'approved';$old$ in definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected supplemental publication definition';
    END IF;
    definition := replace(definition,
      $old$WHERE p.registration_status = 'approved';$old$,
      $new$WHERE p.registration_status = 'approved'
    AND coalesce(p.code, '') NOT IN ('CBIT-VU','BOLD-VU');$new$);
    EXECUTE definition;
  END IF;

  PERFORM merl.refresh_public_portal();
  PERFORM merl.refresh_public_indicator_categories();
  PERFORM merl.refresh_public_portal_supplemental();

  IF (SELECT count(*) FROM public.public_portal_projects) <> 11
    OR NOT EXISTS (SELECT 1 FROM public.public_portal_projects WHERE code = 'FRLD-VU' AND lifecycle_status = 'upcoming')
  THEN
    RAISE EXCEPTION 'The published portfolio does not match the verified roster';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
