# MERL dashboard results audit — 8 October 2026

## Scope and conclusion

Audited the live database used by the dashboard, submitted indicator records, results framework, activity links, reporting periods, portfolio calculations, project analysis, report/export calculations, public snapshot generation and public page. Reconciled the submitted L&D Year 1 report (June 2025–June 2026) to the database. Reviewed current VCAP records to check that older backfilled reports cannot replace newer reporting periods.

The L&D update is present: **29 indicators, 29 linked activities, 29 annual targets, 29 result records and 29 narrative-bearing results**. There are no duplicate progress rows or cross-project indicator links in the checked data. Two L&D achievements are unreported and remain missing. Three source inconsistencies retain attention flags. Financial figures that conflict within the source were not invented or imported.

The authenticated pages were audited through their data queries, calculations and regression tests. A signed-in browser session was not available, so the authenticated visual workflow was not exercised. This is a results and data-flow audit, not a security certification or verification of the underlying real-world accomplishments.

## Findings and corrections

| Finding | Correction |
|---|---|
| Historical records counted repeatedly in some headline totals | Select one latest operational result per indicator, using reporting-period end, then revision date. |
| Recently uploaded older reports could replace newer results | Reporting chronology takes precedence over upload date, including financial and report selectors. |
| Portfolio pages used different weighting | Equal indicator weights within each reporting project and equal project weights in the portfolio. Contributions are capped at 100%; missing results are excluded. |
| Project indicator query omitted identifier needed to match progress | Query includes indicator ID and matches the selected result correctly. |
| Results table hid records beyond the first 30 | Show all latest reported indicator results. |
| Missing period progress, beneficiaries or expenditure displayed as zero | Preserve NULL; explicit reported zero remains zero. |
| Partial-document achievements recalculated from missing document counts | Keep submitted achievement percentage, including 50% and 10%, without inventing fractional completed documents. |
| Year 1 results recalculated against final multi-year targets | Recorded period achievement takes precedence; procurement remains 100% for the reported year. |
| Recorded attention/on-track judgements lost to generic heuristics | Preserve the submitted performance status in project analysis. |
| Pages remained stale after other submissions | Refresh on focus/online and every minute while visible. |
| Dashboard query failures could appear as empty data | Main dashboard and results framework fail visibly instead of reporting empty totals. |
| Inline result narratives were excluded from narrative coverage | Period summary counts the submitted inline narratives. |
| Hardcoded public profile values overwrote published updates | Authoritative published values take precedence; profile data fills missing fields only. |
| Public generator did not consistently require approved indicator records | Keep period approval, individual record approval and configured public visibility gates. No records were automatically approved or made public. |
| Public KPI NULL achievement could become a numeric value through SQL least/greatest | Explicitly preserve missing achievement, including when a newer approved result is blank. |
| Mixed-currency investment amounts summed without conversion | Convert portfolio totals using the same RBV rate snapshot as the portal (25 September 2026); preserve original currency on project rows. |

The equal-project headline represents only projects with numeric reported achievements, not all projects. It is a portfolio indicator-achievement measure, not the share of projects completed. Activity implementation and reporting completion remain separate measures.

## Reconciled figures

| Measure | Verified result |
|---|---:|
| L&D reported Year 1 indicators | 29 |
| L&D indicators with numeric achievements | 27 |
| L&D average reported achievement | 34.54% |
| L&D overall performance status | Attention |
| VCAP latest indicator average | 48.46% |
| Equal-project headline across those two reporting projects | 41.5% |
| L&D needs assessment progress | 50% |
| L&D concept note progress | 10% |
| L&D officers recruited | 7 of 8; 87.5%; attention |
| L&D procurement Year 1 | 1 of 1; 100%; final target remains 2 |
| L&D MERL reports | 3 of 12; 25% |
| L&D blank achievements | Governance and society-wide awareness |
| Approved L&D indicator result records | 0 |
| L&D indicators marked public | 0 |

The L&D reporting period is marked approved, but all 29 individual results remain submitted. Public L&D progress therefore remains **not yet published**. Public beneficiaries and utilisation are **not reported**, not zero. The refreshed database-wide public investment summary is **VT 4,852,547,944.72** across 23 project profiles using recorded currencies and the fixed rate snapshot; page filters can change this total.

## Source issues retained for review

- Options paper is recorded as Complete while the achieved value is 0 and approval is pending. Preserve the numeric result and attention note.
- Recruitment target is 8 in the update versus 7 in the earlier plan. Preserve the new annual target and actual 7 with attention.
- Funds made available states a 50% target and an achieved value of 10 without a percent sign. The import records 10 percentage points, giving 20% achievement, with an interpretation note and attention flag.
- The summary states six completed outputs while seven table rows say Complete. The row-level records remain authoritative for the import; no summary total is fabricated.
- Financial expenditure and available-balance statements conflict. No financial result was imported from those statements.

Evidence metadata is linked to the import. The original report was not uploaded to dashboard evidence storage; metadata should not be mistaken for a downloadable attachment.

## Validation and residual limits

- 203 automated tests pass, including reporting chronology, revisions, draft exclusion, equal-project weighting, missing versus zero, partial-document achievements, period-specific targets, recorded attention, finance period scope, currency conversion and published profile precedence.
- Production Vite build and TypeScript check pass.
- Both database migrations applied successfully to the live dashboard database. Public snapshots refreshed and SQL reconciliation verified.
- No approval or public visibility settings changed.
- Supabase security advisory review also surfaced disabled leaked-password protection and informational security-definer function notices. Those account/security settings were not altered by this results audit.
- Verification covers the current records and calculation paths; missing or contradictory source evidence remains unresolved until corrected by the reporting owner.
