# Environment Variables Reference — DoCC M&E Monitoring Platform (DMP)

Two `.env` files exist in a production deployment. **Neither is ever
committed to source control.**

| File | Configures | Template |
|---|---|---|
| `<repo>/.env` | Application tier (frontend build + proxy) | `.env.example` |
| `/opt/supabase/docker/.env` | Self-hosted Supabase backend | supplied by the supabase/docker distribution |

For local development, the frontend also reads `frontend/.env.local`
(template: `frontend/.env.example`).

---

## 1. Application tier (`<repo>/.env`)

Read by `docker compose` and passed to the frontend image as build
arguments. Because Vite bakes them into the static JavaScript bundle, **you
must rebuild the frontend image after changing them**
(`docker compose up -d --build frontend`).

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Public URL of the Supabase API gateway. Production: `https://api.dmp.gov.vu`. Staging: the Supabase Cloud project URL. |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anonymous (public) API key. Safe for the browser — access control is enforced by Row-Level Security. |

## 2. Frontend development (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_ENV` | yes | `production` disables demo mode. Anything else enables the demo accounts and mock data. The production Docker build hard-sets `production`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | yes | As above. |
| `VITE_DEMO_ADMIN_PASS`, `VITE_DEMO_SENIOR_PASS`, `VITE_DEMO_MEO_PASS`, `VITE_DEMO_MGR_PASS`, `VITE_DEMO_STAFF_PASS` | demo only | Passwords for the five demo accounts (`admin`, `senior`, `meo`, `manager`, `staff`). Ignored in production mode. |
| `VITE_DEMO_ADMIN_TOTP_CODE` | demo only | Static 6-digit MFA fallback for the demo admin until a real TOTP factor is enrolled. |

## 3. Supabase backend (`/opt/supabase/docker/.env`)

The authoritative list ships with the supabase/docker distribution; these
are the values Government ICT must set and protect (see migration runbook
§5.1 for generation commands):

| Variable | Sensitivity | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | **secret** | Superuser password for PostgreSQL. |
| `JWT_SECRET` | **secret** | Signs all auth tokens. Changing it invalidates every session and the two API keys below. |
| `ANON_KEY` | public | Browser API key derived from `JWT_SECRET`. Also goes into the application `.env`. |
| `SERVICE_ROLE_KEY` | **secret** | Bypasses Row-Level Security. Server-side use only. Never place in the frontend or share outside ICT. |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | **secret** | Supabase Studio admin console login. |
| `SITE_URL` | public | `https://dmp.gov.vu` — used in auth email links. |
| `API_EXTERNAL_URL` | public | `https://api.dmp.gov.vu`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME` | secret | Outbound email for password resets and invitations. Use the Government mail relay. |

## 4. Handling rules

1. Store all secrets in the Government password manager; share on a
   need-to-know basis only.
2. `.env` files are listed in `.gitignore` — keep it that way.
3. Rotate `POSTGRES_PASSWORD`, `SERVICE_ROLE_KEY`, and the Studio password
   when an administrator leaves.
4. After rotating `JWT_SECRET`, regenerate `ANON_KEY`/`SERVICE_ROLE_KEY`,
   update the application `.env`, and rebuild the frontend image.
