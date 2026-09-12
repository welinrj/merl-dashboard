# MERL Dashboard — security audit and remediation

**Date:** 10 September 2026 · **Branch:** `claude/merl-dashboard-audit-yef0e2`
**Scope:** frontend, database, authentication, storage, API surface, caching
sidecar, reverse proxy, CI/deployment, dependencies, git history.

> **Timing note.** This audit was run on the day of the stakeholder
> presentation. That shaped which fixes were applied and which were written up
> instead: everything landed here was verified not to change application
> behaviour, and three items were deliberately left open because the safe fix
> could not be validated in this environment. Each is named in §3 with the
> reason.

---

## 1. Summary

No critical or high-severity vulnerability was found. The platform's security
model is sound in its fundamentals: passwords are bcrypt-hashed, every mutation
goes through a `SECURITY DEFINER` RPC that checks the caller's role, row-level
security is enabled on every application table, the public portal reads a
separate approved-only snapshot, and no secret has ever been committed.

Ten issues were fixed, all Medium or Low, and most of one kind: **privileges
granted far wider than the application ever uses**, leaving row-level security
as the only thing preventing misuse. RLS did hold everywhere it was tested —
these fixes remove the dependence on it being perfect forever.

| Severity | Found | Fixed | Open |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 8 | 7 | 1 |
| Low | 8 | 3 | 5 |

---

## 2. Issues found and fixed

### 2.1 Browser roles held write privileges on ~38 views and 10 tables
- **Severity:** Medium
- **Component:** database grants — `public.v_*`, `merl.users`, `merl.activities`,
  `merl.indicators`, `merl.financial_transactions` and six more
- **Found:** `anon` and `authenticated` held `INSERT`/`UPDATE`/`DELETE` on ~38
  public views — 20 of them simple enough that Postgres treats them as
  auto-updatable onto their base tables — and `authenticated` held the same on
  ten legacy `merl` tables. **`merl.users` was among them**, and that table holds
  the `role` column, so a write primitive there is a privilege escalation.
- **Was it exploitable?** No, and this was tested rather than assumed. Each write
  policy was evaluated under each real role: a Viewer is refused on activities,
  indicators, ld_events, financials and users, and an identity with no MERL
  profile is refused everything (fails closed). RLS was doing its job.
- **Changed:** `supabase/migrations/0056_least_privilege_grants.sql` revokes all
  write privileges from both browser roles across the public views and those ten
  tables, revokes `anon`'s `SELECT` on the internal `v_*` views, and stops the
  platform default from re-granting writes on views added later.
- **Why it is secure:** the application never writes through PostgREST — the
  frontend contains zero `.insert()`/`.update()`/`.delete()`/`.upsert()` calls
  against a table or view, and all 89 RPCs are `SECURITY DEFINER` (every
  `SECURITY INVOKER` function in `public` belongs to PostGIS), so they run as the
  definer and are unaffected. The privilege being removed was unused. With it
  gone, a future permissive policy or an accidental `DISABLE ROW LEVEL SECURITY`
  is no longer instantly a write primitive for anyone holding the public anon key.
- **Verified:** public portal reads still return 200 for `anon`; internal views
  now return 401 for `anon` (were readable-by-grant before); `authenticated`
  retains `SELECT` everywhere it needs it; writable views reduced from 20 to 2
  (both PostGIS metadata views, excluded deliberately); all 89 RPCs still callable.

### 2.2 A read-only Viewer could upload files to four storage buckets
- **Severity:** Medium
- **Component:** `storage.objects` policies — `datasets`, `project-documents`,
  `activity-photos`, `activity-reports`
- **Found:** `UPDATE` and `DELETE` on these buckets already required
  `merl.is_editor()`. `INSERT` alone accepted any signed-in MERL user, so a
  Viewer — an account the portal presents as read-only, with no upload control
  anywhere in its navigation — could write arbitrary files into government
  storage through the Storage API directly. The inconsistency with the sibling
  policies on the same buckets marks it as an oversight.
- **Changed:** `supabase/migrations/0057_storage_upload_requires_editor.sql`
  aligns `INSERT` with `UPDATE`/`DELETE` on the same four buckets.
- **Why it is secure:** `merl.is_editor()` is exactly the three roles meant to
  write (system_admin, docc_me_officer, project_manager), so the change removes
  only the Viewer's ability. `merl-indicator-evidence` is untouched — it already
  has a stricter project-scoped check — as is `project-images`, already admin-only.
