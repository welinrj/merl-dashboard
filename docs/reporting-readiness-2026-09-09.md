# Reporting readiness — 9 September 2026

Status: OPEN. This is a source-review finding, not a completed production test.

The existing Reports.jsx selects the latest financial record by created_at and does not apply the selected reporting period consistently to project progress, activities, risks, and learning. The project report also omits a distinct current-period actual column. Do not use a historical report as evidence of period-specific performance until those defects are corrected and retested.

Required verification: select a historical reporting period; confirm its financial and indicator values; compare with a later period; verify no later records leak into the historical report; confirm missing values remain missing; verify draft/review/approved status and source evidence; print and inspect the resulting PDF. No production records may be modified for this test.
