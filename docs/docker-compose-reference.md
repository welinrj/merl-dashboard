# Docker Compose Reference — DoCC M&E Monitoring Platform (DMP)

Operational reference for the two compose projects that run the platform on
the Government server. For first-time setup order, see
[migration-runbook.md](migration-runbook.md).

---

## 1. The two stacks

| Stack | Location | Services |
|---|---|---|
| **docc-dmp** (this repo) | `/opt/dmp` | `frontend`, `proxy`, `certbot` |
| **supabase** (official distribution) | `/opt/supabase/docker` | `db` (PostgreSQL 15 + PostGIS), `auth`, `rest`, `realtime`, `storage`, `kong`, `studio`, and supporting services |

Both join the shared external Docker network **`dmp-net`** (created once
with `docker network create dmp-net`), which is how the proxy reaches
`supabase-kong:8000`.

## 2. Service reference (docc-dmp stack)

### frontend (`dmp-frontend`)

- Multi-stage build: `node:20-alpine` compiles the Vite bundle, then
  `nginx:alpine` serves the static files on internal port **3000** as a
  non-root user.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` are **build arguments** —
  changing them requires `docker compose up -d --build frontend`.
- Healthcheck: HTTP GET on `:3000` every 30 s.

### proxy (`dmp-proxy`)

- `nginx:1.27-alpine`, the only container with published ports
  (**80**, **443**). TLS termination for both hostnames.
- Config: `nginx/nginx.conf` (mounted read-only). Reload after edits:
  `docker compose exec proxy nginx -s reload`.

### certbot (`dmp-certbot`)

- Renews Let's Encrypt certificates every 12 h via webroot challenge.
- Remove this service on an air-gapped server (runbook §8.2).

## 3. Common operations

```bash
cd /opt/dmp

docker compose ps                        # status + health
docker compose logs -f --tail=100 proxy  # follow logs for one service
docker compose up -d --build frontend    # rebuild after frontend change
docker compose restart proxy             # restart one service
docker compose down                      # stop the app tier (Supabase unaffected)
```

```bash
cd /opt/supabase/docker

docker compose ps
docker compose logs -f db
docker exec -it supabase-db psql -U postgres -d postgres   # SQL console
```

## 4. Update procedure (application release)

1. `cd /opt/dmp && git pull` (or copy the release archive).
2. Apply any new SQL migration files from `supabase/migrations/` in order:
   `docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/000X_*.sql`
3. `docker compose up -d --build frontend`
4. Run the smoke test (migration-runbook.md §10, abbreviated as needed).

## 5. Boot order and recovery

After a server reboot, Docker restarts everything (`restart: unless-stopped`).
If the proxy comes up before Supabase, requests to `api.*` fail for a few
seconds until Kong is healthy — no action needed. Full manual cold start:

```bash
docker network inspect dmp-net >/dev/null 2>&1 || docker network create dmp-net
cd /opt/supabase/docker && docker compose up -d
cd /opt/dmp             && docker compose up -d
```

## 6. Resource footprint (reference)

| Stack | Typical RAM | Disk |
|---|---|---|
| docc-dmp | < 200 MB | image ~80 MB |
| supabase | 2–4 GB | images ~3 GB + database volume growth |

Monitor with `docker stats` and keep at least 20 % disk headroom
(see backup-restore.md for volume management).