- **Verified:** all three editor roles can still upload; the Viewer cannot but can
  still read; an unknown identity gets neither.

### 2.3 Raw database diagnostics were shown to users
- **Severity:** Medium
- **Component:** `frontend/src/lib/dbError.js`
- **Found:** the translation layer mapped known error classes to readable
  messages, then fell back to `return raw` — handing the user any unmatched
  Postgres or PostgREST error verbatim. Those name relations, columns,
  constraints, function signatures and schemas: a free map of the database for
  whoever provokes one.
- **Changed:** unmatched messages are checked for markers that only appear in a
  database's own diagnostics; those are replaced with the existing
  `err.fallback` string. Messages our RPCs write for officers pass through
  unchanged.
- **Why it is secure:** matching on internal markers rather than trying to
  recognise our own messages means a new RPC message is shown as written while a
  new *kind* of internal error is still withheld — the safe direction for each to
  fail in.
- **Verified:** 29 new tests. All 14 real RPC messages taken from the migrations
  pass through byte-for-byte; 9 representative diagnostics are withheld with no
  schema detail leaking; the recognised classes still produce their specific
  messages.

### 2.4 The public caching sidecar echoed upstream database errors
- **Severity:** Medium
- **Component:** `cache-service/app.js`
- **Found:** on an upstream failure the endpoint returned
  `{"error": "supabase 403: <the PostgREST error body>"}` to the caller. That
  endpoint is public and unauthenticated, so a PostgREST message naming views and
  permissions was reachable by anyone on the internet.
- **Changed:** the detail is logged for the operator; the caller gets
  `{"error":"upstream unavailable"}` with the same 502.
- **Verified:** new test asserts the 502 still happens and that the body contains
  none of `permission denied`, `v_srf_analytics` or `merl`.

### 2.5 The cache invalidation secret was compared in non-constant time
- **Severity:** Low
- **Component:** `cache-service/app.js`
- **Found:** `req.get(...) !== invalidateSecret` returns as soon as it finds a
  differing byte, which over many requests can reveal a secret one character at
  a time.
- **Changed:** `crypto.timingSafeEqual`, with equal work done on a length
  mismatch so the length itself is not a signal. Request body capped at 8 kb.
- **Verified:** wrong secrets of both shorter and longer length are still 403;
  the correct secret still succeeds.

### 2.6 No rate limiting on sign-in or the public cache endpoint
- **Severity:** Medium
- **Component:** `nginx/nginx.conf`
- **Found:** nothing limited credential guessing. Sign-in is the one place an
  attacker can guess, and a government portal's account list is small and
  guessable (firstname.lastname@…).
- **Changed:** `/auth/v1/token` and the recovery/signup endpoints limited to
  5 requests/minute per IP with a burst of 5; the rest of the auth surface to
  60/min; the public cache endpoint to 120/min; 50 concurrent connections per IP.
  Limited requests return 429.
- **Verified:** run against a live nginx with a stub upstream — the first 6
  requests reach the upstream, requests 7–12 return 429, and non-auth paths are
  unaffected. Config passes `nginx -t`.

### 2.7 Missing security headers
- **Severity:** Medium
- **Component:** `nginx/nginx.conf`
- **Found:** the app host set X-Frame-Options, nosniff, Referrer-Policy and HSTS
  but **no Content-Security-Policy** — the single most useful header against
  XSS — and no Permissions-Policy. The API host set only two headers. nginx
  advertised its version.
- **Changed:** a CSP with `script-src 'self' https://unpkg.com`,
  `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'` and an
  explicit list of the map hosts; Permissions-Policy denying camera, microphone,
  payment and USB; `server_tokens off`; the API host given
  `default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY` and
  `Referrer-Policy: no-referrer`.
- **Why it is secure:** the built bundle carries no inline `<script>` (checked
  against `dist/index.html`), so scripts could be restricted to this origin
  without `'unsafe-inline'` — which is the control that actually stops an
  injected script. `style-src` keeps `'unsafe-inline'` because the pages style
  themselves inline throughout; an inline stylesheet cannot exfiltrate data the
  way an inline script can.

---

## 3. Open — and why

