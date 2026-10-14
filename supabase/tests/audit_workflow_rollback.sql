-- Run with an administrative SQL connection. All fixture and audit writes roll back.
BEGIN;
DO $$
DECLARE
  v_manager uuid; v_reviewer uuid; v_viewer uuid; v_project uuid; v_other uuid;
  v_period uuid; v_other_period uuid; v_indicator uuid; v_finance uuid;
  v_nonce text := substr(gen_random_uuid()::text,1,16);
BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  INSERT INTO merl.users(keycloak_id,email,full_name,role) VALUES(v_nonce||'-manager',v_nonce||'-manager@example.invalid','Rollback test manager','project_manager') RETURNING id INTO v_manager;
  INSERT INTO merl.users(keycloak_id,email,full_name,role) VALUES(v_nonce||'-reviewer',v_nonce||'-reviewer@example.invalid','Rollback test reviewer','docc_me_officer') RETURNING id INTO v_reviewer;
  INSERT INTO merl.users(keycloak_id,email,full_name,role) VALUES(v_nonce||'-viewer',v_nonce||'-viewer@example.invalid','Rollback test viewer','viewer') RETURNING id INTO v_viewer;
  PERFORM set_config('app.current_user_id',v_nonce||'-reviewer',true);
  INSERT INTO merl.projects(name,code,status) VALUES('Rollback audit fixture',v_nonce,'planning') RETURNING id INTO v_project;
  INSERT INTO merl.projects(name,status) VALUES('Rollback unassigned fixture','planning') RETURNING id INTO v_other;
  INSERT INTO merl.user_project_assignments(user_id,project_id) VALUES(v_manager,v_project);
  INSERT INTO merl.reporting_periods(project_id,period_label) VALUES(v_project,'Audit period') RETURNING id INTO v_period;
  INSERT INTO merl.reporting_periods(project_id,period_label) VALUES(v_other,'Audit period') RETURNING id INTO v_other_period;
  INSERT INTO merl.project_indicators(project_id,code,name) VALUES(v_project,'AUDIT-IND','Rollback-only indicator') RETURNING id INTO v_indicator;

  PERFORM set_config('app.current_user_id',v_nonce||'-manager',true);
  BEGIN
    PERFORM public.submit_reporting_period(v_other_period);
    RAISE EXCEPTION 'FAIL: unassigned manager submitted another project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.submit_reporting_period(v_period);
    RAISE EXCEPTION 'FAIL: incomplete report submitted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO merl.indicator_progress(project_id,indicator_id,reporting_period,cumulative_actual) VALUES(v_project,v_indicator,'Audit period',3);
  INSERT INTO merl.financial_progress(project_id,reporting_period,cumulative_expenditure) VALUES(v_project,'Audit period',0) RETURNING id INTO v_finance;
  INSERT INTO merl.learning_updates(project_id,reporting_period,key_achievements) VALUES(v_project,'Audit period','Verified fixture');
  PERFORM public.submit_reporting_period(v_period);
  IF (SELECT submission_status FROM merl.reporting_periods WHERE id=v_period) <> 'submitted' THEN RAISE EXCEPTION 'FAIL: complete report did not submit'; END IF;
  BEGIN
    PERFORM public.review_reporting_period(v_period,'approve');
    RAISE EXCEPTION 'FAIL: manager approved report';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  PERFORM set_config('app.current_user_id',v_nonce||'-reviewer',true);
  PERFORM public.review_reporting_period(v_period,'approve');
  PERFORM set_config('app.current_user_id',v_nonce||'-manager',true);
  BEGIN
    UPDATE merl.financial_progress SET cumulative_expenditure=1 WHERE id=v_finance;
    RAISE EXCEPTION 'FAIL: approved finance record was editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('app.current_user_id',v_nonce||'-reviewer',true);
  PERFORM public.reopen_reporting_period(v_period,'Rollback integration test');
  PERFORM set_config('app.current_user_id',v_nonce||'-manager',true);
  UPDATE merl.financial_progress SET cumulative_expenditure=1 WHERE id=v_finance;
  IF (SELECT cumulative_expenditure FROM merl.financial_progress WHERE id=v_finance) <> 1 THEN RAISE EXCEPTION 'FAIL: reopened report not editable'; END IF;

  PERFORM set_config('app.current_user_id',v_nonce||'-viewer',true);
  BEGIN
    PERFORM public.submit_reporting_period(v_period);
    RAISE EXCEPTION 'FAIL: viewer submitted report';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  IF has_function_privilege('authenticated','public.add_project_document(text,text,text,text,text,text,bigint,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'FAIL: document metadata endpoint remains exposed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: incomplete submission, project assignment, valid submission, approval roles, locking, reopening, viewer denial and retired document API' AS result;
