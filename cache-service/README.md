# DMP cache-service — Redis caching sidecar

Serves the platform's expensive, **organisation-wide** aggregate results from a
shared Redis cache so the database doesn't recompute them for every user.

Only non-sensitive aggregate endpoints are cached here — they're read with the
public **anon** key from the `v_srf_analytics` view (granted to `anon`), which
exposes aggregate figures only. Row-level, RLS-protected data continues to go
directly from the browser to Supabase with the user's own token; it is never
cached in this service.

## Endpoints

All are exposed to the app at same-origin `/api-cache/*` (see `nginx.conf`).

| Method | Path             | Description                                                        |
| ------ | ---------------- | ----------------------------------------------------------------- |
| GET    | `/health`        | Liveness + store kind + cached endpoint names.                    |
| GET    | `/srf-analytics` | Cached SRF analytics (status split, budget by theme / focus area). Sets `X-Cache: HIT\|MISS`. |
| POST   | `/invalidate`    | Force-drops cached keys. Requires header `x-invalidate-secret` when `INVALIDATE_SECRET` is set. |

On a cache **MISS** the service fetches once from Supabase PostgREST, stores the
result in Redis with a TTL, and returns it; subsequent requests are **HITs**
until the TTL expires or the row changes and an operator invalidates.

## Configuration (env)

| Variable            | Default                | Notes                                                        |
| ------------------- | ---------------------- | ------------------------------------------------------------ |
| `PORT`              | `8080`                 | HTTP port.                                                   |
| `REDIS_URL`         | `redis://redis:6379`   | Use `memory://` to run without Redis (single-node/degraded/tests). |
| `SUPABASE_URL`      | —                      | Required. Supabase base URL.                                 |
| `SUPABASE_ANON_KEY` | —                      | Required. Public anon key.                                   |
| `CACHE_TTL`         | `300`                  | Seconds a cached aggregate is served before refetch.         |
| `INVALIDATE_SECRET` | _(empty)_              | Shared secret for `POST /invalidate`.                        |

## Resilience

Caching is best-effort: if Redis is unavailable the store **fails open**
(treats every read as a MISS and serves straight from the origin), so the
endpoint keeps working — just without the cache speed-up. The frontend
additionally falls back to reading the DB materialized view (or computing
client-side) when the whole sidecar is absent, e.g. on Supabase Cloud staging.

## Test

```bash
npm install
npm test   # in-memory store + stubbed origin; verifies MISS→HIT, TTL, invalidate
```