### 3.1 Production credentials fall back to a hardcoded staging project
- **Severity:** Medium · **Component:** `frontend/src/supabaseClient.ts`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` fall back to a hardcoded
  staging URL and anon key. The anon key is public by design and protected by
  RLS, so this is not a secret leak — the risk is that **a production build with
  its environment misconfigured silently talks to staging** instead of failing.
- **Not fixed today, deliberately.** `.github/workflows/deploy.yml` sets no
  `VITE_` variables, so that fallback is precisely what makes the live GitHub
  Pages site work. Removing it today would take the presentation site offline.
- **Recommended:** add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as
  repository secrets, set them in the deploy workflow, then remove the fallback
  so a misconfigured build fails loudly.

### 3.2 No Content-Security-Policy on the GitHub Pages deployment
- **Severity:** Medium · **Component:** `frontend/index.html`
- The nginx CSP covers the self-hosted production deployment. GitHub Pages cannot
  send response headers, so the only option there is a `<meta http-equiv>` tag.
- **Not applied today, deliberately.** The application needs seven external hosts
  at runtime (fonts.googleapis.com, fonts.gstatic.com, unpkg.com and four
  ArcGIS/UNOCHA hosts). This audit environment has no outbound browser network,
  so a CSP's external allowances **cannot be validated here** — shipping an
  unvalidated CSP to the presentation site would risk breaking it for no
  demonstrable gain.
- **Recommended** (apply and check the browser console on a networked machine):
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://server.arcgisonline.com https://services.arcgisonline.com https://services.arcgis.com https://gis.unocha.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://services.arcgis.com https://gis.unocha.org">
  ```

### 3.3 react-router open redirect (CVE advisory)
- **Severity:** Medium (advisory) → **not reachable here** · `react-router-dom@6.30.4`
- Two advisories affect `6.0.0 – 7.17.0`. The SSR-hydration one does not apply
  (static SPA, no SSR). The open redirect needs a user-controlled navigation
  target, and **every navigation target in this codebase is a hard-coded string
  literal** — checked across every `navigate()` call and every `<Link>`/`<NavLink>`;
  the only indirection (`nav(it.to)` in NotificationBell) selects from three fixed
  literals. The app also uses HashRouter.
- **Not fixed:** the patched range starts at 7.18, a major-version upgrade with
  breaking API changes. Not a change to make on presentation day for an
  unreachable issue.
- **Recommended:** plan the v6 → v7 migration as normal maintenance.

### 3.4 Password policy is length-only, and breach checking is off
- **Severity:** Low · `merl.assert_password_acceptable`, Supabase Auth config
- The policy requires ≥10 characters and nothing else, and Supabase Auth's
  HaveIBeenPwned check is disabled, so `password12` is accepted.
- **Not fixed:** enabling breach checking is a project configuration change and
  an owner's decision; tightening the policy mid-presentation could block an
  administrator issuing a credential.
- **Recommended:** enable leaked-password protection in Supabase Auth, and add a
  common-password rejection to `assert_password_acceptable`.

### 3.5 PostgREST error bodies name views and columns
- **Severity:** Low · platform behaviour
- A malformed write returns e.g. `cannot update column "role" of view
  "v_admin_users"`. This comes from PostgREST itself, before application code.
  §2.1's revokes reduce what can be probed this way; fully suppressing it needs a
  gateway-level response filter.

### 3.6 Nine dev-only dependency advisories
- **Severity:** Low (5 High-rated, none shipped)
- vite, postcss, esbuild, browserslist, nanoid, picomatch, @babel/core and two
  others are build tooling. **None ships in the bundle**; they affect the build
  machine. Production dependencies carry no High or Critical advisory, and CI
  already fails the build on one.
- **Recommended:** `npm audit fix` on the next maintenance pass.

### 3.7 The public inventory RPC discloses the count of unpublished projects
- **Severity:** Low · `public.public_portal_project_inventory()`
- Added by main's recent public-inventory work and callable anonymously, it
  returns `{total_projects: 31, approved_projects: 12, other_projects: 19}` —
  telling the public that 19 unapproved or draft government projects exist. It is
  a count only: no name, code or content leaks, and the sibling
  `public_portal_project_plan()` was checked and correctly returns only the 12
  approved projects.
- **Not changed:** the commit history ("aggregate-only public project inventory")
  makes clear this is deliberate, and it drives a feature shipped yesterday.
