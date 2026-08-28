# Environment Variables Reference — DoCC M&E Monitoring Platform (DMP)

Two `.env` files exist in a production deployment. **Neither is ever
committed to source control.**

| File | Configures | Template |
|---|---|---|
| `<repo>/.env` | Application tier (frontend build + proxy) | `.env.example` |
| `/opt/supabase/docker/.env` | Self-hosted Supabase backend | supplied by the supabase/docker distribution |

For local development, the frontend also reads `frontend/.env.local`
(template: `frontend/.env.example`). Contributor tooling — the 21st.dev MCP
server registered in `.mcp.json` — reads one variable from the developer's own
shell instead; see §6.

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

### Record translation worker (optional)

The portal is bilingual. Its interface ships translated in the frontend bundle;
the *records* — project names, indicator statements, risk narratives, everything
an officer types into a form — are translated by the `translate-service`
container and stored in the database (migration `0036`). Leave
`TRANSLATE_PROVIDER` blank and the worker idles: records then render in the
language they were entered in, which is what the portal falls back to anyway.
Staging runs this way.

These are read at container start, not baked into the bundle, so changing them
needs only `docker compose up -d translate-service`.

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | for translation | The backlog and write functions are granted to `service_role` only. **This key bypasses Row-Level Security** — it belongs in this file on the server and must never reach the frontend build. Copy it from `/opt/supabase/docker/.env`. |
| `SUPABASE_INTERNAL_URL` | no | Reach Supabase over the internal Docker network (`http://supabase-kong:8000`) instead of back out through the public hostname. Defaults to `VITE_SUPABASE_URL`. |
| `TRANSLATE_PROVIDER` | for translation | `deepl`, `google`, `libretranslate`, or blank to disable. `deepl` and `google` send record text to a third-party API; `libretranslate` can run as a container on this server so nothing leaves DoCC infrastructure. |
| `TRANSLATE_API_KEY` | for deepl/google | Provider API key. Not used by `libretranslate`. |
| `TRANSLATE_ENDPOINT` | no | Override the provider's API base URL. Required for a self-hosted LibreTranslate (e.g. `http://libretranslate:5000`). |
| `TRANSLATE_TARGET_LANG` | no | Language to produce. Default `fr`. |
| `TRANSLATE_BATCH_LIMIT` | no | Fields claimed per pass. Default `100`. |
| `TRANSLATE_POLL_SECONDS` | no | Idle interval. Default `60`; a full batch drains immediately rather than waiting. |

Project codes, bare acronyms, figures, dates, URLs and file paths are never sent
to the provider, and province names, `Vanuatu`, `DoCC` and donor acronyms are
shielded inside prose. See `translate-service/README.md`.

## 2. Frontend development (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_ENV` | yes | `production` disables demo mode. Anything else enables the demo accounts and mock data. The production Docker build hard-sets `production`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | yes | As above. |
| `VITE_DEMO_ADMIN_PASS`, `VITE_DEMO_SENIOR_PASS`, `VITE_DEMO_MEO_PASS`, `VITE_DEMO_MGR_PASS`, `VITE_DEMO_STAFF_PASS` | demo only | Passwords for the five demo accounts (`admin`, `senior`, `meo`, `manager`, `staff`). Ignored in production mode. |

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

## 5. How the frontend connects to the backend

The frontend talks **directly** to Supabase (PostgREST + GoTrue). The client
is created in `frontend/src/supabaseClient.ts`, which resolves the backend in
this order:

1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` if set at build time; else
2. built-in fallbacks pointing at the staging project
   (`ndntvncboeajanipafeq.supabase.co`).

Because Vite inlines these at build time, a deployment targets whichever
backend was configured **when the bundle was built**. To point the app at a
different backend, set the two variables and rebuild.

Access control is enforced server-side by Row-Level Security, so the anon key
is safe in the browser; each signed-in user reads/writes through their own JWT.

### Verifying the connection

Run the built-in check (uses the same URL/key resolution as the app):

```bash
cd frontend
npm run check:supabase
# or against a specific backend:
VITE_SUPABASE_URL=https://<project>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon-key> npm run check:supabase
```

It reports three checks and exits non-zero if any fail:

- **Auth service reachable** — `GET /auth/v1/health` returns 200 (project is live).
- **Anon API key accepted** — `GET /auth/v1/settings` returns 200 (key is valid).
- **Data API (PostgREST) reachable** — `GET /rest/v1/` is routed (data layer up).

A green run confirms the frontend↔backend link; if the app still shows empty
dashboards afterwards, that means the database has no operational data yet, not
a broken connection.

## 6. Developer tooling (`API_KEY_21ST`)

Not part of any deployment tier. This one lives on a contributor's own
machine; nothing the portal builds or serves reads it.

`.mcp.json` (committed) registers the 21st.dev component MCP server for Claude
Code and other MCP clients. It carries **no key** — the header value is written
`${API_KEY_21ST}`, which the client expands from the environment as it starts:

```json
{ "mcpServers": { "21st": {
  "type": "http",
  "url": "https://21st.dev/api/mcp",
  "headers": { "x-api-key": "${API_KEY_21ST}" }
} } }
```

| Variable | Required | Description |
|---|---|---|
| `API_KEY_21ST` | for the 21st MCP server | Personal 21st.dev API key (`21st_sk_…`). Export it from a shell profile the MCP client inherits — never write the literal key into `.mcp.json`, which is tracked by git. |

```bash
export API_KEY_21ST=21st_sk_...   # ~/.bashrc, ~/.zshrc, or your MCP client's own env settings
```

Leave it unset and the server just fails to authenticate — the portal, its
build and every other tool carry on unaffected. A key that has been pasted into
a tracked file, a chat window or a pull request is a leaked key: rotate it at
21st.dev rather than trying to scrub it.
