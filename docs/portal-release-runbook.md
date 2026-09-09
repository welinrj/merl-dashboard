# MERL Portal release and rollback runbook

## Purpose
Use this runbook for every production change to the DoCC MERL Portal. A successful frontend build is necessary but is not sufficient evidence that a release is safe.

## Release sequence
1. Create a feature branch from the current `main` commit and record that commit SHA as the rollback point.
2. Do not reset, truncate, delete or reseed production data as part of a frontend release.
3. Add database changes only as forward migrations. Review any `DROP`, `TRUNCATE` or mass `DELETE` manually.
4. Run the normal CI workflow, Portal browser QA and `Portal overhaul release gate`.
5. Test with the five acceptance identities: System Administrator, DoCC M&E Officer, assigned Project Manager, unassigned Project Manager and Viewer.
6. Complete the workflow test: register/select project → results framework → reporting period → save sections → submit → review/return → correct → approve → analyse → export.
7. Confirm the public portal displays only approved public information and that demo/unapproved records are not presented as verified achievements.
8. Confirm project counts, beneficiary totals, financial totals and status counts agree between the internal overview, project analysis, reports and public scope definitions.
9. Check tablet and mobile layouts, keyboard focus, map interaction, empty/error states and English/French controls.
10. Merge only after the acceptance checklist is signed off.

## Database safety before release
- Record the current migration version and production project count.
- Record counts for projects, reporting periods, approved periods, indicators, financial rows, beneficiary rows and users.
- Never use frontend deployment as a mechanism to change or reset credentials.
- Approved reporting periods must remain locked unless reopened through the controlled workflow.

## Smoke test after deployment
- Sign in and load Dashboard Overview.
- Verify project total and status breakdown.
- Open one project workspace and confirm framework, finance, beneficiaries, risks, locations and reporting history load.
- Open Results & Indicators and verify approved progress is not replaced by zero when data is absent.
- Open Review & Approval and verify a non-reviewer cannot act.
- Generate a report and export CSV.
- Open the public portal anonymously and verify approved-only messaging and project count scope.

## Rollback
If a release introduces a regression:
1. Stop further production changes.
2. Re-deploy the recorded pre-release `main` commit SHA.
3. Do **not** reverse a data migration by deleting data. Create a corrective forward migration when required.
4. Re-run the production smoke test.
5. Document the failed release, affected functions and corrective action before retrying.

## Release evidence to retain
- Pull request and commit SHA.
- CI, browser QA and release-gate results.
- Role test results.
- Production smoke-test notes.
- Database pre/post counts when migrations are included.
- Rollback SHA.
