-- Enrich DoCC MERL project profiles from Department project records and
-- project documents received by the DoCC M&E team via email.
--
-- Amount policy:
--   * Keep the amount in the currency stated by the source document.
--   * Do not convert USD to VUV inside the project register.
--   * A zero in the March 2026 portfolio workbook is treated as "not recorded",
--     not as a verified zero project budget.
--   * Activity/workplan allocations are not promoted to the approved project
--     budget unless the source explicitly identifies them as the project total.

SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- The public snapshot previously omitted project currency, which caused every
-- published project amount to be rendered as VUV. A BEFORE INSERT trigger keeps
-- the currency in sync whenever refresh_public_portal() rebuilds the snapshot.
ALTER TABLE public.public_portal_projects
  ADD COLUMN IF NOT EXISTS currency text;

CREATE OR REPLACE FUNCTION merl.trg_public_portal_project_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
  SELECT COALESCE(NULLIF(btrim(p.currency), ''), 'VUV')
    INTO NEW.currency
  FROM merl.projects p
  WHERE p.id = NEW.id;

  NEW.currency := COALESCE(NEW.currency, 'VUV');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_portal_project_currency
  ON public.public_portal_projects;
CREATE TRIGGER public_portal_project_currency
BEFORE INSERT OR UPDATE OF id
ON public.public_portal_projects
FOR EACH ROW
EXECUTE FUNCTION merl.trg_public_portal_project_currency();

-- VCCRP ----------------------------------------------------------------------
-- DoCC current-project portfolio (compiled March 2026): USD 25,000,000;
-- Project Lead / AE: Louise Nassak / Save the Children.
-- The GCF funding proposal separately records USD 32,650,440 total financing
-- and USD 26,182,878 GCF funding requested. Those figures are retained below as
-- provenance rather than substituted for the Department's portfolio budget.
UPDATE merl.projects
SET currency = 'USD',
    budget_vuv = 25000000,
    project_manager = 'Louise Nassak',
    donor = COALESCE(NULLIF(donor, ''), 'Green Climate Fund (GCF)'),
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'profile_budget_usd', 25000000,
      'project_lead_ae', 'Louise Nassak / Save the Children',
      'funding_proposal_source', 'VCCRP_Funding-proposal.pdf, v7, 31 March 2022',
      'gcf_total_financing_usd', 32650440,
      'gcf_funding_requested_usd', 26182878,
      'direct_beneficiaries', 90157,
      'indirect_beneficiaries', 110000,
      'implementation_period', '6 years'
    ),
    est_direct_beneficiaries = COALESCE(est_direct_beneficiaries, 90157),
    est_indirect_beneficiaries = COALESCE(est_indirect_beneficiaries, 110000),
    updated_at = now()
WHERE code = 'VCCRP-001'
   OR acronym = 'VCCRP'
   OR name ILIKE '%Community-based Climate%Resilience%'
   OR name ILIKE '%Community Climate Resilience%';

-- VCAP II --------------------------------------------------------------------
-- DoCC current-project portfolio and FY2026 GEF PIR agree on the USD
-- 12,544,037 GEF grant. The PIR identifies Jackson Tambe Vire as Project
-- Manager. Do not use a converted VUV approximation as the stored source amount.
UPDATE merl.projects
SET currency = 'USD',
    budget_vuv = 12544037,
    project_manager = 'Jackson Tambe Vire',
    donor = 'Global Environment Facility (GEF) and Least Developed Countries Fund (LDCF)',
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'project_profile_source', '2026 GEF Project Implementation Report (PIR)',
      'gef_grant_usd', 12544037,
      'cofinancing_usd', 50858080,
      'ppg_usd', 300000,
      'project_manager', 'Jackson Tambe Vire'
    ),
    updated_at = now()
WHERE code IN ('23A398', 'VCAP2-001')
   OR acronym IN ('VCAP2', 'VCAP II')
   OR name ILIKE '%Coastal Adaptation Project%Phase 2%'
   OR name ILIKE '%Coastal Adaptation Project II%';

-- STRENGTH -------------------------------------------------------------------
UPDATE merl.projects
SET currency = 'USD',
    budget_vuv = 127680,
    project_manager = 'Brian Maltera',
    donor = COALESCE(NULLIF(donor, ''), 'United Kingdom'),
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'profile_budget_usd', 127680,
      'project_lead_ae', 'Brian Maltera / ICCCAD'
    ),
    updated_at = now()
