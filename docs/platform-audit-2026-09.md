# MERL Dashboard — platform audit and presentation readiness

**Audit date:** 9 September 2026 · **Presentation:** 10 September 2026
**Target:** https://welinrj.github.io/merl-dashboard/#/dashboards
**Branch:** `claude/merl-dashboard-audit-yef0e2`

---

## 1. Executive summary

**Verdict: Ready with known limitations.**

The portal is in materially better shape than a pre-presentation audit usually finds.
Core navigation, role gating, the reporting workflow and the public/private split all
hold up under test. 269 interactive controls were exercised across 11 authenticated
routes and **no dead, misrouted or silently-failing control was found**. The
approval workflow is enforced in the database, not merely by hiding buttons — this
was proved by executing the approval RPC as each real role, not by reading the code.

Four things qualify the verdict:

1. **The demonstration depends on six external internet hosts** (unpkg, Google Fonts,
   and four ArcGIS/UNOCHA services). This is the single largest presentation risk and
   it is a venue/network risk, not a code defect. It is **not fixed** — fixing it
   safely is a bundling change too large to land the day before a presentation.
2. **A beneficiary double-counting defect was found and fixed.** Portfolio pages added
   up every beneficiary record; the per-project analysis applied a double-counting
   rule. The two disagreed. Fixed, tested, and locked behind a new CI check.
3. **The live site runs against the staging Supabase project**, not the production
   government backend. Fine for a demonstration, provided everyone knows it.
4. **A long-standing intermittent CI failure turned out to be a real bug** — a
   cancelled read could strand the public dashboard behind a "data unavailable"
   dialog. Found, root-caused and fixed during this audit (P1-3).

Nothing was hidden, disabled, or stubbed to make the demonstration look complete.

---

## 2. Scope and method

| Method | What it covered |
| --- | --- |
| Static review | Routing, RBAC tables, calculation libraries, i18n, migrations 0020–0049 |
| Browser interaction testing | Playwright against the production build, Supabase stubbed |
| Live backend testing | Direct SQL and REST against the staging Supabase project |
| Build & test gates | `tsc --noEmit`, `npm test`, `npm run build`, full `portal-qa` suite |

**Constraint, stated plainly:** the sandbox browser has no outbound internet, so
authenticated end-to-end testing ran against a Supabase stub rather than live data,
and no user-credential login was performed. Backend behaviour was instead verified
directly against the live staging database. Section 11 says exactly what this leaves
untested.

---

## 3. Architecture and data flow

Static SPA (Vite + React 18, HashRouter) on GitHub Pages, talking straight to
Supabase/PostgREST. No application server.

- **Reads** go through `public.v_*` views (`security_invoker`), so RLS applies as the
  signed-in user.
- **Writes** go through ~87 `SECURITY DEFINER` RPCs, each performing its own role
  check (`merl.require_editor()`, `merl.has_permission()`, explicit role tests).
- **Public portal** reads three dedicated snapshot tables (`public_portal_*`)
  rebuilt by `merl.refresh_public_portal()` on triggers. **Verified**: the snapshot
  only ever contains projects with `registration_status='approved'` and figures from
  periods with `submission_status='approved'`. Drafts and internal risk records
  cannot reach it.
- **Roles:** `system_admin`, `docc_me_officer`, `project_manager`, `viewer`
  (`data_entry_officer` retired in 0041, still read as Viewer so an orphaned account
  degrades instead of crashing).

---

## 4. Interaction inventory and results

Every visible, enabled control on every authenticated route was clicked.

| Route | Controls exercised | Dead / misrouted |
| --- | ---: | ---: |
| `/dashboards` | 33 | 0 |
| `/project-setup` | 17 | 0 |
| `/merl-reporting` | 31 | 0 |
| `/reports` | 17 | 0 |
| `/review` | 23 | 0 |
| `/admin` | 27 | 0 |
| `/analytics/results` | 17 | 0 |
| `/analytics/financial` | 23 | 0 |
| `/analytics/geographic` | 23 | 0 |
| `/analytics/risks` | 48 | 0 |
| `/analytics/project-portfolio` | 42 | 0 |
| **Total** | **269** | **0** |

