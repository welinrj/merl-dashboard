-- Publish the activity/indicator register and its final targets for the
-- category drilldown. Progress, evidence, internal notes and users stay private.
CREATE TABLE IF NOT EXISTS public.public_portal_indicator_details (
  indicator_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  project_name text NOT NULL,
  category_key text NOT NULL CHECK (category_key IN (
    'ecosystems','livelihoods','climate-risk','infrastructure','governance',
    'capacity','finance','learning-delivery','beneficiaries','other'
  )),
  indicator_code text,
  indicator_name text NOT NULL,
  target_value numeric,
  target_text text,
  unit text,
  published_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_portal_indicator_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_portal_indicator_details_read
  ON public.public_portal_indicator_details;
CREATE POLICY public_portal_indicator_details_read
  ON public.public_portal_indicator_details FOR SELECT TO anon, authenticated
  USING (true);
REVOKE ALL ON TABLE public.public_portal_indicator_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_portal_indicator_details TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.public_portal_indicator_details TO service_role;

CREATE OR REPLACE FUNCTION merl.refresh_public_indicator_categories() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
BEGIN
  TRUNCATE public.public_portal_indicator_categories,
    public.public_portal_indicator_details;

  INSERT INTO public.public_portal_indicator_details (
    indicator_id,project_id,project_name,category_key,indicator_code,
    indicator_name,target_value,target_text,unit,published_at
  )
  SELECT i.id,i.project_id,p.name::text,
    merl.classify_indicator_activity(
      p.code::text,i.code::text,i.name::text,n.node_code,n.title
    ),i.code::text,i.name::text,
    coalesce(t.numeric_value,i.target_value),
    nullif(btrim(t.text_value),'')::text,
    nullif(btrim(i.unit::text),''),now()
  FROM merl.project_indicators i
  JOIN merl.projects p ON p.id=i.project_id
  LEFT JOIN merl.framework_nodes n ON n.id=i.framework_node_id
  LEFT JOIN LATERAL (
    SELECT it.numeric_value,it.text_value
    FROM merl.indicator_targets it
    WHERE it.indicator_id=i.id AND it.target_type='final'
    ORDER BY it.period_end DESC NULLS LAST,it.updated_at DESC,it.id
    LIMIT 1
  ) t ON true
  WHERE coalesce(p.code::text,'') <> 'AUDIT-2026'
    AND nullif(btrim(i.name::text),'') IS NOT NULL;

  INSERT INTO public.public_portal_indicator_categories (
    project_id,category_key,indicator_count,published_at
  )
  SELECT project_id,category_key,count(*)::integer,now()
  FROM public.public_portal_indicator_details
  GROUP BY project_id,category_key;
END;
$$;

-- Final target edits must update the public detail at the same time as
-- indicator and project edits update category totals.
DROP TRIGGER IF EXISTS refresh_public_indicator_categories_snapshot
  ON merl.indicator_targets;
CREATE TRIGGER refresh_public_indicator_categories_snapshot
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON merl.indicator_targets
  FOR EACH STATEMENT EXECUTE FUNCTION merl.trg_refresh_public_indicator_categories();

SELECT merl.refresh_public_indicator_categories();
