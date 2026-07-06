# Contract Deliverables Tracker

**Contract:** L&D C.08 — Development of the DoCC M&E Monitoring Platform (MERL Dashboard)
**Contractor:** Micky E. Welin / Vanua Spatial Solutions (VSS)
**Purchaser:** Department of Climate Change (DoCC), Ministry of Climate Change, Government of Vanuatu
**Contract price:** VUV 1,000,000 — paid per approved deliverable (5 milestones)
**Period:** 01 July 2026 – 11 August 2026 (30 working days)

Each deliverable requires **written approval from the DoCC Project Manager**
before the corresponding milestone payment is released.

| # | Deliverable | Contract due | Status | Approved (date / by) |
|---|---|---|---|---|
| 1 | [Inception Report](D1-inception-report.md) — work plan, requirements, architecture proposal | Day 10 (~10 Jul 2026) | **Draft — in review** | |
| 2 | Prototype Dashboard — deployed to staging for DoCC review & UAT | Day 24 (~24 Jul 2026) | In progress (staging demo live) | |
| 3 | Final Dashboard — production deployment incl. UAT feedback, field forms, MFAT-aligned reports; admin access handed to DoCC *(GIS layers descoped — see change record)* | Day 28 (~28 Jul 2026) | Not started | |
| 4 | Documentation & Training — role-specific user manual, technical architecture, sysadmin guide, migration runbook; 2 training sessions (M&E Officers Day 27, Field Staff Day 28) | Day 29 (~29 Jul 2026) | Docs drafted in `docs/`; training not yet scheduled | |
| 5 | Final Report + full system handover incl. source code repository | Day 30 (~30 Jul 2026) | Not started | |

## Working rhythm (from the accepted quotation)

| Phase | Days | Focus |
|---|---|---|
| 1 — Inception & requirements | 1–10 | Stakeholder workshops, data-system review, requirements sign-off |
| 2 — Design & architecture | 11–12 | Schema + wireframes sign-off, repo & environments |
| 3 — Development & integration | 13–24 | Core modules, Supabase backend, staging deploy |
| 4 — Testing, training & deployment | 25–28 | UAT, fixes, training, production deploy, runbook validation |
| 5 — Handover & final report | 29–30 | Handover package, final review meeting |

**Change control:** scope additions after Day 10 requirements sign-off
require written approval from the DoCC Project Manager (risk register,
quotation §Risk Management).

## Change record

| Date | Change | Scope affected |
|---|---|---|
| 05 Jul 2026 | GIS/map features removed from the contract (GIS layers dropped from D2 prototype scope and D3 final dashboard scope; the Analysis map already built remains in the app as-is, with no further GIS work) | D2, D3 |

File the written variation/approval for each change in `acceptance/`
alongside the milestone approvals.

## Acceptance record

Store each signed approval (email or scanned letter) alongside this file as
`acceptance/D<N>-approval.<ext>` when received.