Also **verified working**: filters drive charts; export/print triggers on both the
report and project-performance paths; the map renders 33 province shapes and region
clicks do not error; no horizontal overflow at 1920/1440/1024/768/390/360 px; zero
unlabelled buttons or inputs; all painted controls ≥ 24 px; notification bell hit
area 41 px.

The 8–10 "findings" the sweep reports (the count varies run to run with which
control happens to be clicked while an external fetch is timing out) are all
console noise: `ERR_CONNECTION_RESET` from the blocked ArcGIS/UNOCHA hosts (§6,
P1-2) and the Supabase realtime WebSocket, which the stub does not serve. **None
is a page error and none originates in application code.**

---

## 5. Role and workflow results

Route gating, measured per role (`reached` = rendered, `redirected` = sent away):

| Route | system_admin | docc_me_officer | project_manager | viewer |
| --- | --- | --- | --- | --- |
| `/dashboards` | reached | reached | reached | reached |
| `/project-setup` | reached | reached | reached | reached |
| `/merl-reporting` | reached | reached | reached | **redirected** |
| `/reports` | reached | reached | reached | reached |
| `/review` | reached | reached | **redirected** | **redirected** |
| `/admin` | reached | **redirected** | **redirected** | **redirected** |
| `/analytics/financial`·`geographic`·`risks` | reached | reached | reached | **redirected** |
| Approve action offered | yes | yes | no | no |

**Backend enforcement — proved, not assumed.** `public.review_reporting_period(…,
'approve', …)` was invoked as each real role against a draft period (a state in which
every role is refused, so nothing could be written):

| Acting role | Result |
| --- | --- |
| `project_manager` | `refused: Approver access required (DoCC M&E Officer)` |
| `viewer` | `refused: Approver access required (DoCC M&E Officer)` |
| `docc_me_officer` | `refused: Reporting period not found or not awaiting review` |
| `system_admin` | `refused: Reporting period not found or not awaiting review` |

The two non-approver roles are stopped by the **role gate**; the two approver roles
get past it to the **state check**. This is the agreed workflow, enforced in the
database.

