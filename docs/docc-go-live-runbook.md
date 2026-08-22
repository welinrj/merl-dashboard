# DoCC Standardised MERL — Production Go-Live Runbook

**System:** DoCC M&E Monitoring Platform (DMP)
**Change:** upgrade the database to the **DoCC Standardised MERL Project Data
Collection Form** (12 modules) and perform the controlled **operational-data
reset** (delete project/MERL data, **keep all user accounts, credentials,
roles and permissions**).
**Audience:** Government of Vanuatu ICT officer with `sudo` on the server, and
the system administrator.
**Applies to:** the self-hosted production Supabase on the Government server
(`https://api.dmp.gov.vu`). The public GitHub Pages build
(`welinrj.github.io/merl-dashboard`) already runs against the migrated
**staging** Cloud database and needs no action here.

> Follow every step in order. Each step ends with a verification you must
> confirm before continuing. **Estimated time:** 1–2 hours (plus backup time).

---

## 0. What this change does

- Adds the new DoCC modules to the `merl` schema (migrations **0029** and
  **0030**): `indicator_progress`, `financial_progress`, `project_locations`,
  `beneficiaries`, `risks_issues`, `learning_updates`, `reporting_periods`,
  `evidence`, the Vanuatu geographic reference tables, extra descriptive
  columns on `project_indicators` and `project_activities`, the widened
  `projects.status` vocabulary, and the setup/reporting RPCs.
- **Deletes all operational data** (projects and everything below them, plus
  the legacy single-project MERL tables and `public.datasets`) so the portal
  starts clean on the new structure.
- **Preserves** `merl.users`, the entire `auth` schema, roles, permissions and
  the immutable `merl.audit_logs`.

The frontend for the DoCC forms/dashboards/reports is already merged to `main`
and consumes only the `public.v_*` views and RPCs these migrations create, so
no data-contract change is needed beyond applying the migrations.

---

## 1. Pre-flight checklist

- [ ] Announce a **data-entry freeze** to all users for the maintenance window.
- [ ] Confirm the server is healthy: `sudo docker compose ps` (in
      `/opt/supabase/docker`) shows `supabase-db` **healthy**.
- [ ] Confirm the current schema is at migration **0028** (the last
      pre-DoCC migration):

  ```bash
  sudo docker exec -it supabase-db psql -U postgres -d postgres -c \
    "SELECT to_regclass('merl.project_indicators')  AS have_0009,
            to_regclass('merl.indicator_progress')  AS have_0029;"
  ```

  Expect `have_0009` populated and `have_0029` **NULL** (0029 not yet applied).
- [ ] Confirm you have the repository on the server at `/opt/dmp` (or clone it):
      `cd /opt/dmp && git pull` so `supabase/migrations/0029_*.sql` and
      `0030_*.sql` are present.

---

## 2. Back up first (mandatory)

Do **not** skip this — the reset in §4 is irreversible.

```bash
mkdir -p /opt/dmp-backups
sudo docker exec -t supabase-db pg_dump -U postgres -d postgres \
  --schema=merl --schema=auth --schema=storage \
  --format=custom --no-owner --no-privileges \
  -f /tmp/dmp_predocc_$(date +%Y%m%d_%H%M).dump
sudo docker cp supabase-db:/tmp/dmp_predocc_$(date +%Y%m%d_%H%M).dump /opt/dmp-backups/
```

**Verify:** `ls -lh /opt/dmp-backups/` shows a non-trivial `.dump` file, and

```bash
sudo docker exec -it supabase-db bash -c \
  'pg_restore --list /tmp/dmp_predocc_*.dump | head'
```

lists `merl` and `auth` objects. Keep this file until the new system has run
stably for at least two weeks.

Also record current counts to compare afterwards:

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c \
  "SELECT (SELECT count(*) FROM merl.users)     AS users,
          (SELECT count(*) FROM auth.users)     AS auth_users,
          (SELECT count(*) FROM merl.projects)  AS projects;"
```

Note the **users** and **auth_users** numbers — they must be unchanged at §5.

---

## 3. Apply the DoCC migrations

Apply the two migration files in order. They are additive (`CREATE ... IF NOT
EXISTS` / `CREATE OR REPLACE`) and safe to run once on the 0028 schema.

```bash
cd /opt/dmp
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/0029_docc_merl_structure.sql
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/0030_docc_setup_upserts.sql
```

**Verify** all new objects exist:

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT
    (SELECT count(*) FROM information_schema.tables
       WHERE table_schema='merl' AND table_name IN
       ('indicator_progress','financial_progress','project_locations','beneficiaries',
        'risks_issues','learning_updates','reporting_periods','evidence',
        'ref_provinces','ref_islands','ref_area_councils'))          AS new_tables,   -- expect 11
    (SELECT count(*) FROM information_schema.routines
       WHERE routine_schema='public' AND routine_name IN
       ('upsert_project','upsert_project_indicator','upsert_project_activity_full',
        'list_assignable_users','reset_operational_data'))           AS new_rpcs,     -- expect 5
    (SELECT count(*) FROM merl.ref_provinces)                        AS provinces;   -- expect 6
"
```

