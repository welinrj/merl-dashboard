-- Enrich the DoCC public-project catalogue from the corresponding official
-- project profiles at https://docc.gov.vu/index.php/projects/view-projects.
-- Values that the profiles do not provide (notably most project managers,
-- locations and VUV budgets) deliberately remain unrecorded.

-- The project table's application guard also protects direct SQL updates.
-- Scope this trusted migration transaction as service_role; the setting is
-- transaction-local and is discarded when the migration completes.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*) INTO matched
  FROM merl.projects
  WHERE code IN (
    '23A398', '23B398', 'DOCC-SRC-PACRES2', 'DOCC-SRC-RENEWABLE-NEW',
    'DOCC-WEB-FCPF', 'DOCC-WEB-IRCCNH', 'DOCC-WEB-NDC', 'DOCC-WEB-REDD',
    'DOCC-WEB-REDD-READINESS', 'DOCC-WEB-TNA', 'DOCC-WEB-VREP'
  );

  IF matched <> 11 THEN
    RAISE EXCEPTION 'Expected 11 DoCC public projects, found %', matched;
  END IF;
END $$;

UPDATE merl.projects
SET name = 'Vanuatu Coastal Adaptation Project (VCAP2)',
    acronym = 'VCAP2',
    description = 'VCAP2 strengthens government capacity to deliver services at project sites across Vanuatu. It supports terrestrial and marine protected areas, community resource management, action on land degradation and integrated ridge-to-reef approaches.',
    donor = 'Global Environment Facility (GEF) and Least Developed Countries Fund (LDCF)',
    budget_vuv = 1500000000,
    expected_primary_outcome = 'More resilient communities and ecosystems through biodiversity protection and ridge-to-reef management',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/vcap2.webp'
WHERE code = '23A398';

UPDATE merl.projects
SET name = 'Pacific Risk Tool for Resilience, Phase 2 (PARTneR-2)',
    acronym = 'PARTneR-2',
    description = 'PARTneR-2 works across six Pacific Island countries to co-develop national risk models and assessment tools, strengthen technical ministries and make climate-risk information actionable for government decisions.',
    donor = 'New Zealand Ministry of Foreign Affairs and Trade (MFAT)',
    executing_agency = 'Pacific Community (SPC) and NIWA',
    expected_primary_outcome = 'Government agencies can use national climate-risk information for resilient development decisions',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/partner-2.webp'
WHERE code = '23B398';

UPDATE merl.projects
SET name = 'Pacific Adaptation to Climate Change and Resilience Building (PACRES)',
    acronym = 'PACRES',
    description = 'Vanuatu''s PACRES project restores the Tagabe River watershed and key urban and peri-urban areas of Port Vila. The wider EU-funded regional programme scales up ecosystem-based adaptation and is implemented jointly by SPREP, PIFS, SPC and USP.',
    lead_agency = 'Department of Climate Change',
    executing_agency = 'SPREP, PIFS, SPC and USP with Vanuatu sector agencies',
    provinces = ARRAY['SHEFA']::text[],
    expected_primary_outcome = 'Tagabe River watershed and key Port Vila areas restored through ecosystem-based adaptation',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/pacres.webp'
WHERE code = 'DOCC-SRC-PACRES2';

UPDATE merl.projects
SET name = 'Renewable Energy & Energy Efficiency',
    description = 'Vanuatu''s National Energy Road Map 2013-2020, implemented by the Department of Energy, promotes renewable and geothermal energy, energy efficiency and conservation while reducing reliance on imported diesel and petroleum products.',
    donor = NULL,
    lead_agency = 'Department of Energy',
    executing_agency = 'Department of Energy',
    start_date = DATE '2013-03-01',
    end_date = DATE '2020-12-31',
    status = 'completed',
    expected_primary_outcome = 'Greater renewable-energy use and efficiency, with reduced reliance on imported fossil fuels',
    docc_url = 'https://docc.gov.vu/index.php/projects/view-projects/13-renewable-energy-energy-efficiency',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/renewable-energy.webp'
WHERE code = 'DOCC-SRC-RENEWABLE-NEW';

