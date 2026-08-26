# Applying migrations 0034 – 0037 to production

Production (`https://api.dmp.gov.vu`) is a self-hosted Supabase under Docker
Compose on the government server, so these are applied from a shell on that box
in the same way as `docc-go-live-runbook.md` §3 — not from any cloud console.

Everything below was rehearsed against staging on 2026-08-26. Where staging
threw something unexpected, it is called out rather than smoothed over.

| Migration | What it does | Why it matters |
|---|---|---|
| `0034` | Restores `COALESCE` on `upsert_project`'s budget and category | Without it, saving Form 1 with an empty budget fails a NOT NULL constraint |
| `0035` | Project scoping on every write path, approval lock, input validation | Enforces the role model server-side |
| `0036` | `i18n` column on 14 tables + translation RPCs | Record text in French |
| `0037` | Village gazetteer, `village_id` on locations, location status vocabulary | The Locations form's village picker |

---

## 0. Read this first — the one that will bite you

**`0037` calls `merl.validate_or_warn`, which may not exist.** That helper was
added to `0035` *after* some databases had already run `0035`. Staging was in
exactly that state, and `0037` would have aborted part-way.

Check before you start:

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT count(*) AS validate_or_warn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'merl' AND p.proname = 'validate_or_warn';"
```

If that returns `0` **and** `0035` is already applied, create the helper before
`0037` (§3 step 2). If you are applying `0035` fresh from this repo, it defines
the helper itself and there is nothing to do.

---

## 1. Pre-flight

Establish what is already there. Nothing here writes.

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_project'
      AND pg_get_functiondef(p.oid) ILIKE '%COALESCE(p_budget_vuv%')      AS has_0034,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='merl' AND p.proname='fn_enforce_project_scope')      AS has_0035,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='merl' AND table_name='projects' AND column_name='i18n') AS has_0036,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='merl' AND table_name='ref_villages')             AS has_0037,
  (SELECT max(pronargs) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_project_location')     AS location_args;
"
```

`location_args = 11` means `0037` has not run; `12` means it has.

**Two conditions `0036` and `0037` depend on.** Both were clean on staging;
check them rather than assume.

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
-- (a) 0036 rebuilds 14 views with DROP VIEW ... CASCADE. Anything depending on
--     them would be dropped and NOT recreated. Expect zero rows.
WITH targets(v) AS (VALUES
 ('v_projects'),('v_objectives'),('v_outcomes'),('v_outputs'),('v_project_activities'),
 ('v_project_indicators'),('v_indicator_progress'),('v_risks_issues'),('v_beneficiaries'),
 ('v_learning_updates'),('v_evidence'),('v_reporting_periods'),('v_project_locations'))
SELECT DISTINCT t.v AS dropped_view, dependent.relname AS would_also_be_dropped
FROM targets t
JOIN pg_class target ON target.relname = t.v
JOIN pg_namespace tn ON tn.oid = target.relnamespace AND tn.nspname='public'
JOIN pg_depend d ON d.refobjid = target.oid
JOIN pg_rewrite rw ON rw.oid = d.objid
JOIN pg_class dependent ON dependent.oid = rw.ev_class
WHERE dependent.relname <> t.v;
"

sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
-- (b) 0037 constrains project_locations.status. Anything outside this list is
--     mapped by the migration where it recognises the spelling, and reported as
--     a WARNING where it does not. Look before you run it.
SELECT COALESCE(status,'(null)') AS status, count(*)
  FROM merl.project_locations GROUP BY 1 ORDER BY 2 DESC;
"
```

Values `0037` maps automatically: `ongoing`, `in progress`, `in-progress`,
`active`, `started`, `implementing`, `complete`, `done`, `finished`,
`not started`, `planned`, `pipeline`, `pending`, `late`, `behind`, `on hold`,
`paused`, `suspended`, `canceled`, `dropped`. Anything else keeps its value,
stays readable, and is named in a warning — the form just cannot offer it until
someone sets it from the list.

---

## 2. Back up (mandatory)

Follow `docc-go-live-runbook.md` §2. Do not skip it: `0036` drops and recreates
views, and `0037` rewrites `project_locations.status` in place.

```bash
sudo docker exec -t supabase-db pg_dump -U postgres -d postgres \
  --clean --if-exists > /opt/dmp/backups/pre-0034-0037-$(date +%F-%H%M).sql
```

---

## 3. Apply, in order

```bash
cd /opt/dmp && git pull        # ensure 0034–0037 are present
```

**Step 1 — 0034 and 0035.** Skip either if pre-flight showed it already applied;
both are idempotent, so re-running is safe if you are unsure.

```bash
for f in 0034_fix_upsert_project_not_null 0035_scoping_locks_and_validation; do
  echo "── $f"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < supabase/migrations/$f.sql || { echo "ABORTED on $f"; break; }
