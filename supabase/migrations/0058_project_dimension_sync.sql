BEGIN;

CREATE OR REPLACE FUNCTION merl.ensure_organization(p_name text, p_type text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name)='' THEN RETURN NULL; END IF;
  INSERT INTO merl.organizations(name,organization_type)
  VALUES (btrim(p_name),p_type)
  ON CONFLICT (name) DO UPDATE
    SET organization_type=COALESCE(EXCLUDED.organization_type,merl.organizations.organization_type),
        active=true,updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION merl.sync_project_dimensions(
  p_project_id uuid,p_donor text,p_implementing_partners text[],
  p_lead_agency text,p_executing_agency text,p_area_councils text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_org uuid; v_name text; v_ac merl.ref_area_councils%ROWTYPE;
BEGIN
  DELETE FROM merl.project_organizations
  WHERE project_id=p_project_id
    AND role IN ('donor','implementing_partner','lead_agency','executing_entity');

  IF p_donor IS NOT NULL AND btrim(p_donor)<>'' THEN
    v_org := merl.ensure_organization(p_donor,'donor');
    INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
    VALUES(p_project_id,v_org,'donor',true)
    ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
  END IF;

  IF p_lead_agency IS NOT NULL AND btrim(p_lead_agency)<>'' THEN
    v_org := merl.ensure_organization(p_lead_agency,'government');
    INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
    VALUES(p_project_id,v_org,'lead_agency',true)
    ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
  END IF;

  IF p_executing_agency IS NOT NULL AND btrim(p_executing_agency)<>'' THEN
    v_org := merl.ensure_organization(p_executing_agency,'executing_entity');
    INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
    VALUES(p_project_id,v_org,'executing_entity',true)
    ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=true;
  END IF;

  FOREACH v_name IN ARRAY COALESCE(p_implementing_partners,'{}'::text[])
  LOOP
    IF btrim(v_name)<>'' THEN
      v_org := merl.ensure_organization(v_name,'partner');
      INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
      VALUES(p_project_id,v_org,'implementing_partner',false)
      ON CONFLICT (project_id,organization_id,role) DO NOTHING;
    END IF;
  END LOOP;

  DELETE FROM merl.project_area_councils WHERE project_id=p_project_id;
  FOREACH v_name IN ARRAY COALESCE(p_area_councils,'{}'::text[])
  LOOP
    SELECT * INTO v_ac FROM merl.ref_area_councils
    WHERE lower(name)=lower(btrim(v_name)) ORDER BY id LIMIT 1;

    IF FOUND THEN
      INSERT INTO merl.project_area_councils(
        project_id,area_council_id,province_code,area_council_name,coverage_status,feasibility_status
      )
      VALUES(p_project_id,v_ac.id,v_ac.province_code,v_ac.name,'active','not_assessed')
      ON CONFLICT (project_id,area_council_name) DO NOTHING;
    ELSE
      RAISE EXCEPTION 'Unknown Area Council: %',v_name;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_project(
  p_id uuid,p_name text,p_acronym text DEFAULT NULL,p_description text DEFAULT NULL,
  p_status text DEFAULT 'pipeline',p_category text DEFAULT NULL,p_lead_agency text DEFAULT NULL,
  p_executing_agency text DEFAULT NULL,p_implementing_partners text[] DEFAULT '{}'::text[],
  p_donor text DEFAULT NULL,p_funding_window text DEFAULT NULL,p_currency text DEFAULT 'VUV',
  p_budget_vuv numeric DEFAULT NULL,p_start_date date DEFAULT NULL,p_end_date date DEFAULT NULL,
  p_approval_date date DEFAULT NULL,p_project_type text DEFAULT NULL,p_primary_climate_theme text DEFAULT NULL,
  p_coverage_type text DEFAULT NULL,p_provinces text[] DEFAULT '{}'::text[],p_islands text[] DEFAULT '{}'::text[],
  p_area_councils text[] DEFAULT '{}'::text[],p_communities text[] DEFAULT '{}'::text[],
  p_project_manager_id uuid DEFAULT NULL,p_me_officer_id uuid DEFAULT NULL,p_finance_officer_id uuid DEFAULT NULL,
  p_est_direct_beneficiaries integer DEFAULT NULL,p_est_indirect_beneficiaries integer DEFAULT NULL,
  p_expected_primary_outcome text DEFAULT NULL,p_project_manager text DEFAULT NULL,
  p_me_officer text DEFAULT NULL,p_finance_officer text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_id uuid; v_code text;
BEGIN
  PERFORM merl.require_editor();
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Project title is required'; END IF;
  IF p_end_date IS NOT NULL AND p_start_date IS NOT NULL AND p_end_date<p_start_date THEN
    RAISE EXCEPTION 'End date cannot be earlier than start date';
  END IF;

  IF p_id IS NULL THEN
    v_code:=merl.next_project_code();
    INSERT INTO merl.projects(
      code,name,acronym,description,status,category,lead_agency,executing_agency,
      implementing_partners,donor,funding_window,currency,budget_vuv,start_date,end_date,
      approval_date,project_type,primary_climate_theme,coverage_type,provinces,islands,
      area_councils,communities,project_manager_id,me_officer_id,finance_officer_id,
      est_direct_beneficiaries,est_indirect_beneficiaries,expected_primary_outcome,
      project_manager,me_officer,finance_officer,registration_status
    ) VALUES (
      v_code,btrim(p_name),p_acronym,p_description,coalesce(p_status,'pipeline'),
      coalesce(p_category,'CC-ADAPT'),p_lead_agency,p_executing_agency,
      coalesce(p_implementing_partners,'{}'),p_donor,p_funding_window,coalesce(p_currency,'VUV'),
      coalesce(p_budget_vuv,0),p_start_date,p_end_date,p_approval_date,p_project_type,
      p_primary_climate_theme,p_coverage_type,coalesce(p_provinces,'{}'),coalesce(p_islands,'{}'),
      coalesce(p_area_councils,'{}'),coalesce(p_communities,'{}'),p_project_manager_id,p_me_officer_id,
      p_finance_officer_id,p_est_direct_beneficiaries,p_est_indirect_beneficiaries,p_expected_primary_outcome,
      nullif(btrim(p_project_manager),''),nullif(btrim(p_me_officer),''),
      nullif(btrim(p_finance_officer),''),'draft'
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE merl.projects SET
      name=btrim(p_name),acronym=p_acronym,description=p_description,status=coalesce(p_status,status),
      category=coalesce(p_category,category),lead_agency=p_lead_agency,executing_agency=p_executing_agency,
      implementing_partners=coalesce(p_implementing_partners,'{}'),donor=p_donor,
      funding_window=p_funding_window,currency=coalesce(p_currency,'VUV'),
      budget_vuv=coalesce(p_budget_vuv,budget_vuv),start_date=p_start_date,end_date=p_end_date,
      approval_date=p_approval_date,project_type=p_project_type,primary_climate_theme=p_primary_climate_theme,
      coverage_type=p_coverage_type,provinces=coalesce(p_provinces,'{}'),islands=coalesce(p_islands,'{}'),
      area_councils=coalesce(p_area_councils,'{}'),communities=coalesce(p_communities,'{}'),
      project_manager_id=p_project_manager_id,me_officer_id=p_me_officer_id,finance_officer_id=p_finance_officer_id,
      est_direct_beneficiaries=p_est_direct_beneficiaries,est_indirect_beneficiaries=p_est_indirect_beneficiaries,
      expected_primary_outcome=p_expected_primary_outcome,
      project_manager=nullif(btrim(p_project_manager),''),me_officer=nullif(btrim(p_me_officer),''),
      finance_officer=nullif(btrim(p_finance_officer),''),updated_at=now()
    WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  END IF;

  PERFORM merl.sync_project_dimensions(
    v_id,p_donor,p_implementing_partners,p_lead_agency,p_executing_agency,p_area_councils
  );
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_project(
  uuid,text,text,text,text,text,text,text,text[],text,text,text,numeric,date,date,date,text,text,text,text[],text[],text[],text[],uuid,uuid,uuid,integer,integer,text,text,text,text
) TO authenticated;

COMMIT;