UPDATE merl.projects
SET description = 'The FCPF readiness process developed Vanuatu''s approach to REDD+, including institutional arrangements, stakeholder participation, reference levels, a national forest-monitoring system, safeguards information, budget and monitoring framework.',
    donor = 'Forest Carbon Partnership Facility (FCPF), World Bank',
    executing_agency = 'Department of Forestry',
    start_date = DATE '2014-01-01',
    end_date = DATE '2018-10-31',
    status = 'completed',
    expected_primary_outcome = 'A national REDD+ readiness system with forest monitoring, reference levels and safeguards information',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/fcpf.webp'
WHERE code = 'DOCC-WEB-FCPF';

UPDATE merl.projects
SET description = 'IRCCNH increased community resilience to climate variability, climate change and geological hazards affecting food security, water security and livelihoods. It combined institutional strengthening, climate-resilient agriculture, rainwater systems and pilot community risk-management activities.',
    expected_primary_outcome = 'Stronger institutions, resilient agriculture, safer water supplies and community disaster-risk capacity',
    docc_url = 'https://docc.gov.vu/index.php/projects/view-projects/11-increasing-resilience-to-climate-change-and-natural-haz',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/irccnh.webp'
WHERE code = 'DOCC-WEB-IRCCNH';

UPDATE merl.projects
SET description = 'Vanuatu''s revised and enhanced NDC sets the country''s pathway toward deep decarbonisation and a circular economy while strengthening adaptation and addressing loss and damage. It contains 20 mitigation, 116 adaptation and 12 loss-and-damage commitments.',
    start_date = DATE '2021-01-01',
    end_date = DATE '2030-12-31',
    expected_primary_outcome = 'Vanuatu advances its mitigation, adaptation and loss-and-damage commitments through 2030',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/ndc.webp'
WHERE code = 'DOCC-WEB-NDC';

UPDATE merl.projects
SET description = 'The Vanuatu REDD+ programme supports sustainable forest management and improved livelihoods, particularly for rural communities that depend on forests. It was initiated in 2010 with World Bank Forest Carbon Partnership Facility support.',
    donor = 'World Bank Forest Carbon Partnership Facility (FCPF)',
    lead_agency = 'Department of Climate Change',
    executing_agency = 'Department of Forestry',
    start_date = DATE '2010-01-01',
    expected_primary_outcome = 'Sustainably managed forests that support rural livelihoods and contribute to climate action',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/redd-plus.webp'
WHERE code = 'DOCC-WEB-REDD';

UPDATE merl.projects
SET description = 'Vanuatu''s REDD+ Readiness work strengthens national capacity to design a socially and environmentally inclusive strategy for reducing forest emissions while supporting conservation, sustainable forest management and enhanced forest carbon stocks.',
    lead_agency = 'Department of Climate Change',
    executing_agency = 'Department of Forestry',
    expected_primary_outcome = 'An inclusive national REDD+ strategy supporting conservation and sustainable forest management',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/redd-readiness.webp'
WHERE code = 'DOCC-WEB-REDD-READINESS';

UPDATE merl.projects
SET description = 'Vanuatu''s country-driven Technology Needs Assessment identifies and prioritises mitigation and adaptation technologies, analyses barriers to deployment and translates the priorities into measures and project ideas through a Technology Action Plan.',
    expected_primary_outcome = 'Priority climate technologies, barriers and enabling measures documented in a Technology Action Plan',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/tna.webp'
WHERE code = 'DOCC-WEB-TNA';

UPDATE merl.projects
SET description = 'VREP I expanded basic lighting and phone charging through subsidised plug-and-play solar systems. VREP II supports larger solar-home systems, micro-grids and mini-grids, stronger institutions and private-sector delivery of decentralised electricity services.',
    lead_agency = 'Department of Energy',
    executing_agency = 'Department of Energy',
    expected_primary_outcome = 'More rural households, aid posts and community halls have access to off-grid electricity services',
    docc_image_url = 'https://welinrj.github.io/merl-dashboard/project-images/vrep.webp'
WHERE code = 'DOCC-WEB-VREP';

SELECT merl.refresh_public_portal();