done
```

**Step 2 — the `validate_or_warn` prerequisite**, only if §0 returned `0`:

```bash
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE OR REPLACE FUNCTION merl.validate_or_warn(p_table text, p_constraint text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_bad bigint;
BEGIN
    EXECUTE format('ALTER TABLE merl.%I VALIDATE CONSTRAINT %I', p_table, p_constraint);
EXCEPTION WHEN check_violation THEN
    EXECUTE format('SELECT count(*) FROM merl.%I WHERE NOT (%s)', p_table,
        (SELECT pg_get_expr(conbin, conrelid) FROM pg_constraint
          WHERE conrelid = ('merl.' || p_table)::regclass AND conname = p_constraint))
    INTO v_bad;
    RAISE WARNING
      'Constraint %.% is enforced for new data but % existing row(s) break it. '
      'Clean those rows, then run: ALTER TABLE merl.% VALIDATE CONSTRAINT %;',
      p_table, p_constraint, v_bad, p_table, p_constraint;
END;
$$;
SQL
```

**Step 3 — 0036 and 0037.**

```bash
for f in 0036_record_text_translations 0037_village_gazetteer; do
  echo "── $f"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < supabase/migrations/$f.sql || { echo "ABORTED on $f"; break; }
done
```

`WARNING` lines are expected and are not failures — they name rows a constraint
could not validate, or an unmapped location status. `ERROR` with
`ON_ERROR_STOP=1` is a failure: nothing after it ran.

---

## 4. Verify

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT count(*) FROM merl.translatable_fields)                          AS registry_rows,      -- 46
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='merl' AND column_name='i18n')                      AS tables_with_i18n,   -- 14
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND column_name='i18n' AND table_name LIKE 'v_%') AS views_with_i18n, -- 14
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='merl' AND table_name='ref_villages')               AS ref_villages,       -- 1
  (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_project_location')      AS location_args,      -- 12, ends p_village_id
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_project_location')      AS location_fn_count,  -- 1 (old 11-arg dropped)
  (SELECT convalidated FROM pg_constraint
    WHERE conname='project_locations_status_check')                        AS status_validated;
"
```

**And confirm the data did not move:**

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
SELECT (SELECT count(*) FROM merl.projects)            AS projects,
       (SELECT count(*) FROM merl.project_locations)   AS locations,
       (SELECT count(*) FROM merl.indicator_progress)  AS indicator_progress,
       (SELECT count(*) FROM merl.reporting_periods)   AS periods;"
```

Compare against the same query run before §3. The migrations add columns and
functions; they must not change these counts.

**Every RPC the forms call must resolve** — this is what catches a half-applied
chain:

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
WITH needed(name) AS (VALUES
  ('add_village'),('import_villages'),('create_objective'),('create_outcome'),('create_output'),
  ('delete_project_activity'),('delete_project_indicator'),('delete_project_location'),
  ('list_assignable_users'),('update_objective'),('update_outcome'),('update_output'),
  ('upsert_project'),('upsert_project_activity_full'),('upsert_project_indicator'),
  ('upsert_project_location'),('upsert_reporting_period'),('upsert_indicator_progress'),
  ('upsert_financial_progress'),('upsert_beneficiaries'),('upsert_risk_issue'),
  ('upsert_learning_update'),('upsert_evidence'),('submit_reporting_period'),
  ('review_reporting_period'),('log_report_run'),('translation_backlog'),
  ('save_machine_translation'),('save_content_translation'),
  ('reset_content_translation'),('translation_coverage'))
SELECT count(*) FILTER (WHERE ok) AS present, count(*) FILTER (WHERE NOT ok) AS missing,
       COALESCE(string_agg(name,', ') FILTER (WHERE NOT ok),'none') AS missing_names
FROM (SELECT n.name, EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname=n.name) AS ok FROM needed n) x;"
```

Expect **31 present, 0 missing**.

---

## 5. Smoke test in the portal

1. Sign in as an administrator.
2. **Project Setup → Locations** → edit a location → the Community box offers a
   dropdown, and Save succeeds. *(This is the one that was broken on staging
   before `0037`: the frontend sends `p_village_id`, the old 11-argument
   function rejected the whole call, and the officer got a raw schema-cache
   error. The frontend now retries without the argument, so it works either way
   — but only `0037` makes the village link actually save.)*
3. **Project Setup → Project Profile** → save with the budget left blank. Should
   succeed (that is `0034`).
4. Switch to **FR**. Record text stays English until the translate worker runs —
   that is expected, not a failed migration.

---

## 6. If something goes wrong

`ON_ERROR_STOP=1` means the failing file stopped at the error and later files
never ran. Fix the reported line and re-run **that file**; all four are written
to be re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`).

Restore only if the database is left inconsistent:

```bash
sudo docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/dmp/backups/pre-0034-0037-<timestamp>.sql
```

---

## 7. After the migrations

- **Create real accounts for each role** through Administration → Users. Staging
  had no sign-in-capable account for M&E Officer, Data Entry or Viewer, which
  left the review workflow unexercised. Check production for the same gap:

  ```bash
  sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
    SELECT role::text, count(*) FILTER (WHERE auth_user_id IS NOT NULL) AS can_sign_in
      FROM merl.users WHERE active GROUP BY role ORDER BY role::text;"
  ```

- **Translation stays dormant** until `TRANSLATE_PROVIDER`, `TRANSLATE_API_KEY`
  and `SUPABASE_SERVICE_ROLE_KEY` are set in the server `.env` and
  `translate-service` is started. The service-role key belongs only there —
  never in a frontend build.

- **The village register starts empty.** Officers fill it as they go; an
  authoritative import runs through
  `node scripts/import-villages.mjs <file> --dry-run` first.
