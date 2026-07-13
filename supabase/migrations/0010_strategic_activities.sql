-- =============================================================================
-- MERL Dashboard – Migration 0010: Strategic Results Framework Activities
-- =============================================================================
-- Persists the DoCC Strategic Plan 2025-2030 activities so editors can add,
-- update, delete and re-status them in-app. Reads go through the public
-- v_srf_activities view (security_invoker); writes go through SECURITY DEFINER
-- RPCs gated to editor roles (administrator / docc_me_officer / project_manager).
-- =============================================================================

BEGIN;

-- 1. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.srf_activities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT,
    name         TEXT NOT NULL,
    theme        TEXT NOT NULL,
    focus_area   TEXT NOT NULL,
    indicator    TEXT,
    budget_vuv   NUMERIC NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'unrated'
                 CHECK (status IN ('on_track','at_risk','no_progress','unrated')),
    progress     TEXT,
    risk         TEXT,
    target_2030  NUMERIC,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.srf_activities IS
    'DoCC Strategic Plan 2025-2030 activities; editable in-app via SECURITY DEFINER RPCs.';

ALTER TABLE merl.srf_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srf_activities_select ON merl.srf_activities;
CREATE POLICY srf_activities_select ON merl.srf_activities
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Seed (idempotent: only when empty) ---------------------------------------
INSERT INTO merl.srf_activities (code, name, theme, focus_area, indicator, budget_vuv, status, progress, risk, target_2030, sort_order)
SELECT * FROM (VALUES
  ('1.2','Include and carry-out vulnerability assessments, climate risk profiling and mapping as part of all Climate Change Adaptation Sectors/Actions','Adaptation','Vulnerability and Impact assessment','2 NPP Proposals, 4 Tafea outer islands reports • # Approved Project',0,'on_track','making excellent progress','weather conditions, Covid delays',0.7,1),
  ('1.3','Review and Updating of Vanuatu''s National Adaptation Programmes of Action (NAPA)','Adaptation','Vulnerability and Impact assessment','Revised and updated NAPA prepared and endorsed by CoM',25000000.0,'at_risk','Making some progress',NULL,1.0,2),
  ('1.4','Carry-out participatory vulnerability assessments at provincial and community levels','Adaptation','Vulnerability and Impact assessment','# Vulnerability Assessment workshops and consultation at Provincial level and Municipalities • Vulnerability Assessment Reports',100000000.0,'on_track','making excellent progress',NULL,1.0,3),
  ('1.5','Develop New Project Proposals (NPPs) on Vulnerability and Impact Assessment','Adaptation','Vulnerability and Impact assessment','# New Project Proposals (NPPs) developed and submitted for funding',0,'at_risk','making medium progress','Budget approved & drop down with 10 million',NULL,4),
  ('1.6','Support the development of systems and service products for vulnerability and impact assessment tailored to user/stakeholder needs','Adaptation','Vulnerability and Impact assessment','# Tailor made climate service products procured and installed',50000000.0,'on_track','making excellent progress','Translations',0.7,5),
  ('1.7','Identify and develop a roster to utilize nationally/regionally available expertise for vulnerability and impact assessments','Adaptation','Vulnerability and Impact assessment','Roaster of vulnerability and impact assessment experts (National, Regional and International)',10000000.0,'no_progress','No Progress/No Data',NULL,0.4,6),
  ('2.2','Assist and collaborate in the development partner/donor coordination mechanism to integrate climate change governance','Adaptation','Integrate Climate Change Governance and Implementation','Coordination mechanism on climate change governance integration established',5000000.0,'at_risk','making medium progress',NULL,NULL,7),
  ('2.3','Develop innovative partnerships with relevant stakeholders (Government, private, civil society, private etc) to integrate climate change approaches and actions.','Adaptation','Integrate Climate Change Governance and Implementation','# Partnerships established with relevant stakeholders through MoU''s/Collaboration agreements',10000000.0,'at_risk','making medium progress',NULL,NULL,8),
  ('3.2','Engage communities to participate in and lead the vulnerability assessment process and share the outcomes as part of all adaptation initiatives','Adaptation','Community Based Adaptation','# Community engagement/consultation activities conducted',0,'on_track','making excellent progress','staffs to attend, fundings, covid, weather conditions',NULL,9),
  ('3.3','Identify and develop community adaptation plans/framework and actions through a bottom-up planning approach','Adaptation','Community Based Adaptation','# Community adaptation plans and actions framework developed (Sectoral/Provincial)',200000000.0,'at_risk','making medium progress','CDCCC is at no cost',NULL,10),
  ('3.4','Develop approaches/processes to include community stakeholders and vulnerable groups in climate change adaptation initiatives in municipal, provincial and national climate and disaster decision-making','Adaptation','Community Based Adaptation','Community and vulnerable group inclusion approach/proceeds established. • Enlisting communities and vulnerable groups',50000000.0,'no_progress','No progress/No Data','Restructuring',1.0,11),
  ('4.2','Carry-out assessments on potential and actual loss and damage across Vanuatu linked with vulnerability assessment processes;','Adaptation','Loss and Damage (L&D) incurred as a result of climate change','Loss and damage assessments completed',100000000.0,'no_progress','No Progress/No Data',NULL,NULL,12),
  ('4.3','Develop a loss and damage implementation framework, including risk sharing, insurance and compensation approaches at replacement value;','Adaptation','Loss and Damage (L&D) incurred as a result of climate change','Loss and damage implementation framework (methodology) developed • L&D assessment models developed for projections and scenario analysis',50000000.0,'no_progress','No Progress/No Data',NULL,NULL,13),
  ('4.4','Collaborate with relevant line ministries ( Public Works) and assist to implement climate-proofed building codes, environmental impact assessments, regulations and development guidelines public and other major infrastructure in order to minimise loss and damage','Adaptation','Loss and Damage (L&D) incurred as a result of climate change','Climate proofing guidelines developed for major infrastructure (development) projects',25000000.0,'at_risk','making medium progress',NULL,NULL,14),
  ('5.2','Collaborate with relevant line ministries (Dept. of Lands) through policy or technical advice to identify sound land-use planning approaches and to develop ecosystem related development policy documents','Adaptation','Ecosystem Based Approaches','Ecosystem based development approaches identified and policy documents developed',25000000.0,'no_progress','No Progress/No Data',NULL,0.4,15),
  ('2.2','Collaborate and support Department of Energy (DoE) on implementation and achievement of NERM targets and goals','Mitigation','National Energy Roadmap - Renewable Energy and Energy Efficiency','Annual progress report on NERM targets (implementation progress)',10000000.0,'on_track','making excellent progress',NULL,NULL,16),
  ('2.3','Identify opportunities to assist with relevant line ministries and stakeholders to develop approaches to implement and achieve NDC targets through the implementation of the NDC MRV tool','Mitigation','National Energy Roadmap - Renewable Energy and Energy Efficiency','NDC (energy) target achievement opportunities identified and appropriate plans developed • Positive list of technology for achieving NDC targets',20000000.0,'on_track','making excellent progress',NULL,0.5,17),
  ('3.2','Collaborate and identify opportunities with forestry stakeholders on inventorying, quantifying, mapping and sorting data on carbon stocks (forestry) in critical ecosystems','Mitigation','Climate Change Mitigation and REDD+','Carbon stock assessment opportunities identified and implementation supported.',50000000.0,'on_track','making excellent progress','delayed due to covid 19',NULL,18),
  ('3.3','Support and engage in the development of an updated Nationally Determined Contribution (NDC) implementation roadmap based on latest NDC update','Mitigation','Climate Change Mitigation and REDD+','NDC implementation roadmap updated',20000000.0,'on_track','making excellent progress',NULL,1.0,19),
  ('3.4','Support and engage in the international REDD+ Readiness process through the National REDD+ Technical Committee','Mitigation','Climate Change Mitigation and REDD+','Inputs provided to National REDD+ programme',10000000.0,'on_track','making excellent progress',NULL,NULL,20),
  (NULL,'prepare Low Carbon Development Strategy for Vanuatu','Mitigation','Climate Change Mitigation and REDD+','Low Carbon Development Strategy developed and approved by CoM',20000000.0,'no_progress','No Progress/No Data',NULL,1.0,21),
  ('3.5','Collaborate with relevant stakeholders to prepare and submit relevant Nationally Appropriate Mitigation Action (NAMA) proposal for funding','Mitigation','Climate Change Mitigation and REDD+','# NAMA proposal developed and submitted for funding',15000000.0,'at_risk','making medium progress',NULL,NULL,22),
  ('3.6','Collaborate with relevant stakeholders/donors/development partners to identify green development alternatives and support to implement a green growth framework to minimise carbon emissions','Mitigation','Climate Change Mitigation and REDD+','Green growth framework developed and # green development initiatives identified and # Piloted and # implemented',10000000.0,'at_risk','making medium progress','covid19',NULL,23),
  ('4.2','Collaborate with NDMO, National Recovery Committee (NRC) and relevant stakeholders to address preparedness and recovery to climate change impacts into national, sectoral, provincial, municipal and community level plans','Mitigation','Planning and Preparedness to Climate related disasters','Climate change response recovery integrated into development plans at all levels',15000000.0,'no_progress','No Progress/No Data',NULL,0.5,24),
  ('4.3','Support relevant stakeholders to develop guidelines and trainings to ensure appropriate standards and consistency when integrating climate change into subnational planning and budgeting processes','Mitigation','Planning and Preparedness to Climate related disasters','Guidelines on appropriate standards for climate change integration into planning and budgeting developed.',10000000.0,'no_progress','no Progress/No Data',NULL,NULL,25),
  ('3.2','Strengthen DoCC’s resources and capacity to effectively deliver climate change services and manage projects','Governance','Institutional Structure','Institutional and capacity gaps identified and strengthened',10000000.0,'on_track','making excellent progress','VIPAM regulations should be applied',NULL,26),
  ('3.3','Facilitate the provision ofclimate change related techincal advice to strengthen traditional governance and faith-based governance systems through partnerships among stakeholders','Governance','Institutional Structure','Traditional and faith based governance framework developed',10000000.0,'on_track','making excellent progress','staffs attendance',NULL,27),
  ('3.4','Develop action plan to strengthen climate change capacity of provincial, municipal and area council personnel through institutional collaboration and support','Governance','Institutional Structure','Action plan for institutional collaboration for local bodies developed',15000000.0,'at_risk','making medium progress','remoteness',0.3,28),
  ('4.2','Facilitate the review and update Vanuatu''s CCDRR policy','Governance','Legislation and Policy Framework','Updated CCDRR policy developed and approved by CoM',20000000.0,'on_track','making excellent progress','Covid19 / delay of virtuals meetings',NULL,29),
  ('4.3','Assist the NAB and relevant stakeholders to identify opportunities to integrate and harmonise climate change requirements into other relevant legislation and policies','Governance','Legislation and Policy Framework','Climate change requirements integrated into relevant legislation and policies.',10000000.0,'at_risk','making medium progress','workloads delays schedules time',NULL,30),
  ('4.4','Collaborate with relevant agencies to develop practical strategies to address gender and social inclusion issues within the climate change context','Governance','Legislation and Policy Framework','Practical strategies developed for gender and social inclusion issues in climate change',15000000.0,'no_progress','No Progress/No Data',NULL,NULL,31),
  ('5.2','Initiate and develop National Adaptation Plans (NAPs) as per the UNFCCC and as outlined in the CCDRR policy','Governance','International and Regional Obligations','National Adaptation Plans (NAPs) developed',100000000.0,'on_track','making excellent progress',NULL,NULL,32),
  ('5.3','Support the NAB with periodic compilation and submission of UNFCCC reporting requirements (national communications (NCs), biennial update reports (BURs), national adaptation plans (NAP), and nationally determined contributions (NDCs))','Governance','International and Regional Obligations','UNFCCC reporting requirements met through submission of periodic reports',0,'on_track','making excellent progress',NULL,NULL,33),
  ('5.4','Assist with the Identification of roles, capacities and budget towards the fulfilment of international obligations and activities, including forming gender balanced delegations.','Governance','International and Regional Obligations','Human resource positions allocated to fulfil international climate obligation',0,'no_progress','No Progress/No Data',NULL,NULL,34),
  ('6.2','Carry-out periodic review, updating and ongoing implementation of strategic , business and annual work plans','Governance','Strategic and Business Plan','Review reports for strategic and annual work plans',0,'on_track','making excellent progress','new form to cope with',1.0,35),
  ('7.2','Develop a framework and an action plan to strengthen and enhance M&E of climate change activities at national, provincial and area council levels','Governance','Monitoring and Evaluation (M&E)','M&E strengthening action plan developed',10000000.0,'no_progress','No Progress/No Data','delay of MOCCA M&E Position, Delay of Corprate plan, CCDRR Implementation Plan and CCDRR Review',1.0,36),
  ('8.2','Collaborate with relevant stakeholders to identify and develop a mechanism to allocate appropriate funding in budgets for climate change activities and external funding is channelled through existing government financial systems','Finance','Funding Allocation','Mechanism for climate change fund allocation in budgets',0,'at_risk','making medium progress','insufficients funds',1.0,37),
  ('8.3','Establish a national climate change fund','Finance','Funding Allocation','National climate change fund established',50000000.0,'no_progress','No Progress/No Data',NULL,1.0,38),
  ('8.4','Identify and develop a framework for private sector investment in climate change projects','Finance','Funding Allocation','Framework for private sector investment developed',20000000.0,'no_progress','No Progress/No Data',NULL,1.0,39),
  ('8.5','Collaborate with relevant stakeholders to explore options for a climate change insurance or risk sharing scheme','Finance','Funding Allocation','Options for climate change insurance/risk sharing identified',10000000.0,'no_progress','No Progress/No Data',NULL,NULL,40),
  ('9.2','Implement measurable improvements in climate change budgeting, financial statements, reporting, audit processes, procurement practices, project management, and transparency policies and lobby with regional and international partners for support on obtaining NIE status by GCF','Finance','National Implementing Entity (NIE) accreditation for GCF','GCF NIE status obtained',20000000.0,'on_track','making excellent progress',NULL,1.0,41),
  ('10.2','Support through the provision of technical advice the information, education and communication endorsement process for climate change information material developers','Knowledge','Information Management','Information, education and communication endorsement process developed',5000000.0,'on_track','making excellent progress','Workload & Commitments',NULL,42),
  ('10.3','Design, develop and maintain an updated web portal for DoCC','Knowledge','Information Management','Updated DoCC web portal developed',5000000.0,'on_track','making excellent progress','Vacant position',NULL,43),
  ('10.4','Support the NAB Secretariat to update project information, resources, reports, events and contacts periodically on the climate change web portal and ensure accessibility','Knowledge','Information Management','Updated information on climate change web portal',0,'at_risk','making medium progress','Vacant position',NULL,44),
  ('11.2','Facilitate and promote traditional knowledge compendium for climate change planning and make it accessible to decision-makers','Knowledge','Traditional Knowledge','Compendium on traditional knowledge for climate change planning',10000000.0,'no_progress','No Progress/No Data',NULL,1.0,45),
  (NULL,'12. 2 Develop knowledge sharing materials on climate change related to local context including Lessons learnt for enhanced decision- making','Knowledge','Knowledge Sharing','Knowledge sharing materials on local climate change developed',0,'at_risk','making some progress',NULL,1.0,46),
  ('12.3','Utilize and strengthen existing networks and knowledge sharing mechanisms through organizing national-scale climate change summit meetings and events','Knowledge','Knowledge Sharing','# National climate change summits/events organized',0,'at_risk','making some progress','SLO to approved',NULL,47),
  ('12.4','Support and promote knowledge management systems that build on increased accessibility of information and communications technology tools','Knowledge','Knowledge Sharing','A new knowledge management systems developed',10000000.0,'at_risk','making some progress',NULL,1.0,48),
  ('12.5','Facilitate the development of a climate change data sharing policy','Knowledge','Knowledge Sharing','A climate change data sharing policy developed',0,'on_track','making excellent progress',NULL,1.0,49),
  ('13.2','Collaborate with relevant stakeholders to gather, record and share lessons learned from climate change related project activities, events and exercises to inform planning, policy and practice','Knowledge','Lessons Learned','# Lessons learnt compiled and shared on web portal',10000000.0,'at_risk','making some progress',NULL,0.3,50),
  ('14.2','Coordinate with relevant stakeholders on climate change data collection and establishing a central database to collect, store and enable access to relevant climate change data','Knowledge','Data Analysis','Climate change database established',50000000.0,'at_risk','making some progress',NULL,0.4,51),
  ('14.2','Facilitate partnerships with relevant stakeholders though memoranda of understanding on national, regional and international level to enhance climate change data collection, sharing and analysis','Knowledge','Data Analysis','# MOU''s and partnership agreements signed',0,'at_risk','making some progress','Covid19',NULL,52),
  ('15.2','Develop a rapid screening/assessment tool kit or ready reckoner to mainstream climate change across the government policies and decision making process','Cross-cutting','Mainstreaming Climate Change','Rapid assessment tool kit for mainstreaming climate change developed',25000000.0,'no_progress','No Progress/No Data',NULL,0.3,53),
  ('16.2','Stregthen capacity via a gap analysis and the development of a need based capacity building programme for DoCC staff on all aspects climate change','Cross-cutting','Capacity Building','# Need based capacity building programme developed for DoCC staff',10000000.0,'on_track','making excellent progress','follow VIPAM/PSC regulations',0.4,54),
  ('16.3','Develop an on-going training and capacity building programme for efficient utilization of the integrated MRV tool, sustainable GHG inventory management and other relevant tools','Cross-cutting','Capacity Building','On-going training programme developed for integrated MRV tool and GHG inventory management',10000000.0,'at_risk','making some progress','covid19_face-to-face',0.4,55),
  ('16.4','Collaborate with relevant stakeholders to develop advocacy, educational and informal capacity building and training programmes on climate change, traditional knowledge and Gender Equality and Other Vulnerable Group Inclusion','Cross-cutting','Capacity Building','# Focused capacity programmes developed and facilitated',20000000.0,'on_track','making excellent progress','Covid19',0.4,56),
  ('17.2','Develop collaboration mechanism with international and national stakeholders on climate change adaptation or mitigation related planning, research, outreach and project delivery activities to increase the effectiveness and efficiency of climate actions.','Cross-cutting','Partnership Development','Collaborative mechanism developed',20000000.0,'on_track','making excellent progress','covid19',0.5,57),
  (NULL,'17. 3 Operation Priorities','Cross-cutting','Partnership Development',NULL,0,'unrated',NULL,NULL,NULL,58),
  ('1.1','Staff Appraisal','Cross-cutting','Partnership Development','Staff appraisal reports',0,'on_track','made excellent progress','staffs leaving',1.0,59),
  ('1.2','Annual departmental budget preparation','Cross-cutting','Partnership Development','Departmental budget submitted to MEFM',0,'on_track','made excellent progress','time management',1.0,60),
  ('1.3','Preparation of Halfly Yearly Reports','Cross-cutting','Partnership Development','Half yearly reports',0,'on_track','made excellent progress','submission of reports on time',1.0,61),
  ('1.4','Preparation of Annual Reports','Cross-cutting','Partnership Development','Annual report submitted to MoCC',0,'on_track','made excellent progress','Covid19',1.0,62),
  ('1.5','Carry-out staff tracking and accountability','Cross-cutting','Partnership Development','Staff tracking and accountability reports',0,'on_track','making excellent progress','delay of reporting',1.0,63),
  ('1.6','Periodic review of departmental structure, staffing and functioning','Cross-cutting','Partnership Development','Review reports',0,'on_track','making excellent progress','commitments',1.0,64),
  ('1.7','Prepare and implement administrative process and procedure guidelines/manual','Cross-cutting','Partnership Development','Admin process and procedure manual developed',5000000.0,'on_track','making excellent progress',NULL,1.0,65)
) AS seed(code, name, theme, focus_area, indicator, budget_vuv, status, progress, risk, target_2030, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM merl.srf_activities);

