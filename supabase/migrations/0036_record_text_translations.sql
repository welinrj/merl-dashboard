-- =============================================================================
-- 0036_record_text_translations.sql
--
-- The portal's interface is bilingual, but the records inside it were not: a
-- French user saw French column headings above English project names, because
-- a project's name is a row in merl.projects, not a key in the i18n bundle.
--
-- Design
-- ------
-- Each table carrying officer-entered prose gains one `i18n jsonb` column,
-- rather than a side table keyed by (table, row, column). The column travels
-- with the row, which means:
--
--   * RLS is already correct. A translation of a project you cannot read lives
--     inside a row you cannot read. A side table would have needed its own
--     policy re-deriving the visibility rules of fifteen different tables.
--   * The frontend gets translations in the payload it already fetches — no
--     second round trip, no id list to correlate.
--
-- Shape:
--
--   {"fr": {"name": "Sécurité de l'eau à Torba"},
--    "_src": {"fr": {"name": "Water Security Torba"}},
--    "_origin": {"fr": {"name": "machine"}}}
--
-- `_src` records the English that was translated. When the officer edits the
-- English, the stored French no longer matches its source and the backlog picks
-- it up again — so a translation is never silently left describing older text.
--
-- `_origin` is 'machine' or 'human'. A human correction is never overwritten by
-- the translator, which is the whole point of letting officers fix the wording:
-- these names print into the official generated reports.
--
-- What is deliberately NOT translated
-- -----------------------------------
-- Person names, organisation and agency names, acronyms, project codes, file
-- names and paths, and place names (province, island, area council, community).
-- Machine-translating "Water Security Torba" as a phrase is fine; translating
-- the province name inside it is not. Controlled vocabularies (status, theme,
-- document type…) are not here either — those are UI strings and already
-- resolve through the `opt` namespace in the frontend bundle.
-- =============================================================================

-- ── 1. Registry of translatable fields ───────────────────────────────────────
-- One source of truth, read by the view patcher below, the backlog function,
-- and the translation worker.
--
-- Scoped to fields the portal actually displays. Several older tables
-- (merl.indicators, merl.activities, merl.activity_progress, merl.ld_events,
-- merl.project_profiles) carry prose but are not surfaced by any current route,
-- and their views expose no row id to hang a translation on. Translating them
-- would spend translation-API budget on text nobody can read. Add a row here
-- when a route starts showing one.

CREATE TABLE IF NOT EXISTS merl.translatable_fields (
    table_name   text NOT NULL,
    column_name  text NOT NULL,
    view_name    text NOT NULL,   -- the public.v_* the frontend reads it through
    PRIMARY KEY (table_name, column_name)
);

COMMENT ON TABLE merl.translatable_fields IS
    'Columns of officer-entered prose that carry a translation in their row''s i18n column.';

