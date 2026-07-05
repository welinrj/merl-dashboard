# Backup and Restore — DoCC M&E Monitoring Platform (DMP)

**Audience:** Government of Vanuatu ICT officers
**Scope:** production deployment on the Government server (self-hosted
Supabase). During the staging phase on Supabase Cloud, backups are handled
by the Supabase platform.

---

## 1. What must be backed up

| Asset | Where it lives | Method |
|---|---|---|
| Database (all M&E data, users, audit log) | `supabase-db` container volume | `pg_dump` (§2) |
| Storage files (photos, PDFs, evidence) | supabase storage volume | file copy (§3) |
| Configuration | `/opt/dmp/.env`, `/opt/supabase/docker/.env`, `nginx/nginx.conf` | file copy (§3) |
| Application code | Git repository (GitHub) | already versioned |

## 2. Database backup

### 2.1 Manual backup

```bash
sudo docker exec supabase-db pg_dump -U postgres -d postgres \
  --format=custom --no-owner \
  > /opt/dmp-backups/dmp_$(date +%Y%m%d_%H%M).dump
```

### 2.2 Scheduled daily backup (recommended)

Create `/opt/dmp-backups/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/opt/dmp-backups
STAMP=$(date +%Y%m%d_%H%M)

docker exec supabase-db pg_dump -U postgres -d postgres \
  --format=custom --no-owner > "$BACKUP_DIR/dmp_$STAMP.dump"

# keep 30 days of daily dumps
find "$BACKUP_DIR" -name 'dmp_*.dump' -mtime +30 -delete
```

Install it:

```bash
sudo mkdir -p /opt/dmp-backups && sudo chmod 700 /opt/dmp-backups
sudo chmod +x /opt/dmp-backups/backup.sh
sudo crontab -e
# add:  0 2 * * *  /opt/dmp-backups/backup.sh
```

**Verify** (monthly): `pg_restore --list` on the newest dump, and §5 restore
drill at least twice a year.

## 3. Files and configuration backup

Weekly (add to the same cron script if desired):

```bash
STAMP=$(date +%Y%m%d)
# Supabase storage volume — bucket files
sudo tar czf /opt/dmp-backups/storage_$STAMP.tar.gz \
  -C /opt/supabase/docker volumes/storage
# Configuration (contains secrets — keep permissions 600)
sudo tar czf /opt/dmp-backups/config_$STAMP.tar.gz \
  /opt/dmp/.env /opt/supabase/docker/.env /opt/dmp/nginx/nginx.conf
sudo chmod 600 /opt/dmp-backups/config_$STAMP.tar.gz
```

> The storage volume path may differ between supabase/docker releases —
> confirm with `docker inspect supabase-storage | grep -A3 Mounts`.

## 4. Off-server copies

A backup on the same disk protects against mistakes, not disasters
(cyclones are precisely the context of this project). At minimum weekly,
copy `/opt/dmp-backups/` to one of:

- a second Government server in a different building (`rsync -avz` over SSH)
- an encrypted external drive stored by DoCC
- Government-approved off-site storage

## 5. Restore procedures

### 5.1 Restore the database (data loss / corruption)

```bash
# 1. Stop the app tier so no writes occur
cd /opt/dmp && sudo docker compose down

# 2. Restore into the running database
sudo docker cp /opt/dmp-backups/dmp_YYYYMMDD_HHMM.dump supabase-db:/tmp/restore.dump
sudo docker exec supabase-db pg_restore -U postgres -d postgres \
  --clean --if-exists --no-owner /tmp/restore.dump

# 3. Restart the app tier
sudo docker compose up -d
```

**Verify:** row counts and newest `audit_logs` timestamps match expectations.

### 5.2 Restore storage files

```bash
sudo tar xzf /opt/dmp-backups/storage_YYYYMMDD.tar.gz \
  -C /opt/supabase/docker
cd /opt/supabase/docker && sudo docker compose restart storage
```

### 5.3 Full server rebuild (disaster recovery)

1. Provision a new server meeting migration-runbook.md §1.1.
2. Follow the runbook §2 (Docker) and §5 (self-hosted Supabase), restoring
   `/opt/supabase/docker/.env` from the config backup **instead of
   generating new secrets** — this keeps existing API keys and sessions
   valid.
3. Restore the database (§5.1) and storage files (§5.2).
4. Deploy the app stack (runbook §8) using the backed-up `/opt/dmp/.env`.
5. Update DNS to the new server IP and run the smoke test (runbook §10).

**Recovery time objective:** ≤ 1 working day with backups in hand.
**Recovery point objective:** ≤ 24 hours (daily database dumps).
