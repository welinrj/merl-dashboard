-- Atomic, project-authorised partial edits for the Results Framework table.
-- Omitted fields retain their existing values; editing metadata never deletes targets.
CREATE OR REPLACE FUNCTION public.patch_results_framework_node(p_id uuid,p_changes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public AS $$
DECLARE v merl.framework_nodes;
BEGIN
  SELECT * INTO v FROM merl.framework_nodes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Result node not found'; END IF;
  PERFORM merl.require_results_framework_editor(v.project_id);
  IF jsonb_typeof(p_changes) <> 'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT(k=ANY(ARRAY['node_code','node_type','parent_node_id','title','description','sort_order','status']))
  ) THEN RAISE EXCEPTION 'Invalid result fields'; END IF;
  v := jsonb_populate_record(v,p_changes);
  IF nullif(btrim(v.title),'') IS NULL THEN RAISE EXCEPTION 'Title is required'; END IF;
  IF v.parent_node_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM merl.framework_nodes WHERE id=v.parent_node_id AND project_id=v.project_id
  ) THEN RAISE EXCEPTION 'Parent result must belong to this project'; END IF;
  IF v.parent_node_id=p_id OR EXISTS (
    WITH RECURSIVE descendants AS (
      SELECT id FROM merl.framework_nodes WHERE parent_node_id=p_id
      UNION SELECT n.id FROM merl.framework_nodes n JOIN descendants d ON n.parent_node_id=d.id
    ) SELECT 1 FROM descendants WHERE id=v.parent_node_id
  ) THEN RAISE EXCEPTION 'A result cannot be its own ancestor'; END IF;
  UPDATE merl.framework_nodes SET node_code=v.node_code,
      node_type=v.node_type,
      parent_node_id=v.parent_node_id,
      title=v.title,
      description=v.description,
      sort_order=v.sort_order,
      status=v.status,updated_at=now() WHERE id=p_id;
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.patch_results_framework_row(
  p_indicator_id uuid,p_changes jsonb,p_progress_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public AS $$
DECLARE
  i merl.project_indicators; t merl.indicator_targets; g merl.indicator_progress;
  n merl.result_narratives; u merl.users; item jsonb; patch jsonb; tid uuid;
BEGIN
  SELECT * INTO i FROM merl.project_indicators WHERE id=p_indicator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Indicator not found'; END IF;
  PERFORM merl.require_results_framework_editor(i.project_id);
  u := merl.current_db_user();
  IF jsonb_typeof(p_changes) <> 'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT(k=ANY(ARRAY['indicator','targets','progress','narrative']))
  ) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
  IF p_changes ? 'indicator' THEN
    patch := p_changes->'indicator';
    IF jsonb_typeof(patch) <> 'object' OR EXISTS(
      SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT(k=ANY(ARRAY['code','name','unit','definition','framework_node_id','direction','aggregation_method','progress_method','official_reporting_frequency','data_source','collection_method','disaggregation','assumptions','means_of_verification','responsible_officer','is_qualitative','higher_is_better','baseline_year','target_date']))
    ) THEN RAISE EXCEPTION 'Invalid indicator fields'; END IF;
    i := jsonb_populate_record(i,patch);
    IF nullif(btrim(i.name),'') IS NULL OR nullif(btrim(i.code),'') IS NULL THEN
      RAISE EXCEPTION 'Indicator name and code are required'; END IF;
    IF i.framework_node_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM merl.framework_nodes WHERE id=i.framework_node_id AND project_id=i.project_id
    ) THEN RAISE EXCEPTION 'Result must belong to this project'; END IF;
    UPDATE merl.project_indicators SET code=i.code,
      name=i.name,
      unit=i.unit,
      definition=i.definition,
      framework_node_id=i.framework_node_id,
      direction=i.direction,
      aggregation_method=i.aggregation_method,
      progress_method=i.progress_method,
      official_reporting_frequency=i.official_reporting_frequency,
      data_source=i.data_source,
      collection_method=i.collection_method,
      disaggregation=i.disaggregation,
      assumptions=i.assumptions,
      means_of_verification=i.means_of_verification,
      responsible_officer=i.responsible_officer,
      is_qualitative=i.is_qualitative,
      higher_is_better=i.higher_is_better,
      baseline_year=i.baseline_year,
      target_date=i.target_date,frequency=i.official_reporting_frequency,updated_at=now()
      WHERE id=p_indicator_id;
  END IF;
  IF p_changes ? 'targets' THEN
    IF jsonb_typeof(p_changes->'targets') <> 'array' THEN RAISE EXCEPTION 'Invalid targets'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_changes->'targets') LOOP
      tid := nullif(item->>'id','')::uuid; patch := item-'id';
      IF jsonb_typeof(item) <> 'object' OR EXISTS(
        SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT(k=ANY(ARRAY['target_type','period_label','period_start','period_end','numeric_value','text_value','ordinal_value','female_value','male_value','notes']))
      ) THEN RAISE EXCEPTION 'Invalid target fields'; END IF;
      IF tid IS NOT NULL THEN
        SELECT * INTO t FROM merl.indicator_targets WHERE id=tid AND indicator_id=p_indicator_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Target does not belong to this indicator'; END IF;
      ELSE
        t := NULL; t.indicator_id := p_indicator_id; t.period_label := '';
      END IF;
      t := jsonb_populate_record(t,patch);
      IF t.period_start > t.period_end THEN RAISE EXCEPTION 'Target end date precedes start date'; END IF;
      IF num_nonnulls(t.numeric_value,t.text_value,t.ordinal_value)>1 THEN
        RAISE EXCEPTION 'Choose one target value: numeric, text or ordinal'; END IF;
      IF tid IS NULL THEN
        INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,period_start,period_end,numeric_value,text_value,ordinal_value,female_value,male_value,notes)
        VALUES(p_indicator_id,t.target_type,t.period_label,t.period_start,t.period_end,t.numeric_value,t.text_value,t.ordinal_value,t.female_value,t.male_value,t.notes) RETURNING id INTO tid;
      ELSE
        UPDATE merl.indicator_targets SET target_type=t.target_type,
      period_label=t.period_label,
      period_start=t.period_start,
      period_end=t.period_end,
      numeric_value=t.numeric_value,
      text_value=t.text_value,
      ordinal_value=t.ordinal_value,
      female_value=t.female_value,
      male_value=t.male_value,
      notes=t.notes,updated_at=now() WHERE id=tid;
      END IF;
    END LOOP;
    -- Keep legacy calculations consistent with the same targets shown by the table.
    UPDATE merl.project_indicators SET
      baseline_value=CASE WHEN EXISTS(SELECT 1 FROM merl.indicator_targets WHERE indicator_id=p_indicator_id AND target_type='baseline') THEN (SELECT coalesce(numeric_value,ordinal_value) FROM merl.indicator_targets WHERE indicator_id=p_indicator_id AND target_type='baseline' ORDER BY created_at,id LIMIT 1) ELSE baseline_value END,
      target_value=CASE WHEN EXISTS(SELECT 1 FROM merl.indicator_targets WHERE indicator_id=p_indicator_id AND target_type='final') THEN (SELECT coalesce(numeric_value,ordinal_value) FROM merl.indicator_targets WHERE indicator_id=p_indicator_id AND target_type='final' ORDER BY created_at,id LIMIT 1) ELSE target_value END,updated_at=now()
    WHERE id=p_indicator_id;
  END IF;
  IF p_changes ? 'progress' OR p_changes ? 'narrative' THEN
    IF p_progress_id IS NOT NULL THEN
      SELECT * INTO g FROM merl.indicator_progress WHERE id=p_progress_id AND indicator_id=p_indicator_id AND project_id=i.project_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Progress does not belong to this indicator'; END IF;
    ELSE
      g := NULL; g.id := gen_random_uuid(); g.project_id := i.project_id;
      g.indicator_id := p_indicator_id; g.schedule_status := 'on_schedule';
    END IF;
    patch := coalesce(p_changes->'progress','{}'::jsonb);
    IF jsonb_typeof(patch) <> 'object' OR EXISTS(
      SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT(k=ANY(ARRAY['reporting_period','period_target','actual_this_period','cumulative_actual','previous_value','achievement_pct','variance','performance_status','schedule_status','date_reported','variance_reason','corrective_action','area_council_name']))
    ) THEN RAISE EXCEPTION 'Invalid progress fields'; END IF;
    -- Check BOTH old and new periods before a period can be moved.
    IF u.role IS DISTINCT FROM 'system_admin' AND EXISTS(
      SELECT 1 FROM merl.reporting_periods rp WHERE rp.project_id=i.project_id AND rp.submission_status='approved'
      AND rp.period_label IN (g.reporting_period,patch->>'reporting_period')
    ) THEN RAISE EXCEPTION 'Reopen the approved reporting period before editing its results' USING ERRCODE='42501'; END IF;
    g := jsonb_populate_record(g,patch);
    IF nullif(btrim(g.reporting_period),'') IS NULL THEN RAISE EXCEPTION 'Select a reporting period to record progress or narrative'; END IF;
    IF NOT EXISTS(SELECT 1 FROM merl.reporting_periods WHERE project_id=i.project_id AND period_label=g.reporting_period)
       AND NOT EXISTS(SELECT 1 FROM merl.indicator_progress WHERE id=p_progress_id AND reporting_period=g.reporting_period)
    THEN RAISE EXCEPTION 'Create this reporting period in MERL Reporting first'; END IF;
    IF NOT(patch ? 'achievement_pct') AND (patch ? 'cumulative_actual' OR patch ? 'actual_this_period' OR patch ? 'period_target') THEN
      g.achievement_pct := coalesce(merl.calculate_indicator_achievement(p_indicator_id,coalesce(g.cumulative_actual,g.actual_this_period),g.period_target),g.achievement_pct);
      IF NOT(patch ? 'performance_status') THEN
        g.performance_status := merl.derive_performance_status(g.achievement_pct,g.period_target,coalesce(g.cumulative_actual,g.actual_this_period));
      END IF;
    END IF;
    IF p_progress_id IS NULL THEN
      INSERT INTO merl.indicator_progress(id,project_id,indicator_id,reporting_period,period_target,actual_this_period,cumulative_actual,previous_value,achievement_pct,variance,performance_status,schedule_status,date_reported,variance_reason,corrective_action,area_council_name,created_by,updated_by,reported_by,review_status)
      VALUES(g.id,i.project_id,p_indicator_id,g.reporting_period,g.period_target,g.actual_this_period,g.cumulative_actual,g.previous_value,g.achievement_pct,g.variance,g.performance_status,g.schedule_status,g.date_reported,g.variance_reason,g.corrective_action,g.area_council_name,u.id,u.id,u.id,'draft');
    ELSE
      UPDATE merl.indicator_progress SET reporting_period=g.reporting_period,
      period_target=g.period_target,
      actual_this_period=g.actual_this_period,
      cumulative_actual=g.cumulative_actual,
      previous_value=g.previous_value,
      achievement_pct=g.achievement_pct,
      variance=g.variance,
      performance_status=g.performance_status,
      schedule_status=g.schedule_status,
      date_reported=g.date_reported,
      variance_reason=g.variance_reason,
      corrective_action=g.corrective_action,
      area_council_name=g.area_council_name,updated_by=u.id,review_status='draft',approved_by=NULL,approved_at=NULL,published_at=NULL WHERE id=g.id;
    END IF;
    IF p_changes ? 'narrative' THEN
      patch := p_changes->'narrative';
      IF jsonb_typeof(patch) <> 'object' OR EXISTS(
        SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT(k=ANY(ARRAY['progress_summary','key_achievements','variance_explanation','challenges','corrective_actions','next_period_priorities','public_summary']))
      ) THEN RAISE EXCEPTION 'Invalid narrative fields'; END IF;
      SELECT * INTO n FROM merl.result_narratives WHERE indicator_progress_id=g.id FOR UPDATE;
      IF NOT FOUND THEN
        n := NULL; n.progress_summary := g.narrative; n.key_achievements := g.key_achievements;
        n.variance_explanation := g.variance_reason; n.corrective_actions := g.corrective_action;
        n.next_period_priorities := g.next_period_priorities;
      END IF;
      n := jsonb_populate_record(n,patch);
      INSERT INTO merl.result_narratives(project_id,indicator_progress_id,reporting_period,progress_summary,key_achievements,variance_explanation,challenges,corrective_actions,next_period_priorities,public_summary,created_by,review_status)
      VALUES(i.project_id,g.id,g.reporting_period,n.progress_summary,n.key_achievements,n.variance_explanation,n.challenges,n.corrective_actions,n.next_period_priorities,n.public_summary,u.id,'draft')
      ON CONFLICT(indicator_progress_id) DO UPDATE SET
        reporting_period=excluded.reporting_period,progress_summary=excluded.progress_summary,key_achievements=excluded.key_achievements,variance_explanation=excluded.variance_explanation,challenges=excluded.challenges,corrective_actions=excluded.corrective_actions,next_period_priorities=excluded.next_period_priorities,public_summary=excluded.public_summary,
        review_status='draft',approved_by=NULL,approved_at=NULL,updated_at=now();
      UPDATE merl.indicator_progress SET narrative=n.progress_summary,key_achievements=n.key_achievements,
        next_period_priorities=n.next_period_priorities WHERE id=g.id;
    ELSIF p_changes ? 'progress' THEN
      UPDATE merl.result_narratives SET reporting_period=g.reporting_period,review_status='draft',approved_by=NULL,approved_at=NULL,updated_at=now()
        WHERE indicator_progress_id=g.id;
    END IF;
  END IF;
  RETURN p_indicator_id;
END $$;
REVOKE ALL ON FUNCTION public.patch_results_framework_node(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.patch_results_framework_row(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.patch_results_framework_node(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patch_results_framework_row(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