INSERT INTO merl.translatable_fields (table_name, column_name, view_name) VALUES
    -- Project profile (Form 1)
    ('projects',            'name',                  'v_projects'),
    ('projects',            'description',           'v_projects'),
    ('projects',            'review_note',           'v_projects'),
    -- Results framework (Form 2)
    ('objectives',          'statement',             'v_objectives'),
    ('objectives',          'notes',                 'v_objectives'),
    ('outcomes',            'statement',             'v_outcomes'),
    ('outputs',             'statement',             'v_outputs'),
    -- Indicators (Form 3)
    ('project_indicators',  'name',                  'v_project_indicators'),
    ('project_indicators',  'definition',            'v_project_indicators'),
    ('project_indicators',  'means_of_verification', 'v_project_indicators'),
    ('project_indicators',  'verification_method',   'v_project_indicators'),
    ('project_indicators',  'collection_method',     'v_project_indicators'),
    ('project_indicators',  'data_source',           'v_project_indicators'),
    ('project_indicators',  'disaggregation',        'v_project_indicators'),
    ('project_indicators',  'assumptions',           'v_project_indicators'),
    -- Indicator progress (Form 4)
    ('indicator_progress',  'narrative',             'v_indicator_progress'),
    ('indicator_progress',  'variance_reason',       'v_indicator_progress'),
    ('indicator_progress',  'corrective_action',     'v_indicator_progress'),
    -- Activities (Form 5)
    ('project_activities',  'name',                  'v_project_activities'),
    ('project_activities',  'description',           'v_project_activities'),
    ('project_activities',  'key_achievement',       'v_project_activities'),
    ('project_activities',  'issue_delay',           'v_project_activities'),
    ('project_activities',  'next_action',           'v_project_activities'),
    -- Financial progress (Form 6)
    ('financial_progress',  'narrative',             'v_financial_progress'),
    -- Locations (Form 7) — only the free-text intervention, never the place names
    ('project_locations',   'intervention',          'v_project_locations'),
    -- Beneficiaries & GEDSI (Form 8)
    ('beneficiaries',       'comments',              'v_beneficiaries'),
    ('beneficiaries',       'other_vulnerable',      'v_beneficiaries'),
    ('beneficiaries',       'data_source',           'v_beneficiaries'),
    -- Risks & issues (Form 9)
    ('risks_issues',        'description',           'v_risks_issues'),
    ('risks_issues',        'mitigation',            'v_risks_issues'),
    ('risks_issues',        'latest_update',         'v_risks_issues'),
    -- Learning & results (Form 10)
    ('learning_updates',    'key_achievements',      'v_learning_updates'),
    ('learning_updates',    'major_results',         'v_learning_updates'),
    ('learning_updates',    'challenges',            'v_learning_updates'),
    ('learning_updates',    'lessons_learned',       'v_learning_updates'),
    ('learning_updates',    'successful_approaches', 'v_learning_updates'),
    ('learning_updates',    'what_did_not_work',     'v_learning_updates'),
    ('learning_updates',    'corrective_actions',    'v_learning_updates'),
    ('learning_updates',    'recommendations',       'v_learning_updates'),
    ('learning_updates',    'emerging_opportunities','v_learning_updates'),
    ('learning_updates',    'next_period_priorities','v_learning_updates'),
    ('learning_updates',    'success_story',         'v_learning_updates'),
    -- Reporting period workflow (Form 11) — what the reviewer writes back
    ('reporting_periods',   'review_comments',       'v_reporting_periods'),
    ('reporting_periods',   'reopen_reason',         'v_reporting_periods'),
    -- Evidence register (Form 12)
    ('evidence',            'title',                 'v_evidence'),
    ('evidence',            'description',           'v_evidence')
ON CONFLICT (table_name, column_name) DO UPDATE SET view_name = EXCLUDED.view_name;

-- Drop any registry row whose table or column no longer exists, so the backlog
-- never asks the worker for a field that cannot be read.
DELETE FROM merl.translatable_fields tf
WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'merl'
      AND c.table_name   = tf.table_name
      AND c.column_name  = tf.column_name
);

-- ── 2. The i18n column on every registered table ─────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOR t IN SELECT DISTINCT table_name FROM merl.translatable_fields LOOP
        EXECUTE format(
            'ALTER TABLE merl.%I ADD COLUMN IF NOT EXISTS i18n jsonb NOT NULL DEFAULT ''{}''::jsonb', t);
        EXECUTE format(
            'COMMENT ON COLUMN merl.%I.i18n IS %L', t,
            'Per-language translations of this row''s prose columns. See 0036.');
    END LOOP;
END $$;

-- ── 2a. Setting a nested key ─────────────────────────────────────────────────
-- jsonb_set(..., create_missing => true) only creates the FINAL key: given
-- '{}' and the path {fr,name} it creates nothing at all, because `fr` does not
-- exist to hold `name`. Every row starts at '{}', so every write would have
-- been silently dropped. This builds the intermediate objects on the way down.

