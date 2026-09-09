# MERL portal implementation roadmap

## Release policy
Preserve all existing records, credentials, roles, approval history, and sidebar branding. Do not reset production data or publish draft results. Implement on a branch, validate against a staging database with representative records, and merge only after review. A successful build is not a substitute for authenticated browser testing.

## P0 — Reliability and reporting integrity
- [ ] Replace silent failed reads with explicit errors and last successful snapshot. Add retry, freshness timestamp, and tests for partial failures.
- [ ] Centralise project inventory, lifecycle statuses, progress, finance and beneficiary calculations. Reconcile internal and public views using the same source with explicit publication scopes.
- [ ] Verify all role permissions server-side, including assigned-project restrictions, create/update/delete, submission, approval and reopen. DoCC M&E Officer remains the designated reviewer; administrator override must be audited.
- [ ] Protect approved reporting from silent edits; require controlled revision and retain history.
- [ ] Test missing data, stale data, empty data, failed requests, and concurrent edits separately.
- [ ] Add staging, migration verification, backup/restore rehearsal, deployment smoke tests and rollback instructions.

## P1 — Connected project workflows
- [ ] Unified project workspace with Overview, Framework, Activities, Reporting, Finance, Beneficiaries, Risks, Geography, Documents and History. Preserve selected project across modules.
- [ ] Separate register-new and edit-existing workflows; prefill existing records and retain unsaved changes.
- [ ] Framework hierarchical expansion, contextual add/edit/delete, completeness checks, safe parent changes, unique generated codes, Excel import/export and audit history.
- [ ] Reporting-period wizard, previous-value carry-forward, section completeness, validation summary, save/resume and submission readiness.
- [ ] Reporting calendar with due dates, responsible officers, overdue submissions and next actions.
- [ ] Reviewer queue with previous-period comparison, evidence checks, return comments and correction tracking.

## P2 — Management and analysis
- [ ] Executive KPIs: registered, ongoing, completed, at risk, not started, overdue reporting, pending approvals, beneficiaries and finance. Every count has a documented scope and drill-down.
- [ ] Results by project with objectives, outputs, indicators, baseline, target, actual, variance, evidence and latest approved period. Never fabricate progress for missing data.
- [ ] Finance: budget, funds received, commitments, expenditure, balance, utilisation and physical-versus-financial variance. Preserve currency and period semantics.
- [ ] Beneficiaries: direct/indirect, gender, youth, disability, unique-person methodology and double-counting checks.
- [ ] Risk register: owner, due date, severity, mitigation, overdue action, resolution and history.
- [ ] Geographic drill-down by province, island, Area Council and community; distinguish administrative coverage from verified activity locations; identify missing coordinates.
- [ ] Consistent project identity colors across internal and public pages, distinct from performance status colors.
- [ ] Report templates, source dates, methodology, approved-data scope, print/PDF, CSV/Excel and reproducible report history.

## P3 — Usability and accessibility
- [ ] Simplify navigation into enter/manage, monitor/analyse, and report/review tasks without removing existing routes.
- [ ] Responsive tables with sticky headers, readable widths, sorting, filtering and accessible mobile detail views.
- [ ] Complete English/French copy, validation and empty/error states.
- [ ] Keyboard navigation, focus management, contrast, non-color labels and accessible confirmations.
- [ ] Add contextual help for indicator, financial and beneficiary methodology; preserve the existing sidebar color.

## Acceptance gates
1. Database inventory reconciles across internal/public views with explicit demo and approval scopes.
2. Administrator, DoCC M&E Officer, assigned Project Manager, unassigned Project Manager and Viewer pass read/write permission tests.
3. Register → framework → report → submit → return → correct → approve → analyse → export works without data loss.
4. Every read failure is distinguishable from an empty result; previous successful data remains labelled stale.
5. All translations, tablet/mobile layouts, map selection and project identity colors are tested.
6. Production deployment is approved only after CI, browser QA and a documented rollback point pass.
