-- Canonicalise legacy Area Council labels used by saved project coverage/location
-- records so they match the official 71-council map/reference list.
-- Non-conflicting rows are updated in place. If a project already has the official
-- target row, the legacy duplicate is left untouched to avoid destructive merges;
-- the frontend compatibility layer still maps it to the correct polygon.

CREATE TEMP TABLE area_council_name_map(old_name text PRIMARY KEY, new_name text, province_code text) ON COMMIT DROP;
INSERT INTO area_council_name_map(old_name,new_name,province_code) VALUES
('Vanua Lava','East Vanualava','TORBA'),
('West Vanua Lava','West Vanualava','TORBA'),
('Merelava/Merig','Merelava-Merig','TORBA'),
('North West Santo','Northwest Santo','SANMA'),
('South East Santo','Southeast Santo','SANMA'),
('South Santo 1','South Santo One (1)','SANMA'),
('South Santo 2','South Santo Two (2)','SANMA'),
('Central Pentecost 1','Central Pentecost One (CP1)','PENAMA'),
('Central Pentecost 2','Central Pentecost Two (CP2)','PENAMA'),
('North East Malekula','Northeast Malekula','MALAMPA'),
('North West Malekula','Northwest Malekula','MALAMPA'),
('South East Malekula','Southeast Malekula','MALAMPA'),
('South West Malekula','Southwest Malekula','MALAMPA'),
('South East Ambrym','Southeast Ambrym','MALAMPA'),
('North West Efate','Northwest Efate','SHEFA'),
('Nguna/Pele','Nguna-Pele','SHEFA'),
('Makira/Mataso','Makira-Mataso','SHEFA'),
('Tongariki/Buninga','Tongariki-Buninga','SHEFA'),
('South East Tanna','Southeast Tanna','TAFEA'),
('South West Tanna','Southwest Tanna','TAFEA');

UPDATE merl.project_area_councils pac
SET area_council_name = m.new_name,
    province_code = m.province_code,
    area_council_id = ref.id,
    updated_at = now()
FROM area_council_name_map m
JOIN merl.ref_area_councils ref
  ON ref.province_code=m.province_code AND ref.name=m.new_name
WHERE lower(pac.area_council_name)=lower(m.old_name)
  AND NOT EXISTS (
    SELECT 1 FROM merl.project_area_councils existing
    WHERE existing.project_id=pac.project_id
      AND lower(existing.area_council_name)=lower(m.new_name)
      AND existing.id<>pac.id
  );

UPDATE merl.project_locations loc
SET area_council = m.new_name,
    province = m.province_code,
    updated_at = now()
FROM area_council_name_map m
WHERE lower(loc.area_council)=lower(m.old_name);

-- Keep the profile-level area_councils array aligned where present.
UPDATE merl.projects p
SET area_councils = (
  SELECT array_agg(DISTINCT COALESCE(m.new_name, x) ORDER BY COALESCE(m.new_name, x))
  FROM unnest(COALESCE(p.area_councils,'{}'::text[])) x
  LEFT JOIN area_council_name_map m ON lower(x)=lower(m.old_name)
),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM unnest(COALESCE(p.area_councils,'{}'::text[])) x
  JOIN area_council_name_map m ON lower(x)=lower(m.old_name)
);

-- Rebuild the public snapshot so corrected project-to-area joins are visible.
DO $$
BEGIN
  IF to_regprocedure('merl.refresh_public_portal()') IS NOT NULL THEN
    PERFORM merl.refresh_public_portal();
  END IF;
END $$;
