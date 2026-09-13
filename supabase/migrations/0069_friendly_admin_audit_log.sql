-- Make the administration audit history readable without losing its technical
-- identifiers. The UI already shows schema/table and record_id; this presentation
-- RPC now adds a friendly action/object/record label to the table text while
-- preserving the physical table name in brackets and the UUID in record_id.

CREATE OR REPLACE FUNCTION public.admin_audit_log(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_table text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  id bigint,
  schema_name text,
  table_name text,
  record_id uuid,
  action text,
  actor_name text,
  actor_role text,
  changed_at timestamptz,
  old_values jsonb,
  new_values jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'merl', 'public'
AS $function$
BEGIN
  IF NOT merl.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may read the audit log' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT a.*, u.full_name AS actor_full_name, u.role::text AS actor_role_txt
    FROM merl.audit_logs a
    LEFT JOIN merl.users u ON u.id = a.user_id
    WHERE (p_table IS NULL OR a.table_name = p_table)
      AND (p_action IS NULL OR a.action = p_action)
      AND (
        p_search IS NULL OR p_search = ''
        OR a.table_name ILIKE '%' || p_search || '%'
        OR a.app_user_name ILIKE '%' || p_search || '%'
        OR a.record_id::text ILIKE '%' || p_search || '%'
        OR a.old_values::text ILIKE '%' || p_search || '%'
        OR a.new_values::text ILIKE '%' || p_search || '%'
      )
  ), labelled AS (
    SELECT f.*,
      CASE f.action
        WHEN 'INSERT' THEN 'Created'
        WHEN 'UPDATE' THEN 'Updated'
        WHEN 'DELETE' THEN 'Deleted'
        ELSE initcap(lower(f.action))
      END AS action_label,
      CASE f.table_name
        WHEN 'projects' THEN 'project'
        WHEN 'project_activities' THEN 'activity'
        WHEN 'project_indicators' THEN 'indicator'
        WHEN 'framework_nodes' THEN 'result'
        WHEN 'reporting_periods' THEN 'reporting period'
        WHEN 'indicator_progress' THEN 'indicator progress'
        WHEN 'financial_progress' THEN 'financial progress'
        WHEN 'beneficiaries' THEN 'beneficiary record'
        WHEN 'risks_issues' THEN 'risk / issue'
        WHEN 'learning_updates' THEN 'learning update'
        WHEN 'evidence' THEN 'evidence record'
        WHEN 'users' THEN 'user'
        ELSE replace(f.table_name, '_', ' ')
      END AS object_label,
      COALESCE(
        NULLIF(f.new_values->>'code', ''), NULLIF(f.old_values->>'code', ''),
        NULLIF(f.new_values->>'acronym', ''), NULLIF(f.old_values->>'acronym', ''),
        NULLIF(f.new_values->>'period_label', ''), NULLIF(f.old_values->>'period_label', ''),
        NULLIF(f.new_values->>'name', ''), NULLIF(f.old_values->>'name', ''),
        NULLIF(f.new_values->>'title', ''), NULLIF(f.old_values->>'title', ''),
        NULLIF(f.new_values->>'full_name', ''), NULLIF(f.old_values->>'full_name', ''),
        NULLIF(f.new_values->>'email', ''), NULLIF(f.old_values->>'email', ''),
        CASE WHEN f.record_id IS NOT NULL THEN 'ID ' || left(f.record_id::text, 8) END,
        'record'
      ) AS record_label
    FROM filtered f
  )
  SELECT
    l.id,
    l.schema_name::text,
    (l.action_label || ' ' || l.object_label || ' · ' || l.record_label || ' [' || l.table_name || ']')::text,
    l.record_id,
    l.action::text,
    COALESCE(l.actor_full_name, l.app_user_name)::text,
    l.actor_role_txt,
    l.changed_at,
    l.old_values,
    l.new_values,
    (SELECT count(*) FROM filtered)
  FROM labelled l
  ORDER BY l.changed_at DESC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;
