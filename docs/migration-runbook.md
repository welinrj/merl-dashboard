# Migration Runbook — Supabase Cloud to the Vanuatu Government Server

**System:** DoCC M&E Monitoring Platform (DMP)
**Audience:** Government of Vanuatu ICT officers and the system administrator
**Goal:** move the entire platform — application, database, files, and user
accounts — onto a Government-controlled server so that **all data resides
within Government of Vanuatu systems**.

Follow every step in order. Each step ends with a verification command —
confirm it before proceeding.

**Estimated total time:** 4–8 hours
**Required personnel:**
- System administrator with access to the Supabase Cloud project (source)
- GoV ICT officer with sudo access on the destination server
- DoCC Project Manager (for post-migration smoke testing, §10)

---

## Table of Contents

1. [Pre-Migration Checklist](#1-pre-migration-checklist)
2. [Install Docker on the Government Server](#2-install-docker-on-the-government-server)
3. [Export Data from Supabase Cloud](#3-export-data-from-supabase-cloud)
4. [DNS Configuration](#4-dns-configuration)
5. [Deploy Self-Hosted Supabase](#5-deploy-self-hosted-supabase)
6. [Restore the Database](#6-restore-the-database)
7. [Restore Storage Files](#7-restore-storage-files)
8. [Deploy the DMP Application Stack](#8-deploy-the-dmp-application-stack)
9. [Recreate User Accounts](#9-recreate-user-accounts)
10. [Post-Migration Smoke Test](#10-post-migration-smoke-test)
11. [Rollback Procedure](#11-rollback-procedure)

---

## 1. Pre-Migration Checklist

### 1.1 Destination server requirements

- [ ] **CPU:** minimum 4 cores (8 recommended)
- [ ] **RAM:** minimum 8 GB (16 GB recommended)
- [ ] **Disk:** minimum 60 GB free on the volume holding Docker data
- [ ] **OS:** Ubuntu 22.04 LTS (preferred) or 20.04 LTS
- [ ] **Static IP address** assigned
- [ ] Ports **80** and **443** reachable from user networks
- [ ] Outbound internet access during installation (to pull Docker images),
      or a pre-loaded image bundle prepared by the consultant

### 1.2 Access and credentials

- [ ] sudo account on the destination server
- [ ] Supabase Cloud project owner access (Dashboard + database password)
- [ ] Control of the DNS zone that will host the two hostnames (§4)
- [ ] This repository cloned or copied onto the server

### 1.3 Freeze window

- [ ] Announce a data-entry freeze to all users for the migration window.
      Data entered on the cloud after the export in §3 will not carry over.

## 2. Install Docker on the Government Server

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

**Verify:**

```bash
sudo docker run --rm hello-world     # prints "Hello from Docker!"
docker compose version               # v2.x
```

Create the shared network used by both compose stacks (once):

```bash
sudo docker network create dmp-net
```

## 3. Export Data from Supabase Cloud

Perform on any machine with `pg_dump` 15+ and the Supabase CLI (or use the
consultant's workstation).

### 3.1 Database dump

Get the connection string from Supabase Dashboard → Project Settings →
Database → Connection string (URI, port 5432 "direct" connection).

```bash
pg_dump "$SOURCE_DB_URI" \
  --schema=merl --schema=auth --schema=storage \
  --format=custom --no-owner --no-privileges \
  --file=dmp_backup_$(date +%Y%m%d).dump
```

**Verify:** `pg_restore --list dmp_backup_*.dump | head` lists schema objects.

### 3.2 Storage files

Download every bucket (evidence photos, PDFs) using the Supabase CLI:

```bash
supabase storage ls --linked                 # list buckets
mkdir -p storage_export
# repeat for each bucket name shown above:
supabase storage cp -r ss:///<bucket> ./storage_export/<bucket> --linked
```

**Verify:** `du -sh storage_export/` roughly matches the storage usage shown
in the Supabase dashboard.

### 3.3 Transfer to the Government server

```bash
scp dmp_backup_*.dump storage_export.tar.gz ictofficer@<SERVER_IP>:/opt/dmp-migration/
```

## 4. DNS Configuration

Create two records in the Government DNS zone, both pointing to the server's
static IP:

| Hostname | Type | Value |
|---|---|---|
| `dmp.gov.vu` (or agreed final name) | A | `<SERVER_IP>` |
| `api.dmp.gov.vu` | A | `<SERVER_IP>` |

**Verify:** `dig +short dmp.gov.vu` and `dig +short api.dmp.gov.vu` return
the server IP. If the final domain differs, update `server_name` lines in
`nginx/nginx.conf` and `VITE_SUPABASE_URL` in `.env` accordingly.

## 5. Deploy Self-Hosted Supabase

Supabase publishes an official Docker distribution. Deploy it as its own
compose project:

```bash
cd /opt
sudo git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
sudo cp .env.example .env
```

### 5.1 Generate secrets

Set strong values in `/opt/supabase/docker/.env` — at minimum:

| Variable | How to generate |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `JWT_SECRET` | `openssl rand -base64 48` (min 32 chars) |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | Generate from `JWT_SECRET` using the Supabase self-hosting key generator (see supabase.com/docs/guides/self-hosting → "Generate API keys") |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio admin login — strong unique values |
| `SITE_URL` | `https://dmp.gov.vu` |
| `API_EXTERNAL_URL` | `https://api.dmp.gov.vu` |

Record all values in the Government password manager. `ANON_KEY` is also
needed in §8; `SERVICE_ROLE_KEY` must **never** be placed in the frontend.

### 5.2 Join the shared network and start

Add to the bottom of `/opt/supabase/docker/docker-compose.yml`:

```yaml
networks:
  default:
    name: dmp-net
    external: true
```

Then start:

```bash
sudo docker compose pull
sudo docker compose up -d
```

**Verify:** `sudo docker compose ps` shows all services healthy, and
`curl -s http://localhost:8000/auth/v1/health` returns a JSON health response.

## 6. Restore the Database

```bash
sudo docker cp /opt/dmp-migration/dmp_backup_*.dump supabase-db:/tmp/dmp.dump
sudo docker exec -it supabase-db bash -c \
  'pg_restore -U postgres -d postgres --no-owner --no-privileges /tmp/dmp.dump'
```

Some `ALTER ... OWNER` warnings are normal. If restoring into a fresh
database instead of a cloud dump, apply the repository schema directly:

```bash
sudo docker exec -i supabase-db psql -U postgres -d postgres \
  < supabase/migrations/0001_initial_schema.sql
```

**Verify:**

```bash
sudo docker exec -it supabase-db psql -U postgres -d postgres \
  -c "SELECT count(*) FROM merl.indicators;"
```

Row counts should match the source project.

## 7. Restore Storage Files

```bash
cd /opt/dmp-migration && tar xzf storage_export.tar.gz
```

Re-upload each bucket with the Supabase CLI pointed at the new server, or
copy directly into the storage volume documented in the supabase/docker
distribution. Recreate buckets first via Studio (§5 `DASHBOARD_USERNAME`
login at `http://<SERVER_IP>:8000` → Storage) with **private** visibility.

**Verify:** open Studio → Storage; spot-check that evidence files open.

## 8. Deploy the DMP Application Stack

```bash
cd /opt && sudo git clone <this-repository-url> dmp && cd dmp
sudo cp .env.example .env
```

Edit `/opt/dmp/.env`:

```
VITE_SUPABASE_URL=https://api.dmp.gov.vu
VITE_SUPABASE_ANON_KEY=<ANON_KEY from §5.1>
```

### 8.1 TLS certificates — with internet access (Let's Encrypt)

```bash
sudo docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d dmp.gov.vu -d api.dmp.gov.vu \
  --email ict@vanuatu.gov.vu --agree-tos --no-eff-email
```

### 8.2 TLS certificates — air-gapped (Government-issued or self-signed)

Remove the `certbot` service from `docker-compose.yml`, then place the
certificate and key where nginx expects them (or adjust the two
`ssl_certificate*` paths in `nginx/nginx.conf`):

```bash
sudo docker volume create docc-dmp_certbot_certs
# copy fullchain.pem + privkey.pem into
#   /var/lib/docker/volumes/docc-dmp_certbot_certs/_data/live/dmp.gov.vu/
```

### 8.3 Start

```bash
sudo docker compose up -d --build
```

**Verify:** `sudo docker compose ps` shows `dmp-frontend` healthy and
`dmp-proxy` running; `curl -kI https://localhost` returns `200` or `301`.

## 9. Recreate User Accounts

Auth users restored with the §6 dump keep their IDs but **passwords may need
resetting** depending on JWT secret differences. Recommended:

1. Sign in to Studio → Authentication.
2. Confirm all expected users are present.
3. Trigger a password-reset email for each user, or set temporary passwords
   and require change at first login.
4. Confirm the System Administrator re-enrols TOTP MFA (mandatory).

**Verify:** each role can log in at `https://dmp.gov.vu` and sees only the
modules allowed for their role (see user-manual.md §2).

## 10. Post-Migration Smoke Test

With the DoCC Project Manager present, confirm:

- [ ] Login works for all five roles; MFA prompt appears for the administrator
- [ ] Dashboard KPIs show the migrated data
- [ ] A test CSV uploads, appears in Datasets, and can be approved
- [ ] An uploaded photo/PDF opens from evidence links
- [ ] The Analysis map renders province markers/layers
- [ ] A report generates and downloads (PDF and Excel)
- [ ] `merl.audit_logs` recorded the test actions:
      `SELECT * FROM merl.audit_logs ORDER BY created_at DESC LIMIT 5;`
- [ ] HTTPS padlock valid on both hostnames

Sign-off: ______________________ (DoCC Project Manager)   Date: __________

## 11. Rollback Procedure

The cloud project remains untouched until decommissioned, so rollback is
DNS-only:

1. Point users back at the previous URL (or revert the DNS records).
2. Lift the data-entry freeze on the cloud project.
3. Investigate, fix, and re-attempt the migration in a new window.

Only after two weeks of stable production on the Government server should
the Supabase Cloud project be paused and then deleted (export a final backup
first, per backup-restore.md).