-- 3. Public view --------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_srf_activities WITH (security_invoker = on) AS
SELECT id, code, name, theme, focus_area, indicator, budget_vuv, status,
       progress, risk, target_2030, sort_order, created_at, updated_at
FROM merl.srf_activities;

-- 4. Write RPCs (editor-gated, SECURITY DEFINER) ------------------------------
CREATE OR REPLACE FUNCTION public.create_srf_activity(
    p_name TEXT, p_theme TEXT, p_focus_area TEXT,
    p_code TEXT DEFAULT NULL, p_indicator TEXT DEFAULT NULL,
    p_budget_vuv NUMERIC DEFAULT 0, p_status TEXT DEFAULT 'unrated',
    p_progress TEXT DEFAULT NULL, p_risk TEXT DEFAULT NULL, p_target_2030 NUMERIC DEFAULT NULL
) RETURNS merl.srf_activities
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activities; v_sort INTEGER;
BEGIN
    PERFORM merl.require_editor();
    IF p_status NOT IN ('on_track','at_risk','no_progress','unrated') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;
    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM merl.srf_activities;
    INSERT INTO merl.srf_activities (code, name, theme, focus_area, indicator, budget_vuv, status, progress, risk, target_2030, sort_order)
    VALUES (NULLIF(p_code,''), p_name, p_theme, p_focus_area, NULLIF(p_indicator,''),
            COALESCE(p_budget_vuv,0), p_status, NULLIF(p_progress,''), NULLIF(p_risk,''), p_target_2030, v_sort)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_srf_activity(
    p_id UUID, p_name TEXT, p_theme TEXT, p_focus_area TEXT,
    p_code TEXT DEFAULT NULL, p_indicator TEXT DEFAULT NULL,
    p_budget_vuv NUMERIC DEFAULT 0, p_status TEXT DEFAULT 'unrated',
    p_progress TEXT DEFAULT NULL, p_risk TEXT DEFAULT NULL, p_target_2030 NUMERIC DEFAULT NULL
) RETURNS merl.srf_activities
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activities;
BEGIN
    PERFORM merl.require_editor();
    IF p_status NOT IN ('on_track','at_risk','no_progress','unrated') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;
    UPDATE merl.srf_activities SET
        code=NULLIF(p_code,''), name=p_name, theme=p_theme, focus_area=p_focus_area,
        indicator=NULLIF(p_indicator,''), budget_vuv=COALESCE(p_budget_vuv,0), status=p_status,
        progress=NULLIF(p_progress,''), risk=NULLIF(p_risk,''), target_2030=p_target_2030, updated_at=now()
    WHERE id=p_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Activity not found: %', p_id; END IF;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.set_srf_activity_status(p_id UUID, p_status TEXT)
RETURNS merl.srf_activities
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activities;
BEGIN
    PERFORM merl.require_editor();
    IF p_status NOT IN ('on_track','at_risk','no_progress','unrated') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;
    UPDATE merl.srf_activities SET status=p_status, updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Activity not found: %', p_id; END IF;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_srf_activity(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.srf_activities WHERE id=p_id;
END; $$;

-- 5. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.srf_activities TO authenticated;
        GRANT SELECT ON public.v_srf_activities TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.create_srf_activity(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,NUMERIC),
            public.update_srf_activity(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,NUMERIC),
            public.set_srf_activity_status(UUID,TEXT),
            public.delete_srf_activity(UUID)
        TO authenticated;
    END IF;
END $$;

COMMIT;
