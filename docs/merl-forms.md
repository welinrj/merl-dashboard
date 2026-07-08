# MERL Reporting Forms (FRM-01 … FRM-10)

DoCC's official **MERL Reporting Forms** (Draft v2.0) define what the portal
collects for each project. They are being automated in phases. This document
tracks the implementation.

## Design rules (from the form set)

- Every project carries an auto-generated **Project ID** `DCC-YYYY-###`.
- Within a project, each record type has an auto-generated, project-unique short
  code: Objective `OBJ-##`, Outcome `OUT-##`, Output `OP-##`, Activity `ACT-##`,
  Indicator `IND-##`, Risk `RSK-##`, Evidence `EVD-##`, Report `RPT-##`.
- **Users never type codes** — the portal generates the next available code
  server-side after a project is selected.
- The combination **Project ID + short code** is unique across the portal.

## Status

| Form | Title | Status |
|---|---|---|
| FRM-01 | Project Registration | ✅ Implemented (Phase 1) |
| FRM-02 | Results Framework Builder | ✅ Implemented (Phase 1) |
| FRM-03 | Monthly Activity Progress | ⬜ Planned |
| FRM-04 | Indicator Reporting | ⬜ Planned |
| FRM-05 | Budget & Financial Progress | ⬜ Planned |
| FRM-06 | Risk & Issue Register | ⬜ Planned |
| FRM-07 | Beneficiary Register (GEDSI) | ⬜ Planned |
| FRM-08 | Lessons Learned & Success Stories | ⬜ Planned |
| FRM-09 | Evidence & Means of Verification | ⬜ Planned |
| FRM-10 | Project Health (Traffic Light) | ⬜ Planned |

## Phase 1 — how it works

### Data model (project-scoped RBM hierarchy)

Migrations `0008_project_registration.sql` and `0009_results_framework.sql`:

- `merl.projects` extended with the full FRM-01 field set (climate
  classification, geographic coverage, funding & governance, timeline &
  beneficiary targets, and a `registration_status` review workflow).
- New tables `merl.objectives → outcomes → outputs → project_activities`, plus
  `merl.project_indicators` (which links polymorphically to any level via
  `linked_level` + `linked_id`). All FK to `merl.projects(id)` and cascade on
  delete.
- `merl.code_counters` + `merl.next_code()` generate the per-project short codes
  atomically (monotonic — codes are not reused after a delete).
- Writes go through role-gated `SECURITY DEFINER` RPCs
  (`create_/update_/delete_*`, editor roles = administrator / M&E officer /
  project manager); reads through `public.v_*` `security_invoker` views. Audit
  triggers are attached to every new table.

### Frontend

- **Registration** nav entry → `pages/ProjectRegistration.jsx` (FRM-01): lists
  projects and provides the multi-section registration form with a
  submit-for-review / approve-or-return workflow (reviewer roles = admin / DoCC
  senior / M&E officer).
- `pages/ResultsFramework.jsx` (FRM-02), reached from a project's "Results
  framework" action (`/results-framework?project=<id>`): a nested
  Objective→Outcome→Output→Activity tree plus an indicator register; codes are
  shown read-only.
- Shared controlled vocabularies live in `constants/formOptions.js`.
- New form labels are bilingual **English + French** (`i18n.js`), with a header
  EN/FR switcher. Option values (climate themes, SDGs, etc.) are kept as their
  canonical English government/UN wording.

## Known follow-ups

- **Cascading geography** (Province → Island → Area Council → Community) needs
  the official Vanuatu reference dataset. Phase 1 stores island / area-council /
  community as free-text lists alongside the validated province multi-select.
- **NSDP reference list** is free-text until DoCC supplies the approved list;
  **SDG** uses SDG 1–17.
- FRM-01 §7 "Supporting Documents" is deferred to FRM-09 (Evidence).
- The existing domain-based `merl.activities` / `merl.indicators` still power the
  current Dashboard / Analysis / Reports; unifying them onto this project-scoped
  model is a later migration.
- **`merl.is_admin()` fragility (pre-existing):** it uses `v_user IS NOT NULL`
  on a composite row, which is only true when *every* user column is non-null.
  Admin RPCs can silently reject a valid admin whose `merl.users` row has any
  NULL column (e.g. `organisation`). Phase 1's new `merl.require_editor()` avoids
  this by testing `v_user IS NULL` instead. Worth hardening `is_admin()`
  separately.