CREATE OR REPLACE FUNCTION merl.jsonb_put(target jsonb, path text[], value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_head  text;
    v_child jsonb;
BEGIN
    target := COALESCE(target, '{}'::jsonb);
    IF cardinality(path) = 0 THEN RETURN value; END IF;
    IF cardinality(path) = 1 THEN RETURN target || jsonb_build_object(path[1], value); END IF;

    v_head  := path[1];
    v_child := target -> v_head;
    IF v_child IS NULL OR jsonb_typeof(v_child) <> 'object' THEN v_child := '{}'::jsonb; END IF;

    RETURN target || jsonb_build_object(
        v_head, merl.jsonb_put(v_child, path[2:cardinality(path)], value));
END;
$$;

-- ── 3. Expose i18n through the views the frontend already reads ──────────────
-- CREATE OR REPLACE VIEW cannot insert a column mid-list, so each view is
-- rebuilt with its existing definition wrapped as a subquery and the new column
-- appended. That keeps every existing column in its existing position — the
-- frontend, the RPCs and PostgREST all keep working — without this migration
-- having to restate fifteen view bodies that live in earlier migrations.

DO $$
DECLARE
    r         RECORD;
    v_def     text;
    v_grants  text;
BEGIN
    FOR r IN
        SELECT DISTINCT tf.table_name, tf.view_name
        FROM merl.translatable_fields tf
        WHERE to_regclass('public.' || tf.view_name) IS NOT NULL
    LOOP
        -- Already patched by an earlier run of this migration.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = r.view_name AND column_name = 'i18n'
        ) THEN CONTINUE; END IF;

        -- The view must expose the source row's id for the join to work.
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = r.view_name AND column_name = 'id'
        ) THEN
            RAISE WARNING 'skipping %: no id column to join i18n on', r.view_name;
            CONTINUE;
        END IF;

        v_def := rtrim(btrim(pg_get_viewdef(('public.' || r.view_name)::regclass, true)), ';');

        SELECT string_agg(format('GRANT %s ON public.%I TO %I', privilege_type, r.view_name, grantee), '; ')
          INTO v_grants
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = r.view_name;

        EXECUTE format('DROP VIEW public.%I CASCADE', r.view_name);
        EXECUTE format($f$
            CREATE VIEW public.%I WITH (security_invoker = on) AS
            SELECT base.*, COALESCE(src.i18n, '{}'::jsonb) AS i18n
            FROM (%s) base
            LEFT JOIN merl.%I src ON src.id = base.id
        $f$, r.view_name, v_def, r.table_name);

        IF v_grants IS NOT NULL THEN EXECUTE v_grants; END IF;
    END LOOP;
END $$;

-- ── 3a. Letting a translation through the guards 0035 put on these tables ────
-- 0035 enforces project scoping and the approval lock with row triggers, and a
-- translation is written by an UPDATE on the same rows. Both guards stopped it:
--
--   * The scope trigger resolves the caller through merl.current_db_user().
--     The translation worker connects as the platform's service_role, which is
--     not a portal user and has no assignment rows by construction, so every
--     write it attempted was rejected. service_role already bypasses RLS — it
--     is trusted server-side code, not a person — so it passes scope too.
--
--   * The approval lock freezes a period's records once approved. That is about
--     the reported figures, not about which language they are read in: locking
--     translation out would leave every approved period permanently English,
--     which is precisely the reporting a French-speaking officer most needs.
--     An update that changes nothing but the i18n column is therefore allowed
--     through; any update that touches a reported value is refused exactly as
--     before.

CREATE OR REPLACE FUNCTION merl.require_project_access(p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = merl, public AS $$
BEGIN
    -- The platform's own server-side identity, not a portal user.
    IF auth.role() = 'service_role' THEN RETURN; END IF;
    -- A NULL project id carries no scope to check (and the NOT NULL constraints
    -- catch it where it matters), so let it through rather than masking the
    -- real error with a permissions message.
    IF p_project_id IS NULL THEN RETURN; END IF;
    IF NOT merl.can_access_project(p_project_id) THEN
        RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE = '42501';
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION merl.fn_block_locked_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public AS $$
DECLARE v_pid UUID; v_period TEXT; v_actor merl.users;
BEGIN
    -- A translation-only update leaves every reported value untouched. The
    -- row's own bookkeeping is ignored in the comparison: these tables carry a
    -- BEFORE UPDATE trigger that stamps updated_at, and it sorts ahead of this
    -- one by name, so by the time we look the timestamp has already moved.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'i18n' - 'updated_at' - 'updated_by')
         = (to_jsonb(OLD) - 'i18n' - 'updated_at' - 'updated_by') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN v_pid := OLD.project_id; v_period := OLD.reporting_period;
    ELSE                     v_pid := NEW.project_id; v_period := NEW.reporting_period; END IF;
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
END; $$;

-- ── 4. What still needs translating ──────────────────────────────────────────
-- A field is in the backlog when it has text and no translation, or when the
-- English has been edited since the stored translation was made. Human
-- corrections are excluded: the officer's wording stands until they change the
-- English underneath it.

