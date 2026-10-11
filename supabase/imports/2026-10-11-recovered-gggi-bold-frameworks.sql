-- Recover source-backed GGGI support outputs and the initial BOLD workplan.
-- Source: Hendricks Tabi, 30 September 2026; no actuals, expenditure or beneficiaries.
-- Idempotent administrative data import, no schema or permission changes.
BEGIN;
DO $import$
DECLARE p jsonb; n jsonb; i jsonb; a jsonb; pid uuid; nid uuid; iid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Authorized database administrator required';
 END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 FOR p IN SELECT value FROM jsonb_array_elements($data$[{"code": "GGGI-SUPPORT-VU", "name": "GGGI – Ministry and Department Green Growth Support", "acronym": "GGGI Support", "status": "active", "category": "CC-MITIG", "theme": "Climate Finance", "agency": "Global Green Growth Institute (GGGI)", "partners": ["Department of Climate Change"], "description": "GGGI support to the Ministry and Department for climate finance, green investment, green growth policies and project development. Imported from the support outputs supplied by Rebecca through Hendricks on 30 September 2026. This is a partial support framework; no numeric targets or project budget were supplied.", "profile": {"sender": "Hendricks Tabi", "email_subject": "Logframe for GGGI and BOLD project", "received_date_local": "2026-09-30", "imported_at": "2026-10-11", "kind": "partial framework / workplan", "no_actuals_imported": true, "budget_status": "not supplied", "user_authorized_addition": true, "document": "GGGI Logframe.xlsx", "sha256": "44ab127da1165a7356bfa491672c441b4fb70f8a8c06d99072dd1ebbc8805485", "scope_note": "GGGI outputs supporting the ministry and department; not a separate NAP project or a full approved national project design.", "numeric_targets_status": "not supplied; F5:F7 contain target year 2027", "contact": "Rebecca Bogiri"}, "nodes": [{"code": "GGGI-OUTPUTS", "title": "old_IO1. Accelerated access and secured climate finance/green investments for members from both public and private sectors., old_IO2. GGGI members have strengthened policy, planning, regulatory, financing and institutional frameworks to achieve green growth outcomes.", "description": "Combined output cell C5:C7 as supplied. Old IO1/IO2 identifiers retained from source. No new objective inferred.", "order": 10}], "indicators": [{"code": "GGGI-IO1.1", "node": "GGGI-OUTPUTS", "name": "old_IO1.1 Total USD value of climate finance/green growth investment commitments secured with GGGI’s support, disaggregated by public and private sector financing and between Infrastructure Finance and Sustainable Finance.", "baseline": 0, "target": null, "unit": "USD", "target_text": "Target year: 2027. Numeric target not supplied.", "source": "GGGI Logframe.xlsx, Sheet1 D5:F5; received 30 September 2026.", "disaggregation": "Public/private sector financing; infrastructure/sustainable finance"}, {"code": "GGGI-IO2.1", "node": "GGGI-OUTPUTS", "name": "old_IO2.1 Number of green growth policies adopted by governments with GGGI’s support.", "baseline": 0, "target": null, "unit": "policies", "target_text": "Target year: 2027. Numeric target not supplied.", "source": "GGGI Logframe.xlsx, Sheet1 D6:F6; received 30 September 2026.", "disaggregation": null}, {"code": "GGGI-PROJECTS", "node": "GGGI-OUTPUTS", "name": "# of projects from technical advisors with successfully approved concept notes and/or project proposals, and/or project disbursement and/or project kick-off meeting occuring disaggregated by mitigation/adaptation and sector", "baseline": 0, "target": null, "unit": "projects", "target_text": "Target year: 2027. Numeric target not supplied.", "source": "GGGI Logframe.xlsx, Sheet1 D7:F7; received 30 September 2026.", "disaggregation": "Mitigation/adaptation and sector"}], "activities": []}, {"code": "BOLD-VU", "name": "Building Our Pacific Loss and Damage (BOLD) Response Project – Vanuatu", "acronym": "BOLD", "status": "planning", "category": "CC-ADAPT", "theme": "Loss and Damage", "agency": "Department of Climate Change", "partners": ["SPREP"], "description": "Initial establishment phase of BOLD in Vanuatu. The September workplan covers provincial consultations on adaptation limits and the first steering committee meeting in Quarter 4 2026. A national programme design document was not available when Hendricks supplied the workplan. The project name and SPREP partnership are corroborated by the DoCC Quarter 1 Report 2026.", "profile": {"sender": "Hendricks Tabi", "email_subject": "Logframe for GGGI and BOLD project", "received_date_local": "2026-09-30", "imported_at": "2026-10-11", "kind": "partial framework / workplan", "no_actuals_imported": true, "budget_status": "not supplied", "user_authorized_addition": true, "document": "BOLD Project.xlsx", "sha256": "05f6527ccf4032b5d1c5e84119fead209df30e88f833de848ee952ed918f46c4", "supporting_document": "Quarter 1 Report_2026.docx", "supporting_sha256": "93d9c021e35a147526e5c092f1a989748cc7347f62c68683de5f156eb4316f0b", "scope_note": "Initial establishment phase only. Hendricks explicitly states that a national programme design document is not yet available.", "responsible_officer": "Moirah Matou", "schedule": "Quarter 4 2026; source provides period precision, not individual activity dates"}, "nodes": [{"code": "BOLD-31", "title": "31. (BOLD)Sector Provincial consultations conducted on Adaptation Limits", "description": "Planned output, Quarter 4 2026. Responsible: BOLD Project (Moirah).\nActivities:\n1. (i)Develop concept note of the Consultations\n(ii) Draft the Consultation program agenda\n(iii)Draft a Travel proposal plan\n(iv) Organize Logistics through DLA\n(v) Provide a report of outcomes and recommendations.", "order": 31}, {"code": "BOLD-32", "title": "32. 1st Steering Committee Meeting is organized ", "description": "Planned output, Quarter 4 2026. Responsible: BOLD Project (Moirah).\nActivities:\n2. (i)Develop Steering Committee TOR\n(ii) Organize logistics, venue etc…\n(iii) Provide minutes, actions and recommendations", "order": 32}], "indicators": [{"code": "BOLD-CONSULT", "node": "BOLD-31", "name": "2 provincial consultation conducted before december 2026", "baseline": null, "target": 2, "unit": "provincial consultations", "target_text": "2 provincial consultation conducted before december 2026", "source": "BOLD Project.xlsx, Sheet1 B3:F7; received 30 September 2026.", "responsible": "Moirah Matou"}, {"code": "BOLD-STEERING", "node": "BOLD-32", "name": "First steering committee meeting conducted before end of December 2026", "baseline": null, "target": 1, "unit": "steering committee meetings", "target_text": "First steering committee meeting conducted before end of December 2026", "source": "BOLD Project.xlsx, Sheet1 C9, D10:D12 and B13; received 30 September 2026.", "responsible": "Moirah Matou"}], "activities": [{"code": "BOLD-A01", "node": "BOLD-31", "name": "1. (i)Develop concept note of the Consultations", "responsible": "Moirah Matou"}, {"code": "BOLD-A02", "node": "BOLD-31", "name": "(ii) Draft the Consultation program agenda", "responsible": "Moirah Matou"}, {"code": "BOLD-A03", "node": "BOLD-31", "name": "(iii)Draft a Travel proposal plan", "responsible": "Moirah Matou"}, {"code": "BOLD-A04", "node": "BOLD-31", "name": "(iv) Organize Logistics through DLA", "responsible": "Moirah Matou"}, {"code": "BOLD-A05", "node": "BOLD-31", "name": "(v) Provide a report of outcomes and recommendations.", "responsible": "Moirah Matou"}, {"code": "BOLD-A06", "node": "BOLD-32", "name": "2. (i)Develop Steering Committee TOR", "responsible": "Moirah Matou"}, {"code": "BOLD-A07", "node": "BOLD-32", "name": "(ii) Organize logistics, venue etc…", "responsible": "Moirah Matou"}, {"code": "BOLD-A08", "node": "BOLD-32", "name": "(iii) Provide minutes, actions and recommendations", "responsible": "Moirah Matou"}]}]$data$::jsonb) LOOP
  IF EXISTS(SELECT 1 FROM merl.projects WHERE code<>p->>'code' AND
    (lower(coalesce(acronym,''))=lower(p->>'acronym') OR lower(name)=lower(p->>'name'))) THEN
   RAISE EXCEPTION 'Potential duplicate project: %',p->>'name';
  END IF;
  INSERT INTO merl.projects(code,name,acronym,status,category,primary_climate_theme,lead_agency,
    implementing_partners,department,description,registration_status,review_note,source_profile)
  VALUES(p->>'code',p->>'name',p->>'acronym',p->>'status',p->>'category',p->>'theme',p->>'agency',
    ARRAY(SELECT jsonb_array_elements_text(p->'partners')),'Department of Climate Change',p->>'description',
    'pending_review','Source-backed partial framework/workplan imported; formal design and missing numeric targets require review.',p->'profile')
  ON CONFLICT(code) DO NOTHING;
  SELECT id INTO STRICT pid FROM merl.projects WHERE code=p->>'code';
  FOR n IN SELECT value FROM jsonb_array_elements(p->'nodes') LOOP
   INSERT INTO merl.framework_nodes(project_id,node_code,node_type,title,description,status,sort_order)
   SELECT pid,n->>'code','output',n->>'title',n->>'description','draft',(n->>'order')::integer
   WHERE NOT EXISTS(SELECT 1 FROM merl.framework_nodes WHERE project_id=pid AND node_code=n->>'code');
  END LOOP;
  FOR i IN SELECT value FROM jsonb_array_elements(p->'indicators') LOOP
   SELECT id INTO STRICT nid FROM merl.framework_nodes WHERE project_id=pid AND node_code=i->>'node';
   INSERT INTO merl.project_indicators(project_id,code,name,unit,baseline_value,target_value,framework_node_id,
    indicator_level,definition,data_source,responsible_officer,disaggregation,is_public)
   VALUES(pid,i->>'code',i->>'name',i->>'unit',(i->>'baseline')::numeric,(i->>'target')::numeric,nid,
    'output','Planned indicator. '||(i->>'target_text')||' No achievement is asserted.',i->>'source',
    i->>'responsible',i->>'disaggregation',false)
   ON CONFLICT(project_id,code) DO NOTHING;
   SELECT id INTO STRICT iid FROM merl.project_indicators WHERE project_id=pid AND code=i->>'code';
   IF i->>'baseline' IS NOT NULL THEN
    INSERT INTO merl.indicator_targets(indicator_id,target_type,numeric_value,notes)
    VALUES(iid,'baseline',(i->>'baseline')::numeric,i->>'source')
    ON CONFLICT(indicator_id,target_type,period_label) DO NOTHING;
   END IF;
   INSERT INTO merl.indicator_targets(indicator_id,target_type,numeric_value,text_value,notes)
   VALUES(iid,'final',(i->>'target')::numeric,i->>'target_text',i->>'source')
   ON CONFLICT(indicator_id,target_type,period_label) DO NOTHING;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(p->'activities') LOOP
   SELECT id INTO STRICT nid FROM merl.framework_nodes WHERE project_id=pid AND node_code=a->>'node';
   INSERT INTO merl.project_activities(project_id,code,name,description,status,responsible_officer,framework_node_id)
   SELECT pid,a->>'code',a->>'name','BOLD Project.xlsx, Sheet1. Planned for Quarter 4 2026; no actual progress reported.',
    'not_started',a->>'responsible',nid
   WHERE NOT EXISTS(SELECT 1 FROM merl.project_activities WHERE project_id=pid AND code=a->>'code');
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM merl.project_indicators i JOIN merl.projects p ON p.id=i.project_id WHERE p.code IN ('GGGI-SUPPORT-VU','BOLD-VU'))<>5 THEN
  RAISE EXCEPTION 'Expected exactly five recovered indicators';
 END IF;
 IF (SELECT count(*) FROM merl.project_activities a JOIN merl.projects p ON p.id=a.project_id WHERE p.code='BOLD-VU')<>8 THEN
  RAISE EXCEPTION 'Expected exactly eight BOLD planned activities';
 END IF;
 IF EXISTS(SELECT 1 FROM merl.indicator_progress i JOIN merl.projects p ON p.id=i.project_id WHERE p.code IN ('GGGI-SUPPORT-VU','BOLD-VU')) THEN
  RAISE EXCEPTION 'Unexpected actual progress for recovered projects';
 END IF;
END $import$;
SELECT merl.refresh_public_portal();
SELECT merl.refresh_public_indicator_categories();
SELECT merl.refresh_public_portal_supplemental();
COMMIT;