Expect `new_tables = 11`, `new_rpcs = 5`, `provinces = 6`. If `ON_ERROR_STOP`
aborted, fix the reported line, or restore from §2 and re-attempt.

---

## 4. Reset operational data (destructive — keeps users/auth)

This deletes all project/MERL operational data and leaves accounts, roles and
authentication untouched.

> **Note:** `public.reset_operational_data('RESET')` is gated on the app's
> signed-in admin (`merl.is_admin()`), which a `psql` session does not have.
> A DB superuser therefore runs the **equivalent** script below directly. It
> truncates the same tables and never touches `merl.users` or `auth.*`.

```bash
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'merl.projects',            -- cascades to objectives/outcomes/outputs/activities/
                                --   indicators/progress/locations/beneficiaries/risks/
                                --   learning/reporting_periods/evidence
    'merl.project_profiles','merl.code_counters',
    'merl.srf_activities',      -- cascades to srf photos/reports
    -- legacy single-project MERL tables (migration 0001)
    'merl.indicators','merl.indicator_values','merl.activities','merl.activity_milestones',
    'merl.financial_transactions','merl.ld_events','merl.community_engagements',
    'merl.learning_entries','merl.document_uploads'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE %s RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
  IF to_regclass('public.datasets') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.datasets RESTART IDENTITY CASCADE';
  END IF;
END $$;
SQL
```

> `merl.users`, `auth.*`, the geographic reference tables and the immutable
> `merl.audit_logs` are intentionally **not** listed and remain intact.

---

## 5. Post-reset verification

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT (SELECT count(*) FROM merl.users)         AS users,        -- unchanged vs §2
         (SELECT count(*) FROM auth.users)         AS auth_users,   -- unchanged vs §2
         (SELECT count(*) FROM merl.projects)      AS projects,     -- 0
         (SELECT count(*) FROM merl.indicators)    AS legacy_ind,   -- 0
         (SELECT count(*) FROM public.datasets)    AS datasets;     -- 0
"
```

- [ ] `users` and `auth_users` **match the numbers recorded in §2** (no
      accounts lost).
- [ ] `projects`, `legacy_ind`, `datasets` are **0**.
- [ ] The System Administrator can still sign in at `https://dmp.gov.vu`.

---

## 6. Frontend

The DoCC frontend is already in `main`. If the Government server serves the app
from this repo (`/opt/dmp`), rebuild it so the merged UI is live:

```bash
cd /opt/dmp && git pull
sudo docker compose up -d --build dmp-frontend
```

**Verify:** sign in and confirm the nav shows **Dashboards · Project Setup ·
MERL · Reports** (admins also **Administration**), and that Project Setup can
create a project (it receives an auto `DCC-YYYY-NNN` code).

---

## 7. Smoke test (with the DoCC Project Manager)

- [ ] Create a test project in **Project Setup** → it gets a `DCC-YYYY-NNN` code.
- [ ] Add an objective → outcome → output, one indicator, one activity, one location.
- [ ] In **MERL** create a reporting period, add indicator progress and a risk.
- [ ] **Dashboards → Executive Portfolio** shows the project and its numbers.
- [ ] **Reports → Project Progress Report** renders and prints to PDF.
- [ ] Approve the reporting period as an authorised user; a Field Staff user cannot.
- [ ] `SELECT * FROM merl.audit_logs ORDER BY changed_at DESC LIMIT 5;` shows the
      test actions.
- [ ] **Delete the test project** afterwards (Admin Panel / Project Setup) so
      production starts truly clean.

Sign-off: ______________________ (DoCC Project Manager)   Date: __________

---

## 8. Rollback

If §3–§5 go wrong, restore the pre-change database from the §2 backup:

```bash
sudo docker cp /opt/dmp-backups/dmp_predocc_*.dump supabase-db:/tmp/rollback.dump
# Drop & recreate the affected schemas from the dump (merl/auth/storage),
# or restore into a fresh database and re-point the stack. Because the dump was
# --format=custom, use pg_restore with --clean --if-exists on the target:
sudo docker exec -it supabase-db bash -c \
  'pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-privileges /tmp/rollback.dump'
```

Then lift the data-entry freeze and re-attempt in a new window after fixing the
cause. The migrations themselves are additive; the only irreversible step is §4,
which the §2 backup fully covers.
