CREATE OR REPLACE FUNCTION public.create_results_framework_indicator(p_project_id uuid,p_fields jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public AS $$
DECLARE i merl.project_indicators; v_id uuid;
BEGIN
 PERFORM merl.require_results_framework_editor(p_project_id);
 IF jsonb_typeof(p_fields)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE NOT(k=ANY(ARRAY['name','unit','baseline_value','target_value','framework_node_id','direction','aggregation_method','progress_method','official_reporting_frequency','means_of_verification','data_source','collection_method','disaggregation','assumptions','responsible_officer','is_qualitative','higher_is_better' ]))) THEN RAISE EXCEPTION 'Invalid indicator fields'; END IF;
 i := jsonb_populate_record(NULL::merl.project_indicators,p_fields);
 IF nullif(btrim(i.name),'') IS NULL THEN RAISE EXCEPTION 'Indicator name is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM merl.framework_nodes WHERE id=i.framework_node_id AND project_id=p_project_id) THEN RAISE EXCEPTION 'Select a result from this project'; END IF;
 INSERT INTO merl.project_indicators(project_id,code,name,unit,baseline_value,target_value,framework_node_id,direction,aggregation_method,progress_method,official_reporting_frequency,means_of_verification,data_source,collection_method,disaggregation,assumptions,responsible_officer,is_qualitative,higher_is_better,frequency)
 VALUES(p_project_id,merl.next_code_w(p_project_id,'indicator','IND',3),i.name,i.unit,i.baseline_value,i.target_value,i.framework_node_id,coalesce(i.direction,'increase'),coalesce(i.aggregation_method,'latest'),coalesce(i.progress_method,'auto'),i.official_reporting_frequency,i.means_of_verification,i.data_source,i.collection_method,i.disaggregation,i.assumptions,i.responsible_officer,coalesce(i.is_qualitative,false),coalesce(i.higher_is_better,true),i.official_reporting_frequency) RETURNING id INTO v_id;
 IF i.baseline_value IS NOT NULL THEN INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value) VALUES(v_id,'baseline','Baseline',i.baseline_value); END IF;
 IF i.target_value IS NOT NULL THEN INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value) VALUES(v_id,'final','Final',i.target_value); END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_results_framework_indicator(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_results_framework_indicator(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
