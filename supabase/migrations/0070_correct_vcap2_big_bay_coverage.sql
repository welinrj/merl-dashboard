-- Keep Big Bay Inland and Big Bay Coast distinct for VCAP2 reporting.
-- Inland is an active VCAP2 site; Coast is not a project site, although VCAP2
-- is reviewing the Vatthe Community Conservation Area management plan there.

INSERT INTO merl.ref_area_councils (province_code, name)
SELECT 'SANMA', 'Big Bay Inland'
WHERE NOT EXISTS (
  SELECT 1 FROM merl.ref_area_councils
  WHERE province_code = 'SANMA' AND lower(name) = lower('Big Bay Inland')
);

UPDATE merl.project_area_councils c
SET area_council_id = inland.id,
    area_council_name = inland.name,
    province_code = 'SANMA',
    coverage_status = 'active'
FROM merl.projects p,
     merl.ref_area_councils inland
WHERE c.project_id = p.id
  AND (p.acronym = 'VCAP2' OR p.name ILIKE '%VCAP2%')
  AND lower(c.area_council_name) = lower('Big Bay Inland')
  AND inland.province_code = 'SANMA'
  AND lower(inland.name) = lower('Big Bay Inland');

INSERT INTO merl.project_area_councils (
  project_id, area_council_id, province_code, area_council_name,
  coverage_status, feasibility_note
)
SELECT p.id, inland.id, 'SANMA', inland.name, 'active',
       'VCAP2 project site in Big Bay Inland.'
FROM merl.projects p
JOIN merl.ref_area_councils inland
  ON inland.province_code = 'SANMA'
 AND lower(inland.name) = lower('Big Bay Inland')
WHERE (p.acronym = 'VCAP2' OR p.name ILIKE '%VCAP2%')
  AND NOT EXISTS (
    SELECT 1 FROM merl.project_area_councils c
    WHERE c.project_id = p.id
      AND lower(c.area_council_name) = lower('Big Bay Inland')
  );

UPDATE merl.project_area_councils c
SET area_council_id = coast.id,
    area_council_name = coast.name,
    province_code = 'SANMA',
    coverage_status = 'not_covered',
    feasibility_status = 'not_assessed',
    verified_by = NULL,
    verified_at = NULL,
    feasibility_note = 'Not a VCAP2 project site. VCAP2 is reviewing the Vatthe Community Conservation Area management plan in Big Bay Coast.'
FROM merl.projects p,
     merl.ref_area_councils coast
WHERE c.project_id = p.id
  AND (p.acronym = 'VCAP2' OR p.name ILIKE '%VCAP2%')
  AND lower(c.area_council_name) = lower('Big Bay Coast')
  AND coast.province_code = 'SANMA'
  AND lower(coast.name) = lower('Big Bay Coast');

INSERT INTO merl.project_area_councils (
  project_id, area_council_id, province_code, area_council_name,
  coverage_status, feasibility_status, feasibility_note
)
SELECT p.id, coast.id, 'SANMA', coast.name, 'not_covered', 'not_assessed',
       'Not a VCAP2 project site. VCAP2 is reviewing the Vatthe Community Conservation Area management plan in Big Bay Coast.'
FROM merl.projects p
JOIN merl.ref_area_councils coast
  ON coast.province_code = 'SANMA'
 AND lower(coast.name) = lower('Big Bay Coast')
WHERE (p.acronym = 'VCAP2' OR p.name ILIKE '%VCAP2%')
  AND NOT EXISTS (
    SELECT 1 FROM merl.project_area_councils c
    WHERE c.project_id = p.id
      AND lower(c.area_council_name) = lower('Big Bay Coast')
  );