**Approval lock — verified in schema.** Approving a period sets `locked_at` and a
`BEFORE INSERT/UPDATE/DELETE` trigger blocks writes to all six period-scoped tables
(migration 0035 extended 0032's original two). Only `system_admin` retains an audited
override; everyone else must have the M&E Officer reopen the period, which requires a
recorded reason.

**Session handling — verified working:** session restores from storage, survives
refresh, sign-out clears the token, and neither the back button nor a pasted `/admin`
URL regains access after sign-out.

---

## 6. Issue register

### P1-1 · Beneficiary totals were computed two different ways — **FIXED**

- **Where:** `Overview.jsx`, `Dashboards.jsx` (×3), `Reports.jsx` (×2) vs
  `lib/docc/projectAnalysis.js`
- **Expected:** one headcount for one set of records.
- **Actual:** the portfolio pages added up *every* beneficiary row. Form 8 is
  period-scoped, so a project reporting quarterly holds one row per period and the
  flat sum counts the same household once per period. Project Analysis meanwhile
  applied the documented rule — sum only when every row is confirmed free of double
  counting, otherwise take the largest single report.
- **Why it was invisible:** every project in staging currently has exactly one
  beneficiary record, where both rules agree. It would have appeared the moment a
  second reporting period was entered — including during the demonstration script.
- **Reproduction:** two records for one project (120 confirmed, 150 unconfirmed).
  Overview showed **270**; Project Analysis showed **150**.
- **Fix:** extracted the tested rule into `beneficiaryReach()` and
  `portfolioBeneficiaries()`, and pointed all six portfolio call sites at it.
  `beneficiarySummary()` now uses the same helper, so the two cannot drift again.
- **Verification:** 4 new unit tests (110 pass). A new browser check
  (`qa/beneficiary-reconciliation.mjs`) asserts all three pages show 150 and none
  shows 270 — and it was confirmed to **fail on the pre-fix code** (4 failures) and
  pass after, so it is not a vacuous test. Added to the `portal-qa` CI workflow.

### P1-2 · The demonstration depends on six external hosts — **OPEN (accept & mitigate)**

- **Where:** `frontend/index.html`, `GeographicCoverageExperience.jsx`,
  `InteractiveCoverageMap.jsx`, `PublicCoverageMap.jsx`
- **Confirmed against the live deployment**, not just source. The shipped bundle and
  `index.html` reference: `unpkg.com` (Leaflet CSS as a blocking `<head>` stylesheet,
  plus Leaflet JS at runtime), `fonts.googleapis.com`, `gis.unocha.org`,
  `services.arcgis.com`, `server.arcgisonline.com`, `services.arcgisonline.com`.
- This contradicts the documented design rule in `CLAUDE.md`: *"Maps are drawn from
  `public/vanuatu-provinces.geojson` with no tile server, on purpose… Don't introduce
  a tile dependency without deciding what happens with no signal."*
- **Degradation was tested, and it is graceful, not fatal.** With those hosts
  unreachable the Geographic Coverage page still renders its province coverage,
  completeness ring and location register; the map area shows *"Could not load the
  mapping library."* Fonts fall back. **No crash, no blank page.**
- **Not fixed deliberately.** Bundling Leaflet and vendoring the boundary GeoJSON is
  the correct repair, but it is a dependency and asset change too large to land
  safely the day before a presentation.
- **Recommended mitigation:** confirm venue network reach to those hosts beforehand,
  and pre-load the Geographic Coverage page on the demo machine so assets are cached.
  If the venue network is uncertain, **demonstrate Geographic Coverage last** or
  substitute the offline `VanuatuMap` views on the Overview, which use the bundled
  GeoJSON and need no network.

### P1-3 · A cancelled read left the portal behind a "data unavailable" dialog — **FIXED**

- **Where:** `frontend/src/supabaseClient.ts` (`monitoredFetch`)
- **Found by CI, not by inspection.** `qa/public-dashboard.mjs` had been failing
  intermittently *on `main`* — commit `d0622c6` both passed (run 160) and failed
  (run 161). Always the same way: at 390px the hamburger could not be clicked
  because the data-availability dialog was covering it.
- **Root cause.** The dialog was right to exist and wrong to be there. The fetch
  wrapper records a failed PostgREST read so the UI blocks the values rather than
  rendering a transport failure as a believable zero — but its catch block treated
  *any* thrown fetch as a failure, and an abort is a thrown fetch.
  `fetchPublicSnapshot` passes `.abortSignal(signal)`, so React Query cancels the
  public snapshot's reads once the query is no longer needed. Navigating away from
  the public dashboard while those reads were in flight recorded a failure, and the
  guard then covered the portal until a reload — over a page whose reads were fine.
  It needed a read in flight at the moment of navigation, hence the flake.
- **Not only a test problem.** The window widens the slower the connection, and the
  portal is built for phones in the field. A visitor tapping between sections on a
  slow link could land on a permanent "data unavailable" dialog over a working
  public dashboard — which is step 1 of the demonstration script.
- **Fix:** an aborted request records nothing; a genuine transport failure still does.
- **Verification:** `qa/read-failure-guard.mjs` asserts **both** directions, since
  narrowing this must not stop the guard blocking a real failure. Against the pre-fix
  build the three abort checks fail and the genuine-failure check passes, so it tests
  what it claims. Added to the `portal-qa` CI workflow.

### P2-1 · Hard-coded English strings in a bilingual portal — **FIXED**

- **Where:** `MerlReporting.jsx` (reopen confirmation body, "Review note:", the
  Beneficiaries guidance note, three cross-field validation messages),
  `ReviewApproval.jsx` ("Reopened:", "N record/records"), `PublicEntry.jsx`.
- A French user hit English text mid-workflow. `CLAUDE.md` forbids this explicitly.
- **Fix:** added 8 EN + 8 FR keys under the `merl` namespace. The module-scope
  validators now return `{ key, params }` resolved with `t()` at the call site — the
  pattern `CLAUDE.md` prescribes for avoiding a module-scope `t()` crash.
- **Verification:** rendered `/merl-reporting?module=beneficiaries` in both languages;
  the note resolves in-language and no raw `merl.*` key leaks to screen. i18n parity
  test passes.

### P2-2 · `anon` could execute an application RPC — **FIXED**

- **Where:** `public.list_results_framework_editable_projects()`
- Flagged by the database linter (`0028_anon_security_definer_function_executable`).
- **Root cause, and it is a generalisable trap:** migration 0049 did
  `REVOKE ALL … FROM PUBLIC`, which does **not** remove Supabase's platform default
  privilege granting `EXECUTE` to the `anon` role directly.
- **No data was exposed** — called anonymously it returned `[]`, because it resolves
  the caller through `merl.current_db_user()`, which is NULL for an anonymous request.
  This was a reachable `SECURITY DEFINER` entry point, not a live leak.
- **Blast radius checked:** it was the *only* application function `anon` could
  execute; every other RPC is correctly `authenticated`-only.
- **Fix:** migration `0050_anon_rpc_hardening.sql`, applied to staging.
- **Verification:** `anon` now receives `42501 permission denied`; `authenticated`
  retains execute; all three public-portal reads still return 200.
- A schema-wide default-privilege revoke was **deliberately not** done — it would
  silently break any future genuinely-public function. The migration documents the
  per-function rule instead.

### P3-1 · Leaked-password protection disabled — **OPEN (config, not code)**

Supabase Auth's HaveIBeenPwned check is off on the staging project. One toggle in the
Supabase dashboard. Not changed here because it alters authentication behaviour and is
an owner's decision.

### P3-2 · Advisory noise — **OPEN, no action needed**

`public.spatial_ref_sys` without RLS and `postgis` in `public` are both PostGIS
artefacts of the Supabase image, not application defects.

---

## 7. Information architecture

Reviewed against the brief's "right information on the right page" test. The
navigation was evidently already rationalised — `App.tsx` documents three previously
duplicated entries that were consolidated, and each sidebar entry now resolves
somewhere distinct.

Two observations, neither fixed, both low-risk to leave:

- **`TAB_ACCESS` still lists a `documents` key that no `NAV_ITEMS` entry uses.** Dead
  configuration, no user-visible effect. Left alone rather than churn RBAC tables the
  day before a presentation.
- **`PublicDashboard.jsx` carries its own inline `COPY` object** instead of using
  `i18n.js`. It is fully bilingual, so there is no user-visible defect; it is a
  convention divergence. Consolidating it is a post-presentation cleanup.

No duplicated KPI, chart or form was found that misleads: the Overview is portfolio
summary, Project Analysis is one project across modules, Financial Analysis is the
portfolio's money. The nav comments state this division deliberately.

---

## 8. Calculations and visualisations

Traced to source. `lib/docc/reporting.js` and `lib/docc/projectAnalysis.js` are pure,
well-tested, and preserve the null-≠-zero rule throughout — a missing input yields
`null`, never a believable `0`.

**Verified correct:**
- Financial totals take the **latest** record per project, so expenditure is not
  double-counted across periods.
- Indicator progress takes the **latest** record per indicator, so indicators with
  more reporting history do not outweigh others.
- The public snapshot's `overall_progress_pct` and `published_beneficiaries` are
  derived by `merl.refresh_public_portal()` from approved periods — **not hard-coded**.
- `DataAvailabilityGuard` blocks the whole portal after a failed REST read, so a
  transport or permission failure cannot be rendered as a legitimate zero. (406 is
  correctly excluded, since PostgREST uses it for an intentionally empty `.single()`;
  a cancelled request is now excluded too — see P1-3.)

**No hard-coded demonstration values were found in any KPI or chart.** The staging
data is seeded and `DEMO-` prefixed, but it is real data read live.

**Corrected:** the beneficiary rule (P1-1).

---

## 9. Changes made

| File | Change |
| --- | --- |
| `frontend/src/lib/docc/projectAnalysis.js` | Added `beneficiaryReach()` + `portfolioBeneficiaries()`; `beneficiarySummary()` now uses them |
| `frontend/src/pages/Overview.jsx` | Portfolio beneficiary KPI uses the shared rule |
| `frontend/src/pages/Dashboards.jsx` | Portfolio + per-project beneficiary figures use the shared rule |
| `frontend/src/pages/Reports.jsx` | Portfolio and donor report totals use the shared rule |
| `frontend/src/pages/MerlReporting.jsx` | 6 hard-coded strings → i18n; validators return `{key, params}` |
| `frontend/src/pages/ReviewApproval.jsx` | 2 hard-coded strings → i18n |
| `frontend/src/PublicEntry.jsx` | Boot message follows the active language |
| `frontend/src/i18n.js` | 8 new keys, EN + FR |
| `frontend/test/projectAnalysis.test.mjs` | 4 reconciliation tests |
| `frontend/qa/beneficiary-reconciliation.mjs` | New browser check (+ fixture) |
| `.github/workflows/portal-qa.yml` | Runs the new check in CI |
| `supabase/migrations/0050_anon_rpc_hardening.sql` | Revokes `anon` EXECUTE |

**Not touched:** dashboard design, sidebar colour, branding, layout, project data,
user accounts, credentials.

---

## 10. Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm test` | **110 / 110** (was 106; +4 new) |
| `npm run build` | pass |
| Beneficiary reconciliation (browser) | pass — and fails on pre-fix code, as it should |
| Full `portal-qa` suite re-run on the final build | **10 / 10 suites pass** |
| i18n render check, EN + FR | pass, no raw keys on screen |
| `anon` RPC probe | denied; public portal unaffected |

---

## 11. Not tested — stated honestly

These were **not** verified and must not be reported as working:

1. **Login with real credentials.** No user password was available. The login form's
   validation and failure paths were tested; a successful credential sign-in was not.
2. **A live create → submit → approve cycle against real data.** The workflow's role
   gates and state machine were proved in the database, and the UI was driven against
   a stub, but no record was written end-to-end through the browser. No test data was
   created in staging, by design.
3. **Real file upload / evidence storage.** Storage policies were not exercised.
4. **The translate-service and Redis cache sidecar.** Neither runs in this
   environment; the frontend's documented graceful fallback was not re-verified.
5. **The map rendering correctly with the external hosts reachable.** Only its
   offline degradation was observed.

---

## 12. Demonstration checklist

**Before:**
- [ ] Confirm the venue network reaches `unpkg.com`, `fonts.googleapis.com` and the
      four ArcGIS/UNOCHA hosts. If any is blocked, plan around Geographic Coverage.
- [ ] Open every page once on the demo machine to warm the browser cache.
- [ ] Confirm everyone understands the site runs against **staging**.
- [ ] Deploy this branch if the beneficiary fix is wanted for the demonstration.
      If not deployed, avoid entering a second beneficiary period live.
- [ ] Apply migration `0050` to any environment other than staging (already applied
      to staging).
- [ ] Have the reviewer account signed in on a second browser profile so the
      approval step needs no sign-out.

**Suggested order** — each step is a path this audit exercised:
1. Public dashboard (signed out) → 2. Sign in → 3. Overview → 4. Project Setup →
5. Results & Indicators → 6. MERL Reporting: enter progress, save draft, submit →
7. Review & Approval as the M&E Officer: open the drawer, approve →
8. Overview reflects it → 9. Financial Analysis → 10. Reports: generate → 11. Sign out.

**Avoid live, if the risk is not wanted:** entering a second beneficiary reporting
period on an undeployed build (P1-1), and Geographic Coverage on an unverified
network (P1-2).

---

## 13. Verdict

**Ready with known limitations.**

- No presentation-blocking (P0) defect was found.
- The one P1 code defect found is fixed, tested and regression-locked.
- The remaining P1 is an environmental dependency with a tested graceful degradation
  and a clear mitigation.
- 269 controls, 11 routes, 4 roles: no dead controls, no permission escapes, no
  fabricated data.

The honest summary is that the platform will demonstrate well, and the one thing most
likely to embarrass it on the day is the venue's network, not its code.
