BEGIN;

DO $$
DECLARE p record; v_org uuid; v_name text;
BEGIN
  FOR p IN
    SELECT id,donor,lead_agency,executing_agency,implementing_partners FROM merl.projects
  LOOP
    IF p.donor IS NOT NULL AND btrim(p.donor)<>'' THEN
      v_org:=merl.ensure_organization(p.donor,'donor');
      INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
      VALUES(p.id,v_org,'donor',true)
      ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
    END IF;
    IF p.lead_agency IS NOT NULL AND btrim(p.lead_agency)<>'' THEN
      v_org:=merl.ensure_organization(p.lead_agency,'government');
      INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
      VALUES(p.id,v_org,'lead_agency',true)
      ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
    END IF;
    IF p.executing_agency IS NOT NULL AND btrim(p.executing_agency)<>'' THEN
      v_org:=merl.ensure_organization(p.executing_agency,'executing_entity');
      INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
      VALUES(p.id,v_org,'executing_entity',true)
      ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
    END IF;
    FOREACH v_name IN ARRAY coalesce(p.implementing_partners,'{}'::text[])
    LOOP
      IF btrim(v_name)<>'' THEN
        v_org:=merl.ensure_organization(v_name,'partner');
        INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
        VALUES(p.id,v_org,'implementing_partner',false)
        ON CONFLICT (project_id,organization_id,role) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO merl.project_area_councils(
  project_id,area_council_id,province_code,area_council_name,coverage_status,feasibility_status
)
SELECT DISTINCT
  p.id,ac.id,ac.province_code,ac.name,'active','not_assessed'
FROM merl.projects p
CROSS JOIN LATERAL unnest(coalesce(p.area_councils,'{}'::text[])) x(name)
JOIN merl.ref_area_councils ac ON lower(ac.name)=lower(btrim(x.name))
ON CONFLICT (project_id,area_council_name) DO NOTHING;

COMMIT;
