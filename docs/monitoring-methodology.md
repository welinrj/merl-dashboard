# MERL monitoring and reporting methodology

This document defines the portal's shared meanings so the same term is not calculated differently on different pages.

## Project inventory
- **Registered projects**: all project records the signed-in user may access.
- **Approved public projects**: records explicitly eligible for public display.
- **Demo / non-approved records**: may appear internally when permitted but are not verified public achievements.

## Operational status
The portal groups project status into the shared buckets in `frontend/src/lib/dashboardFilters.jsx`:
- Ongoing / On Track: active, on_track, ongoing, in_progress.
- At Risk: at_risk, delayed, suspended, on_hold.
- Planning / Not Started: planning, not_started, pipeline, approved.
- Completed: completed, closed.
- Cancelled: cancelled.
- Any other value is shown as Other / Unclassified rather than silently reassigned.

## Project progress
Project progress is calculated from the **latest approved progress record per indicator**. Historical reporting periods must not overweight an indicator simply because it has more rows. If no approved indicator progress exists, display `Not yet reported` or `—`; do not manufacture 0%.

A portfolio average is only a monitoring summary. It must always be accompanied by indicator counts and should not be interpreted as a weighted measure of impact unless a formal weighting methodology is adopted.

## Finance
Keep these fields distinct:
- Approved budget.
- Funds received.
- Funds committed.
- Cumulative expenditure.
- Remaining balance.
- Budget utilisation = cumulative expenditure / approved budget.

Investment or approved budget is not expenditure. Physical progress and financial utilisation are displayed separately; their percentage-point difference is a management signal, not a performance score by itself.

## Beneficiaries
- Direct and indirect beneficiaries are separate categories.
- Female, male and other/not reported form a gender partition of direct beneficiaries when populated.
- Youth and disability are overlapping characteristics of the same direct population and must not be added to the total.
- Portfolio totals use the shared double-counting method in the beneficiary aggregation/project-analysis utilities.
- Reporting and public totals should use approved reporting periods where approval scope applies.

## Risks and issues
Open risks exclude records whose status is closed/resolved. Overdue actions are open records with a due date before today. High and critical counts apply only to unresolved records.

## Reporting compliance
- Pending approval: submitted or under-review periods.
- Overdue: due date passed and period is not approved.
- Approved: official locked reporting period.
- Returned: requires correction and resubmission.

## Data freshness and failures
A failed data request is not an empty dataset. Pages must distinguish loading error, genuine empty data and stale previously loaded data. When a previous successful snapshot is retained, label it stale and show the failed source(s).

## Public information
Public pages and public-facing reports must show approved information only. Expected outcomes and planned outputs are plans, not verified achievements, and should be labelled accordingly.
