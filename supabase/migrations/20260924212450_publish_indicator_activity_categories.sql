-- Publish decision-maker-friendly aggregate counts for the full project
-- indicator register. Indicator text and internal progress remain private;
-- the public table contains only one count per project and activity area.

SELECT set_config('request.jwt.claim.role', 'service_role', true);

CREATE OR REPLACE FUNCTION merl.classify_indicator_activity(
  p_project_code text,
  p_indicator_code text,
  p_indicator_name text,
  p_framework_code text,
  p_framework_title text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    -- Curated mappings for the 83 indicators reviewed on 24 September 2026.
    -- These use stable project/indicator codes so broad keyword matches do not
    -- misclassify compound statements such as climate-information training.
    WHEN p_project_code='23A398' AND p_framework_code IN ('O1.1','O1.2') THEN 'ecosystems'
    WHEN p_project_code='23A398' AND p_indicator_code='VCAP-I9' THEN 'livelihoods'
    WHEN p_project_code='23A398' AND p_indicator_code='VCAP-I10' THEN 'infrastructure'
    WHEN p_project_code='23A398' AND p_framework_code='O2.1' THEN 'climate-risk'
    WHEN p_project_code='23A398' AND p_indicator_code IN ('VCAP-I13','VCAP-I14','VCAP-I16') THEN 'governance'
    WHEN p_project_code='23A398' AND p_indicator_code IN ('VCAP-I15','VCAP-I17') THEN 'capacity'
    WHEN p_project_code='23A398' AND p_indicator_code='VCAP-M11' THEN 'beneficiaries'

    WHEN p_project_code='VCCRP-001' AND p_indicator_code IN (
      'VCCRP-1.1A','VCCRP-1.2B','VCCRP-3.1A','VCCRP-3.1B','VCCRP-GCF-C5'
    ) THEN 'governance'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code IN (
      'VCCRP-1.1B','VCCRP-1.1C','VCCRP-1.2A'
    ) THEN 'capacity'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code LIKE 'VCCRP-1.3%' THEN 'climate-risk'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code IN (
      'VCCRP-2.1A','VCCRP-GCF-C4','VCCRP-GCF-S4.1'
    ) THEN 'ecosystems'
    WHEN p_project_code='VCCRP-001' AND (
      p_indicator_code LIKE 'VCCRP-2.2%'
      OR p_indicator_code LIKE 'VCCRP-2.3%'
      OR p_indicator_code LIKE 'VCCRP-2.4%'
      OR p_indicator_code IN ('VCCRP-GCF-S2.1','VCCRP-GCF-S2.2')
    ) THEN 'livelihoods'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code IN (
      'VCCRP-3.2A','VCCRP-3.2B','VCCRP-GCF-C8'
    ) THEN 'learning-delivery'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code='VCCRP-GCF-C6' THEN 'infrastructure'
    WHEN p_project_code='VCCRP-001' AND p_indicator_code IN (
      'VCCRP-GCF-C2-D','VCCRP-GCF-C2-I','VCCRP-GCF-S2.5'
    ) THEN 'beneficiaries'

    WHEN p_project_code='24B298' AND (
      p_indicator_code LIKE 'C1.%'
      OR p_indicator_code LIKE 'C2.%'
      OR p_indicator_code LIKE 'C6.%'
    ) THEN 'finance'
    WHEN p_project_code='24B298' AND p_indicator_code IN (
      'C0.1.I','C0.2.I','C0.3.I','C3.1.I'
    ) THEN 'learning-delivery'
    WHEN p_project_code='24B298' AND p_indicator_code='C0.4.I' THEN 'climate-risk'
    WHEN p_project_code='24B298' AND (
      p_indicator_code='C0.5.I' OR p_indicator_code LIKE 'C4.%'
    ) THEN 'capacity'
    WHEN p_project_code='24B298' AND p_indicator_code='C0.6.I' THEN 'governance'
    WHEN p_project_code='24B298' AND (
      p_indicator_code LIKE 'C5.%' OR p_indicator_code LIKE 'C7.%'
    ) THEN 'learning-delivery'

    -- Transparent semantic fallback for future indicators. Every indicator is
    -- counted exactly once, with unmatched records kept visible as "other".
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(biodivers|ecosystem|protected area|forest|wetland|mangrove|natural resource|landscape|marine habitat|restor|sustainable land)' THEN 'ecosystems'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(early warning|weather station|climate information|disaster risk|flood|hazard|risk reduction)' THEN 'climate-risk'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(agricultur|farm|fisher|food|livelihood|producer|income|market|preservation)' THEN 'livelihoods'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(infrastructure|evacuation|water provision|technology deployment|technology transfer|internet connectivity)' THEN 'infrastructure'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(finance|financial|capitali[sz]ation|funding|fund design|fund governance)' THEN 'finance'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(governance|policy|policies|legislative|regulatory|planning|adaptation plan|management plan|institution)' THEN 'governance'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(training|trained|capacity|awareness|understanding|engagement|consultation|inclusion|gender|youth|advocacy)' THEN 'capacity'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(monitoring|evaluation|audit|procurement|project plan|knowledge|learning|assessment|report)' THEN 'learning-delivery'
    WHEN lower(concat_ws(' ',p_indicator_name,p_framework_title)) ~
      '(beneficiar|people|community resilience|social protection)' THEN 'beneficiaries'
    ELSE 'other'
  END;
$$;

REVOKE ALL ON FUNCTION merl.classify_indicator_activity(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merl.classify_indicator_activity(text,text,text,text,text)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.public_portal_indicator_categories (
  project_id uuid NOT NULL,
  category_key text NOT NULL CHECK (category_key IN (
    'ecosystems','livelihoods','climate-risk','infrastructure','governance',
    'capacity','finance','learning-delivery','beneficiaries','other'
  )),
  indicator_count integer NOT NULL CHECK (indicator_count > 0),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, category_key)
);

COMMENT ON TABLE public.public_portal_indicator_categories IS
  'Public aggregate only: project indicator counts grouped into reviewed activity areas. No indicator text, targets, progress, or evidence is exposed.';

ALTER TABLE public.public_portal_indicator_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_portal_indicator_categories_read
  ON public.public_portal_indicator_categories;
CREATE POLICY public_portal_indicator_categories_read
  ON public.public_portal_indicator_categories
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.public_portal_indicator_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_portal_indicator_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.public_portal_indicator_categories TO service_role;

CREATE OR REPLACE FUNCTION merl.refresh_public_indicator_categories() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
BEGIN
  TRUNCATE public.public_portal_indicator_categories;

  INSERT INTO public.public_portal_indicator_categories(
    project_id, category_key, indicator_count, published_at
  )
  SELECT i.project_id,
    merl.classify_indicator_activity(
      p.code::text,
      i.code::text,
      i.name::text,
      n.node_code,
      n.title
    ) AS category_key,
    count(*)::integer,
    now()
  FROM merl.project_indicators i
  JOIN merl.projects p ON p.id=i.project_id
  LEFT JOIN merl.framework_nodes n ON n.id=i.framework_node_id
  WHERE coalesce(p.code::text,'') <> 'AUDIT-2026'
    AND nullif(btrim(i.name::text),'') IS NOT NULL
  GROUP BY i.project_id,
    merl.classify_indicator_activity(
      p.code::text,
      i.code::text,
      i.name::text,
      n.node_code,
      n.title
    );
END;
$$;

REVOKE ALL ON FUNCTION merl.refresh_public_indicator_categories()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merl.refresh_public_indicator_categories()
  TO service_role;

CREATE OR REPLACE FUNCTION merl.trg_refresh_public_indicator_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
BEGIN
  PERFORM merl.refresh_public_indicator_categories();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION merl.trg_refresh_public_indicator_categories()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['projects','project_indicators','framework_nodes'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS refresh_public_indicator_categories_snapshot ON merl.%I',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER refresh_public_indicator_categories_snapshot '
      'AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON merl.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION merl.trg_refresh_public_indicator_categories()',
      tbl
    );
  END LOOP;
END $$;

-- Repair the previously documented VCAP2 coverage record. Migration 0070
-- matched an older acronym/name, so production never received these rows.
INSERT INTO merl.ref_area_councils(province_code,name)
VALUES ('SANMA','Big Bay Inland'),('SANMA','Big Bay Coast')
ON CONFLICT (province_code,name) DO NOTHING;

INSERT INTO merl.project_area_councils(
  project_id,area_council_id,province_code,area_council_name,
  coverage_status,feasibility_note
)
SELECT p.id,ac.id,'SANMA',ac.name,'active','VCAP2 project site in Big Bay Inland.'
FROM merl.projects p
JOIN merl.ref_area_councils ac
  ON ac.province_code='SANMA' AND lower(ac.name)=lower('Big Bay Inland')
WHERE p.code='23A398'
  AND NOT EXISTS (
    SELECT 1 FROM merl.project_area_councils existing
    WHERE existing.project_id=p.id
      AND lower(existing.area_council_name)=lower('Big Bay Inland')
  );

INSERT INTO merl.project_area_councils(
  project_id,area_council_id,province_code,area_council_name,
  coverage_status,feasibility_status,feasibility_note
)
SELECT p.id,ac.id,'SANMA',ac.name,'not_covered','not_assessed',
  'Not a VCAP2 project site. VCAP2 is reviewing the Vatthe Community Conservation Area management plan in Big Bay Coast.'
FROM merl.projects p
JOIN merl.ref_area_councils ac
  ON ac.province_code='SANMA' AND lower(ac.name)=lower('Big Bay Coast')
WHERE p.code='23A398'
  AND NOT EXISTS (
    SELECT 1 FROM merl.project_area_councils existing
    WHERE existing.project_id=p.id
      AND lower(existing.area_council_name)=lower('Big Bay Coast')
  );

SELECT merl.refresh_public_indicator_categories();
SELECT merl.refresh_public_portal();
