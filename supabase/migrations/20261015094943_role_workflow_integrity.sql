-- Enforce project visibility independently of frontend filtering.
ALTER POLICY project_indicators_select ON merl.project_indicators
  TO authenticated USING (merl.can_access_project(project_id));

CREATE OR REPLACE FUNCTION merl.fn_enforce_evidence_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor merl.users;
BEGIN
  actor := merl.current_db_user();
  IF actor.id IS NULL THEN
    IF current_setting('request.jwt.claim.role',true)='service_role' OR session_user='postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Editor access required' USING ERRCODE='42501';
  END IF;
  IF actor.role NOT IN ('system_admin','docc_me_officer') THEN
    IF (TG_OP='INSERT' AND coalesce(NEW.verification_status,'pending')<>'pending')
       OR (TG_OP='UPDATE' AND NEW.verification_status IS DISTINCT FROM OLD.verification_status AND coalesce(NEW.verification_status,'pending')<>'pending') THEN
      RAISE EXCEPTION 'Only a DoCC M&E Officer or System Administrator may verify or reject evidence' USING ERRCODE='42501';
    END IF;
    IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['verification_status','updated_at','updated_by','i18n'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['verification_status','updated_at','updated_by','i18n']) THEN
      NEW.verification_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION merl.fn_enforce_evidence_verification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_evidence_verification BEFORE INSERT OR UPDATE ON merl.evidence
FOR EACH ROW EXECUTE FUNCTION merl.fn_enforce_evidence_verification();

CREATE OR REPLACE FUNCTION merl.fn_block_locked_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public'
AS $function$
DECLARE v_pid UUID; v_period TEXT; v_actor merl.users;
BEGIN
    -- A translation-only update leaves every reported value untouched. The
    -- row's own bookkeeping is ignored: a BEFORE UPDATE trigger stamps
    -- updated_at and sorts ahead of this one by name.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'i18n' - 'updated_at' - 'updated_by')
         = (to_jsonb(OLD) - 'i18n' - 'updated_at' - 'updated_by') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN v_pid := OLD.project_id; v_period := OLD.reporting_period;
    ELSE                     v_pid := NEW.project_id; v_period := NEW.reporting_period; END IF;
    -- Workflow transitions may change review metadata, never reported values.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - ARRAY['review_status','approved_by','approved_at','published_at','updated_at','updated_by'])
         = (to_jsonb(OLD) - ARRAY['review_status','approved_by','approved_at','published_at','updated_at','updated_by'])
       AND ((merl.current_db_user()).role IN ('system_admin','docc_me_officer')
         OR (auth.uid() IS NULL AND session_user='postgres')) THEN
        RETURN NEW;
    END IF;
    -- A record cannot escape a lock by changing its reporting-period label.
    IF TG_OP = 'UPDATE' AND EXISTS (
      SELECT 1 FROM merl.reporting_periods rp WHERE rp.project_id=OLD.project_id
        AND rp.period_label=OLD.reporting_period AND rp.submission_status='approved'
    ) AND (merl.current_db_user()).role IS DISTINCT FROM 'system_admin' THEN
      RAISE EXCEPTION 'Reopen the approved reporting period before moving or editing its records' USING ERRCODE='42501';
    END IF;
    IF v_period IS NOT NULL AND EXISTS (
        SELECT 1 FROM merl.reporting_periods rp
        WHERE rp.project_id = v_pid AND rp.period_label = v_period AND rp.submission_status = 'approved'
    ) THEN
        v_actor := merl.current_db_user();
        IF v_actor.role IS DISTINCT FROM 'system_admin' THEN
            RAISE EXCEPTION 'This reporting period is approved and locked. The DoCC M&E Officer must reopen it before changes.'
                USING ERRCODE='42501';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $function$;


-- One atomic period transition updates the review state of its saved results.
CREATE OR REPLACE FUNCTION merl.fn_sync_period_result_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE next_review text; reviewer uuid; reviewed_at timestamptz;
BEGIN
  IF NEW.submission_status IS NOT DISTINCT FROM OLD.submission_status THEN RETURN NEW; END IF;
  next_review := CASE NEW.submission_status WHEN 'submitted' THEN 'submitted'
    WHEN 'reviewed' THEN 'under_review' WHEN 'approved' THEN 'approved'
    WHEN 'returned' THEN 'returned' ELSE 'draft' END;
  IF next_review='approved' THEN reviewer:=NEW.reviewer_id; reviewed_at:=NEW.approved_at; END IF;
  UPDATE merl.indicator_progress SET review_status=next_review,
    approved_by=reviewer,approved_at=reviewed_at,published_at=NULL,updated_by=NEW.updated_by
  WHERE project_id=NEW.project_id AND reporting_period=NEW.period_label;
  UPDATE merl.result_narratives SET review_status=next_review,approved_by=reviewer,approved_at=reviewed_at,updated_at=now()
  WHERE project_id=NEW.project_id AND reporting_period=NEW.period_label;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION merl.fn_sync_period_result_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sync_period_result_review AFTER UPDATE OF submission_status ON merl.reporting_periods
FOR EACH ROW EXECUTE FUNCTION merl.fn_sync_period_result_review();

-- Reconcile review metadata only when a recorded approval demonstrably covered
-- the existing result. Do not infer approvals for results changed afterwards.
DO $reconcile$
DECLARE previous_role text := current_setting('request.jwt.claim.role',true);
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
UPDATE merl.indicator_progress ip SET review_status='approved',approved_by=rp.reviewer_id,approved_at=rp.approved_at,published_at=NULL
FROM merl.reporting_periods rp WHERE ip.project_id=rp.project_id AND ip.reporting_period=rp.period_label
AND rp.submission_status='approved' AND rp.reviewer_id IS NOT NULL AND rp.approved_at IS NOT NULL
AND ip.updated_at<=rp.approved_at AND ip.review_status IN ('draft','submitted','under_review','resubmitted');
UPDATE merl.indicator_progress ip SET review_status='draft',approved_by=NULL,approved_at=NULL,published_at=NULL
FROM merl.reporting_periods rp WHERE ip.project_id=rp.project_id AND ip.reporting_period=rp.period_label
AND rp.submission_status IN ('draft','returned') AND ip.review_status IN ('approved','published','locked');
UPDATE merl.result_narratives n SET review_status=ip.review_status,approved_by=ip.approved_by,approved_at=ip.approved_at,updated_at=now()
FROM merl.indicator_progress ip WHERE n.indicator_progress_id=ip.id
AND (n.review_status,n.approved_by,n.approved_at) IS DISTINCT FROM (ip.review_status,ip.approved_by,ip.approved_at);

  PERFORM set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
END $reconcile$;
