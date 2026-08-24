# Deliverable 2 — Prototype Dashboard (DRAFT)

**Project:** Development of the DoCC M&E Monitoring Platform (DMP) — MERL Dashboard
**Contract:** L&D C.08 | Vanuatu Loss and Damage Fund Development Project
**Contractor:** Micky E. Welin, Vanua Spatial Solutions (VSS)
**Submitted to:** Project Manager, Department of Climate Change (DoCC)
**Contract period:** 01 July 2026 – 11 August 2026
**Status:** DRAFT — prototype for DoCC review & UAT — due Day 24 (~24 Jul 2026)

> **Consultant's note:** GIS/map features were descoped by written variation on
> 05 Jul 2026 — the Analysis map already built remains in the app as-is; no
> further GIS work is included in D2/D3. Sections marked ⚠ need DoCC input
> during UAT.

---

## 1. Introduction

This deliverable is the prototype DoCC M&E Monitoring Platform (DMP), deployed
to the staging environment for DoCC review and User Acceptance Testing (UAT). It
implements the core modules on a live Supabase staging backend (authentication +
data) so DoCC can exercise real workflows ahead of production. Staging access and
configuration are documented in `docs/staging.md`.

## 2. Scope of the prototype

The prototype delivers the core of the platform for review:

- Dashboard/Overview, Projects, Datasets (data input), Approval workflow,
  Analysis, Reports, and Administration.
- ⚠ GIS layers are out of scope (variation of 05 Jul 2026); the existing
  Analysis map remains as-is.
- Some datasets are sample data pending migration of authoritative sources. **No
  performance or financial conclusions should be drawn from prototype data.**

## 3. How to access and review

| Item | Detail |
|---|---|
| Environment | Staging — live Supabase backend (auth + data). See `docs/staging.md`. |
| URL | ⚠ *[insert staging URL]* |
| Test accounts | ⚠ *[test accounts per role, or request from the PM]* |
| Browsers | Current Chrome, Edge, Firefox or Safari (desktop and tablet). |
| Review window | ⚠ *[insert UAT dates]* |

## 4. Modules delivered in the prototype

### 4.1 Dashboard / Overview
Executive KPIs (Projects, Total Funding, Disbursed, Beneficiaries); Vanuatu
province summary; implementation-performance and needs-attention views; a single
filter bar with Reset and Export.

### 4.2 Projects
Project register and record configured as an RBM results chain (goal → outcomes
→ outputs → activities → indicators with baselines, targets and GEDSI
disaggregation).

### 4.3 Datasets — data input
CSV/Excel bulk upload with column mapping and validation; evidence (Means of
Verification) upload; manual online entry forms.

### 4.4 Approval workflow
Datasets reviewed and approved before entering reporting, with notifications
(Draft → Submitted → Reviewed → Approved / Returned).

### 4.5 Analysis
KPI overview, indicator trends (Recharts), and GEDSI disaggregation views. The
existing province map remains as-is (GIS descoped).

### 4.6 Reports
In-browser generation of DoCC/MFAT-aligned reports, exportable as PDF and Excel.

### 4.7 Administration
Five-role user management, project configuration and audit log.

## 5. Backend & data status

- Live Supabase staging backend: GoTrue authentication and PostgREST data access
  under Row-Level Security.
- ⚠ Confirm which datasets are live vs sample, and the authoritative sources to
  migrate for production.

## 6. Known limitations at prototype stage

- Selected datasets are sample data pending migration.
- Field forms and MFAT-aligned report templates are finalised for the production
  release (D3).
- ⚠ *[list any screens intentionally excluded from this prototype review]*

## 7. UAT feedback log

Please record feedback below or annotate directly. We are particularly
interested in whether the RBM structure, terminology and approval flow match
DoCC practice.

| # | Module / screen | Feedback or change requested | Priority |
|---|---|---|---|
| 1 | ⚠ *[e.g. Reports]* | ⚠ *[your comment]* | ⚠ *[H/M/L]* |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

## 8. Next steps to the Final Dashboard (D3)

1. Consolidate UAT feedback from this review.
2. Complete field forms and MFAT-aligned report templates.
3. Migrate authoritative data; production deploy to the Government server.
4. Hand administrator access to DoCC; submit D3.

## 9. Acceptance

| | Name | Signature | Date |
|---|---|---|---|
| Submitted by (Contractor) | Micky E. Welin | | |
| Approved by (DoCC Project Manager) | | | |
