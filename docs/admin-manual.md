# System Administrator Guide — DoCC M&E Monitoring Platform (DMP)

**For:** the DoCC system administrator and Government ICT officers who
operate the platform after handover.

Companion documents: [architecture.md](architecture.md) (how the system is
built), [docker-compose-reference.md](docker-compose-reference.md) (service
operations), [backup-restore.md](backup-restore.md) (backups),
[migration-runbook.md](migration-runbook.md) (initial deployment).

---

## Table of Contents

1. [Administrator Responsibilities](#1-administrator-responsibilities)
2. [User Management](#2-user-management)
3. [Project Configuration](#3-project-configuration)
4. [Dataset Oversight](#4-dataset-oversight)
5. [Audit Log](#5-audit-log)
6. [Platform Health Checks](#6-platform-health-checks)
7. [Troubleshooting](#7-troubleshooting)
8. [Security Duties](#8-security-duties)

---

## 1. Administrator Responsibilities

- Create, modify, and deactivate user accounts; assign roles.
- Configure projects and their results chains.
- Monitor the audit log and dataset workflow.
- Keep backups running and test restores (backup-restore.md).
- Apply application updates (docker-compose-reference.md §4).
- Enforce the security duties in §8.

Sign-in is by email and password for every role, including the System
Administrator. There is no second factor (OTP/MFA): the administrator
creates each account with a password and users sign in directly with those
credentials.

## 2. User Management

Open **Admin → Users** (visible only to the System Administrator role).

### 2.1 Creating a user

1. Press **Add user**.
2. Enter the person's name, work email, and username.
3. Choose the role — grant the *least* role that lets them do their job:

| Role | Give to |
|---|---|
| System Administrator | ICT officer(s) operating the platform — keep to 1–2 people |
| DoCC Senior Officer | Directors/senior officers who approve and publish reports |
| DoCC M&E Officer | Officers managing indicators, reviewing datasets, generating reports |
| Project Manager | Managers of specific projects (assign their projects) |
| Field Staff | Staff who submit field data |

4. Save. The user receives an invitation/password email (requires SMTP —
   environment-variables.md §3).

### 2.2 Password resets, deactivation

- **Reset:** Admin → Users → user → **Send password reset**. In an
  emergency, a temporary password can be set directly in Supabase Studio →
  Authentication.
- **Deactivate** (staff departure): toggle the user inactive — this blocks
  login immediately. Do **not** delete users: their identity is referenced
  by the audit log and past submissions.

### 2.3 Sign-in

All roles sign in with email and password only — there is no OTP/MFA step.
Issue each user their password when you create the account (§2.1) and reset
it from Admin → Users when needed (§2.2).

## 3. Project Configuration

Open **Admin → Projects**:

- Create a project with its code, title, funding source, and dates.
- Define the RBM results chain: goal → outcomes → outputs → activities,
  and indicators with baseline, target, unit, and required GEDSI
  disaggregation.
- Assign Project Managers to their projects.

The L&D Fund project is the initial configuration; additional DoCC-managed
projects can be added the same way — the platform is designed to hold the
whole portfolio.

## 4. Dataset Oversight

The approval workflow (user-manual.md §6) is operated by M&E Officers, but
the administrator should periodically check **Datasets** for submissions
stuck in *under review*, and reassign or remind reviewers.

## 5. Audit Log

Every create/update/delete is recorded in `merl.audit_logs` — who, when,
and what changed. The table is INSERT-only; even the administrator cannot
edit or delete entries (deletion privileges are revoked at the database
level).

To inspect it directly:

```sql
-- via: docker exec -it supabase-db psql -U postgres -d postgres
SELECT created_at, user_id, action, table_name
FROM merl.audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

Review monthly, and always investigate: logins you cannot explain, bulk
deletions, role changes you did not make.

## 6. Platform Health Checks

Weekly, on the server:

```bash
cd /opt/dmp && docker compose ps            # all healthy?
cd /opt/supabase/docker && docker compose ps
df -h                                        # ≥ 20 % disk free?
ls -lt /opt/dmp-backups | head              # last night's dump exists?
```

In the browser: log in, open the Dashboard, and generate one report.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site unreachable | proxy down / certificate expired | `docker compose ps`; `docker compose logs proxy`; renew certs (runbook §8) |
| Site loads, login fails for everyone | Supabase auth service | `cd /opt/supabase/docker && docker compose logs auth`; restart: `docker compose restart auth` |
| Login works, data missing / spinners | PostgREST or database | `docker compose logs rest db`; check disk space |
| Uploads fail | storage service or file > 50 MB | `docker compose logs storage`; check nginx `client_max_body_size` |
| Notifications not appearing | realtime service | `docker compose restart realtime` |
| Password-reset emails not arriving | SMTP settings | check SMTP_* values (environment-variables.md §3) and the mail relay |

Escalation: if a fix isn't found within the agreed response time, contact
the maintenance contact listed in the handover checklist
(ict-handover-checklist.md §5).

## 8. Security Duties

1. **Least privilege** — audit the user list quarterly; deactivate departed
   staff the same week.
2. **Passwords** — issue strong passwords, reset them promptly on request,
   and rotate the administrator password on any suspected exposure. (Sign-in
   is password-only; there is no OTP/MFA.)
3. **Secrets** — keep `.env` files at permissions 600; rotate secrets per
   environment-variables.md §4.
4. **Updates** — apply OS security patches monthly
   (`sudo apt-get update && sudo apt-get upgrade`); update Docker images
   quarterly (docker-compose-reference.md §4) after a backup.
5. **Backups** — confirm the daily dump exists each week; run a restore
   drill twice a year (backup-restore.md §5).
6. **Data sovereignty** — production data stays on the Government server.
   Do not copy the database to personal machines or third-party services.

## Loading the village register

Form 7's Community / Site field offers villages from `merl.ref_villages`. It
starts empty and fills as officers add the villages they cannot find, but a
proper gazetteer from the Vanuatu National Statistics Office or the Department
of Lands is worth loading once.

A shapefile is several files, not one. Convert it first:

```bash
ogr2ogr -f GeoJSON -t_srs EPSG:4326 villages.geojson villages.shp
```

Then check what the importer makes of it before writing anything:

```bash
node scripts/import-villages.mjs villages.geojson --dry-run
```

It reports how many features it found, how many it could name, and which
province values it could not recognise. When that looks right, load it:

```bash
export SUPABASE_URL=https://api.dmp.gov.vu
export SUPABASE_SERVICE_ROLE_KEY=...      # from /opt/supabase/docker/.env
node scripts/import-villages.mjs villages.geojson
```

Re-running is safe: villages are matched on name within island and updated in
place, so a corrected file can simply be imported again. The import overwrites
coordinates an officer pinned by hand — that is what makes it authoritative.

CSV works too, with a header row naming the columns (`name`, `province`,
`island`, `latitude`, `longitude`). The importer accepts the usual spellings of
each, so an export from GIS software normally needs no editing.

To see how much of the register is in use:

```sql
SELECT source, count(*), count(latitude) AS with_coordinates
FROM merl.ref_villages GROUP BY source;
```
