-- Run inside a transaction and roll back: no accounts or records survive.
-- Apply the migration first in the same transaction when validating it.
INSERT INTO merl.users(id,keycloak_id,email,full_name,role) VALUES
('aaaaaaaa-0000-4000-8000-000000000001','role-test-admin','role-test-admin@example.invalid','Role test admin','system_admin'),
('aaaaaaaa-0000-4000-8000-000000000002','role-test-meo','role-test-meo@example.invalid','Role test MEO','docc_me_officer'),
('aaaaaaaa-0000-4000-8000-000000000003','role-test-manager','role-test-manager@example.invalid','Role test manager','project_manager'),
('aaaaaaaa-0000-4000-8000-000000000004','role-test-viewer','role-test-viewer@example.invalid','Role test viewer','viewer');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"authenticated"}',true),set_config('app.current_user_id','role-test-admin',true);
INSERT INTO merl.projects(id,code,name,status) VALUES
('bbbbbbbb-0000-4000-8000-000000000001','ROLE-REGRESSION-1','Role regression assigned','active'),
('bbbbbbbb-0000-4000-8000-000000000002','ROLE-REGRESSION-2','Role regression private','active');
INSERT INTO merl.project_indicators(id,project_id,code,name,target_value) VALUES
('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','ROLE-I1','Assigned indicator',10),
('cccccccc-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','ROLE-I2','Private indicator',10);
SELECT public.assign_user_project('aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','manager');
INSERT INTO merl.reporting_periods(id,project_id,period_label,submission_status) VALUES
('dddddddd-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','ROLE-Q1','draft'),
('dddddddd-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001','ROLE-Q2','draft');
INSERT INTO merl.indicator_progress(id,project_id,indicator_id,reporting_period,actual_this_period,cumulative_actual,review_status) VALUES
('eeeeeeee-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','ROLE-Q1',5,5,'draft');
INSERT INTO merl.financial_progress(project_id,reporting_period,cumulative_expenditure) VALUES ('bbbbbbbb-0000-4000-8000-000000000001','ROLE-Q1',0);
INSERT INTO merl.learning_updates(project_id,reporting_period,key_achievements) VALUES ('bbbbbbbb-0000-4000-8000-000000000001','ROLE-Q1','Test narrative');
INSERT INTO merl.result_narratives(project_id,indicator_progress_id,reporting_period,progress_summary,review_status) VALUES ('bbbbbbbb-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','ROLE-Q1','Test narrative','draft');
SELECT set_config('app.current_user_id','role-test-manager',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.v_project_indicators WHERE id IN ('cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002'))<>1 THEN RAISE EXCEPTION 'Manager indicator scope failed'; END IF;
  BEGIN
    PERFORM public.upsert_evidence(p_id=>NULL,p_project_id=>'bbbbbbbb-0000-4000-8000-000000000001',p_title=>'Self verified',p_reporting_period=>'ROLE-Q1',p_verification_status=>'verified');
    RAISE EXCEPTION 'Self verification was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.review_reporting_period('dddddddd-0000-4000-8000-000000000001','approve',NULL);
    RAISE EXCEPTION 'Manager approval was allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Approver access required%' THEN RAISE; END IF; END;
  PERFORM public.submit_reporting_period('dddddddd-0000-4000-8000-000000000001');
  IF (SELECT review_status FROM public.v_indicator_progress WHERE id='eeeeeeee-0000-4000-8000-000000000001')<>'submitted' THEN RAISE EXCEPTION 'Submit did not advance results'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('app.current_user_id','role-test-meo',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  PERFORM public.assign_user_project('aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','manager');
  PERFORM public.upsert_evidence(p_id=>NULL,p_project_id=>'bbbbbbbb-0000-4000-8000-000000000001',p_title=>'Officer verified',p_reporting_period=>'ROLE-Q1',p_verification_status=>'verified');
  PERFORM public.review_reporting_period('dddddddd-0000-4000-8000-000000000001','review',NULL);
  IF (SELECT review_status FROM public.v_indicator_progress WHERE id='eeeeeeee-0000-4000-8000-000000000001')<>'under_review' THEN RAISE EXCEPTION 'Review did not advance results'; END IF;
  PERFORM public.review_reporting_period('dddddddd-0000-4000-8000-000000000001','approve',NULL);
  IF NOT EXISTS(SELECT 1 FROM public.v_indicator_progress WHERE id='eeeeeeee-0000-4000-8000-000000000001' AND review_status='approved' AND approved_by='aaaaaaaa-0000-4000-8000-000000000002' AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Approve did not stamp results'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('app.current_user_id','role-test-manager',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN
    PERFORM public.upsert_indicator_progress(p_id=>'eeeeeeee-0000-4000-8000-000000000001',p_project_id=>'bbbbbbbb-0000-4000-8000-000000000001',p_indicator_id=>'cccccccc-0000-4000-8000-000000000001',p_reporting_period=>'ROLE-Q2',p_actual_this_period=>99);
    RAISE EXCEPTION 'Moving a locked result was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('app.current_user_id','role-test-viewer',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.v_project_indicators WHERE id IN ('cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002'))<>2 THEN RAISE EXCEPTION 'Viewer lost read access'; END IF;
  BEGIN
    PERFORM public.upsert_evidence(p_id=>NULL,p_project_id=>'bbbbbbbb-0000-4000-8000-000000000001',p_title=>'Viewer write',p_reporting_period=>'ROLE-Q2');
    RAISE EXCEPTION 'Viewer write was allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Editor access required%' THEN RAISE; END IF; END;
END $test$;
RESET ROLE;
SELECT set_config('app.current_user_id','role-test-meo',true);
SET LOCAL ROLE authenticated;
SELECT public.reopen_reporting_period('dddddddd-0000-4000-8000-000000000001','Regression test');
DO $test$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.v_indicator_progress WHERE id='eeeeeeee-0000-4000-8000-000000000001' AND review_status='draft' AND approved_by IS NULL AND approved_at IS NULL) THEN RAISE EXCEPTION 'Reopen retained stale result approval'; END IF;
  IF (SELECT actual_this_period FROM public.v_indicator_progress WHERE id='eeeeeeee-0000-4000-8000-000000000001')<>5 THEN RAISE EXCEPTION 'Workflow changed reported values'; END IF;
END $test$;
RESET ROLE;
SELECT 'Role workflow regression checks passed' AS result;