CREATE OR REPLACE FUNCTION public.translation_backlog(
    p_lang  text DEFAULT 'fr',
    p_limit int  DEFAULT 200
)
RETURNS TABLE (
    table_name  text,
    row_id      uuid,
    column_name text,
    source_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    r    RECORD;
    v_sql text;
    v_parts text[] := '{}';
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'translation_backlog is for the translation worker only';
    END IF;
    IF p_lang !~ '^[a-z]{2}$' THEN
        RAISE EXCEPTION 'Unsupported language code: %', p_lang;
    END IF;

    FOR r IN SELECT tf.table_name, tf.column_name FROM merl.translatable_fields tf LOOP
        v_parts := v_parts || format(
            $q$
            SELECT %L::text AS table_name, s.id AS row_id, %L::text AS column_name,
                   s.%I::text AS source_text
            FROM merl.%I s
            WHERE s.%I IS NOT NULL
              AND btrim(s.%I) <> ''
              AND COALESCE(s.i18n #>> ARRAY['_origin', %L, %L], 'machine') <> 'human'
              AND COALESCE(s.i18n #>> ARRAY['_src', %L, %L], '') IS DISTINCT FROM s.%I::text
            $q$,
            r.table_name, r.column_name, r.column_name,
            r.table_name,
            r.column_name, r.column_name,
            p_lang, r.column_name,
            p_lang, r.column_name, r.column_name);
    END LOOP;

    IF cardinality(v_parts) = 0 THEN RETURN; END IF;

    v_sql := array_to_string(v_parts, ' UNION ALL ') || format(' LIMIT %s', p_limit);
    RETURN QUERY EXECUTE v_sql;
END;
$$;

REVOKE ALL ON FUNCTION public.translation_backlog(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.translation_backlog(text, int) TO service_role;

-- ── 5. Writing a translation back ────────────────────────────────────────────

-- The worker's path. Refuses to touch a field an officer has corrected, and
-- stamps the English it translated so staleness can be detected later.
CREATE OR REPLACE FUNCTION public.save_machine_translation(
    p_table   text,
    p_row_id  uuid,
    p_column  text,
    p_lang    text,
    p_text    text,
    p_source  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_rows int;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'save_machine_translation is for the translation worker only';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM merl.translatable_fields
                   WHERE table_name = p_table AND column_name = p_column) THEN
        RAISE EXCEPTION 'Not a translatable field: %.%', p_table, p_column;
    END IF;
    IF p_lang !~ '^[a-z]{2}$' THEN
        RAISE EXCEPTION 'Unsupported language code: %', p_lang;
    END IF;

    EXECUTE format($u$
        UPDATE merl.%I SET i18n =
            merl.jsonb_put(
              merl.jsonb_put(
                merl.jsonb_put(i18n, ARRAY[$1, $2],            to_jsonb($3::text)),
                                     ARRAY['_src', $1, $2],    to_jsonb($4::text)),
                                     ARRAY['_origin', $1, $2], to_jsonb('machine'::text))
        WHERE id = $5
          AND %I::text = $4                          -- the English has not moved on
          AND COALESCE(i18n #>> ARRAY['_origin', $1, $2], 'machine') <> 'human'
    $u$, p_table, p_column)
    USING p_lang, p_column, p_text, p_source, p_row_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    -- No row updated is normal: the record was edited or corrected while the
    -- translation was in flight. The backlog will offer it again.
END;
$$;

REVOKE ALL ON FUNCTION public.save_machine_translation(text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_machine_translation(text, uuid, text, text, text, text) TO service_role;

-- The officer's path: correct the wording, and it stops being the machine's.
-- Writes go through the same permission gate as editing the record itself —
-- merl.require_editor() raises if the caller may not write to this project.
CREATE OR REPLACE FUNCTION public.save_content_translation(
    p_table   text,
    p_row_id  uuid,
    p_column  text,
    p_lang    text,
    p_text    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_project uuid;
    v_source  text;
    v_has_project boolean;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM merl.translatable_fields
                   WHERE table_name = p_table AND column_name = p_column) THEN
        RAISE EXCEPTION 'Not a translatable field: %.%', p_table, p_column;
    END IF;
    IF p_lang !~ '^[a-z]{2}$' THEN
        RAISE EXCEPTION 'Unsupported language code: %', p_lang;
    END IF;

    -- Most translatable tables hang off a project; projects hang off themselves.
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'merl' AND table_name = p_table
                     AND column_name = 'project_id')
      INTO v_has_project;

    IF v_has_project THEN
        EXECUTE format('SELECT project_id, %I::text FROM merl.%I WHERE id = $1', p_column, p_table)
            INTO v_project, v_source USING p_row_id;
    ELSIF p_table = 'projects' THEN
        EXECUTE format('SELECT id, %I::text FROM merl.projects WHERE id = $1', p_column)
            INTO v_project, v_source USING p_row_id;
    ELSE
        EXECUTE format('SELECT NULL::uuid, %I::text FROM merl.%I WHERE id = $1', p_column, p_table)
            INTO v_project, v_source USING p_row_id;
    END IF;

    IF v_source IS NULL AND v_project IS NULL THEN
        RAISE EXCEPTION 'Record not found.';
    END IF;

    -- Correcting a translation is editing the record, so it takes the same
    -- permission: a role that may write, and access to the owning project.
    -- merl.require_editor() checks only the role — the project scope is
    -- merl.can_access_project(), the same predicate the record RPCs use.
    PERFORM merl.require_editor();
    IF v_project IS NOT NULL AND NOT merl.can_access_project(v_project) THEN
        RAISE EXCEPTION 'You do not have access to this project.';
    END IF;

    EXECUTE format($u$
        UPDATE merl.%I SET i18n =
            merl.jsonb_put(
              merl.jsonb_put(
                merl.jsonb_put(i18n, ARRAY[$1, $2],            to_jsonb($3::text)),
                                     ARRAY['_src', $1, $2],    to_jsonb($4::text)),
                                     ARRAY['_origin', $1, $2], to_jsonb('human'::text))
        WHERE id = $5
    $u$, p_table)
    USING p_lang, p_column, p_text, COALESCE(v_source, ''), p_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_content_translation(text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_content_translation(text, uuid, text, text, text) TO authenticated;

-- Hand a correction back to the machine: clears the human flag so the worker
-- picks the field up again on its next pass.
CREATE OR REPLACE FUNCTION public.reset_content_translation(
    p_table  text,
    p_row_id uuid,
    p_column text,
    p_lang   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_project uuid; v_has_project boolean;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM merl.translatable_fields
                   WHERE table_name = p_table AND column_name = p_column) THEN
        RAISE EXCEPTION 'Not a translatable field: %.%', p_table, p_column;
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'merl' AND table_name = p_table
                     AND column_name = 'project_id')
      INTO v_has_project;

    IF v_has_project THEN
        EXECUTE format('SELECT project_id FROM merl.%I WHERE id = $1', p_table)
            INTO v_project USING p_row_id;
    ELSIF p_table = 'projects' THEN
        v_project := p_row_id;
    END IF;

    PERFORM merl.require_editor();
    IF v_project IS NOT NULL AND NOT merl.can_access_project(v_project) THEN
        RAISE EXCEPTION 'You do not have access to this project.';
    END IF;

    EXECUTE format($u$
        UPDATE merl.%I
           SET i18n = (COALESCE(i18n, '{}'::jsonb) #- ARRAY[$1, $2]
                                                   #- ARRAY['_src', $1, $2]
                                                   #- ARRAY['_origin', $1, $2])
         WHERE id = $3
    $u$, p_table)
    USING p_lang, p_column, p_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_content_translation(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_content_translation(text, uuid, text, text) TO authenticated;

-- ── 6. How much is translated ────────────────────────────────────────────────
-- Read by the Admin panel so someone can see whether the worker is keeping up
-- without opening a shell on the server.

CREATE OR REPLACE FUNCTION public.translation_coverage(p_lang text DEFAULT 'fr')
RETURNS TABLE (translated bigint, pending bigint, corrected bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    r RECORD;
    v_parts text[] := '{}';
BEGIN
    FOR r IN SELECT tf.table_name, tf.column_name FROM merl.translatable_fields tf LOOP
        v_parts := v_parts || format(
            $q$
            SELECT (s.i18n #>> ARRAY[%L, %L]) IS NOT NULL AS has_tr,
                   COALESCE(s.i18n #>> ARRAY['_origin', %L, %L], '') = 'human' AS is_human
            FROM merl.%I s
            WHERE s.%I IS NOT NULL AND btrim(s.%I) <> ''
            $q$,
            p_lang, r.column_name, p_lang, r.column_name,
            r.table_name, r.column_name, r.column_name);
    END LOOP;

    IF cardinality(v_parts) = 0 THEN
        RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint; RETURN;
    END IF;

    RETURN QUERY EXECUTE format($s$
        SELECT count(*) FILTER (WHERE has_tr),
               count(*) FILTER (WHERE NOT has_tr),
               count(*) FILTER (WHERE is_human)
        FROM (%s) f
    $s$, array_to_string(v_parts, ' UNION ALL '));
END;
$$;

GRANT EXECUTE ON FUNCTION public.translation_coverage(text) TO authenticated, service_role;