- **Recommended:** confirm the Department is content to publish that count. If
  not, return only `approved_projects`.

### 3.8 `merl.audit_logs` has no RLS
- **Severity:** Low (not reachable) · Every authenticated role holds `SELECT` on
  it and RLS is off, but **no view in `public` exposes it**, so PostgREST cannot
  reach it. Worth enabling RLS for defence in depth.

---

## 4. Checked and found secure — no change needed

- **Passwords** are bcrypt-hashed with a per-password salt
  (`crypt(p, gen_salt('bf'))`); nothing is stored in plaintext. Changing your own
  password requires proving the current one; an administrator reset revokes the
  target's sessions; both are written to the audit log.
- **No secret has ever been committed.** All 366 commits were scanned and every
  JWT ever committed decodes to the same `anon` key — public by design. No
  `service_role` key, private key or password anywhere in history. `.env` and
  `.env.*` are correctly gitignored; only `.env.example` files are tracked.
- **`service_role` never reaches the browser** — it appears only in
  `docker-compose.yml`, the village importer and the translation worker.
- **Role enforcement is in the database, not the UI.** The approval RPC was
  invoked as each real role: `project_manager` and `viewer` are stopped by the
  role gate, the two approver roles pass it and reach the state check.
- **Public/private separation holds.** The public snapshot is rebuilt only from
  projects with `registration_status='approved'` and periods with
  `submission_status='approved'`.
- **No XSS sinks.** No `dangerouslySetInnerHTML`, no `eval`, no `document.write`;
  the single `innerHTML` assigns a static glyph. Every `target="_blank"` carries
  `rel="noopener noreferrer"`.
- **A suspected `javascript:` URL vector was investigated and disproved.** The
  `href={p.url}` on the public catalogue renders only for entries in a hard-coded
  constant array, with the URL built from a hard-coded base; database-driven
  projects render a `<button>`. No user or database input reaches that `href`.
- **No wildcard CORS anywhere.** The cache sidecar sets no CORS headers at all
  and is served same-origin through nginx.
- **Storage buckets are private** except `project-images`, whose public read is
  intentional and whose writes are admin-only.
- **The built bundle exposes nothing.** Source maps are disabled
  (`sourcemap: false`, 0 `.map` files in `dist`), and `dist` contains no `.env`,
  config, backup or log file, and no reference to `service_role`.
- **`localStorage`** holds only the interface language and, when the user ticks
  "keep me signed in", their email address — never a password.

---

## 5. Verification after the fixes

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| Frontend unit tests | **139 / 139** (was 110; +29 new) |
| `npm run build` | pass |
| `cache-service` tests | **14 / 14** (was 10; +4 new) |
| `nginx -t` on the hardened config | pass |
| Login rate limit, live nginx | 6 through, then 429 — verified |
| Public portal as `anon` | 200 on all three snapshot tables |
| Internal views as `anon` | 401 — denied |
| `authenticated` reads | unchanged |
| Writable views | 20 → 2 (both PostGIS) |
| RPCs callable by `authenticated` | 89 → 89 |
| Upload permission by role | 3 editors yes, Viewer no, unknown no |

### Browser QA — 9 of 10 suites pass

`permission-matrix`, `auth-lifecycle`, `read-failure-guard`,
`beneficiary-reconciliation`, `data-and-ux` (30/30), `public-single-signin`,
`header-inline-auth`, `kpi-alignment` and `admin-role-colors` all pass. The role
matrix is byte-for-byte unchanged from before the grant revokes, which is the
result that matters most here.

`public-dashboard` fails one check — *"province chart drills down to matching
projects"*. **This is pre-existing on `main` and not caused by this work**,
proved by reverting the one frontend file this audit touches
(`dbError.js`) to main's version, rebuilding, and reproducing the identical
failure.

Diagnosed while it was in front of me, because it sits on the public dashboard:
clicking a province in the chart *does* filter correctly — the panel reports
"1 Published projects" — but the projects panel now renders the new
`PublicProjectCatalogue`, which opens on its **"DoCC website"** tab showing the
twelve hard-coded directory entries. The filtered MERL result is behind the
**"MERL records"** tab. So a province drill-down looks like it did nothing.
Not a security issue, and not changed here, but worth knowing before a
demonstration that opens on the public dashboard.