WHERE name ILIKE '%STRENGTH%Loss%Damage%'
   OR acronym = 'STRENGTH';

-- CBIT / FAO -----------------------------------------------------------------
UPDATE merl.projects
SET currency = 'USD',
    budget_vuv = 1137215,
    project_manager = 'Stephanie Stephens',
    donor = 'GEF / FAO',
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'profile_budget_usd', 1137215,
      'project_lead_ae', 'Stephanie Stephens / FAO'
    ),
    updated_at = now()
WHERE name ILIKE '%Capacity-building Initiative for Transparency%'
   OR acronym = 'CBIT';

-- Loss and Damage ------------------------------------------------------------
-- Project-specific MEAL plan supersedes the zero placeholder in the portfolio
-- workbook and gives the exact project value and dates.
UPDATE merl.projects
SET currency = 'VUV',
    budget_vuv = 289393720.16,
    project_manager = 'Willy Missack',
    donor = 'New Zealand Ministry of Foreign Affairs and Trade (MFAT)',
    lead_agency = COALESCE(NULLIF(lead_agency, ''), 'Ministry of Climate Change'),
    executing_agency = COALESCE(NULLIF(executing_agency, ''), 'Ministry of Climate Change'),
    start_date = DATE '2025-06-01',
    end_date = DATE '2027-12-31',
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'project_document', 'Loss and Damage MEAL Plan 130426.docx',
      'project_code', '24B298',
      'value_vuv', 289393720.16,
      'project_lead', 'Willy Missack',
      'donor', 'MFAT',
      'start', 'June 2025',
      'closing', 'December 2027'
    ),
    updated_at = now()
WHERE code = '24B298'
   OR name ILIKE '%Loss and Damage%Project%'
   OR name ILIKE '%Loss and Damage Fund Development%';

-- Project-manager / lead information where the Department portfolio identifies
-- a named person. Budgets shown as zero in that workbook are deliberately left
-- unmodified until a project document provides the approved total.
UPDATE merl.projects
SET project_manager = 'William Bani',
    donor = COALESCE(NULLIF(donor, ''), 'SPC'),
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'project_lead_ae', 'William Bani / SPC',
      'budget_status', 'Portfolio workbook contained 0; approved total not verified'
    ),
    updated_at = now()
WHERE name ILIKE '%PEBACCC%'
   OR acronym ILIKE 'PEBAC%';

UPDATE merl.projects
SET project_manager = 'Johnnie Tari',
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'profile_source', 'DoCC projects.xlsx (compiled March 2026)',
      'project_lead_ae', 'Johnnie Tari / SPC',
      'national_workplan_source', 'PARTenR II+ 2026 Workplan.xlsx',
      'national_itemised_budget_vuv', 13350000,
      'budget_note', 'VUV 13,350,000 is the sum of itemised Vanuatu national workplan estimates, including separately supported items; it is not promoted to approved total project budget'
    ),
    updated_at = now()
WHERE code IN ('23B398', 'PARTNER-2-PLUS-VU')
   OR name ILIKE '%PARTneR%';

UPDATE merl.projects
SET project_manager = 'Zechariah Bani',
    source_profile = COALESCE(source_profile, '{}'::jsonb) || jsonb_build_object(
      'project_document', 'Detailed WP_Final_Deliverable #1_output B.pdf',
      'project_role', 'National Project Coordinator',
      'project_manager', 'Zechariah Bani',
      'budget_status', 'Approved total not identified in supplied workplan'
    ),
    updated_at = now()
WHERE code = 'ICAT-VU-II'
   OR name ILIKE '%Initiative for Climate Action Transparency%'
   OR name ILIKE '%ICAT Vanuatu%';

-- Refresh once so existing rows immediately carry the corrected budget,
-- manager and currency values; the trigger above preserves currency thereafter.
SELECT merl.refresh_public_portal();

-- Sanity guard: never leave a positive recorded budget without an explicit
-- currency after this enrichment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM merl.projects
    WHERE COALESCE(budget_vuv, 0) > 0
      AND NULLIF(btrim(currency), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Positive project budget exists without currency';
  END IF;
END
$$;
