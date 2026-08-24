# Deliverable 3 — Final Dashboard (DRAFT)

**Project:** Development of the DoCC M&E Monitoring Platform (DMP) — MERL Dashboard
**Contract:** L&D C.08 | Vanuatu Loss and Damage Fund Development Project
**Contractor:** Micky E. Welin, Vanua Spatial Solutions (VSS)
**Submitted to:** Project Manager, Department of Climate Change (DoCC)
**Contract period:** 01 July 2026 – 11 August 2026
**Status:** DRAFT — production deployment — due Day 28 (~28 Jul 2026)

> **Consultant's note:** GIS layers are descoped (variation of 05 Jul 2026); the
> Analysis map already built remains in the app as-is. Sections marked ⚠ are
> completed at deployment.

---

## 1. Introduction

This deliverable is the final, production DoCC M&E Monitoring Platform (DMP),
deployed to the Government server with UAT feedback incorporated, field forms and
MFAT-aligned reports completed, and administrator access handed to DoCC. It
confirms the delivered system and provides an acceptance record for sign-off by
the DoCC Project Manager. Documentation and training are delivered under D4; the
final report and full handover under D5.

## 2. Scope delivered

- Production deployment of all core modules with UAT feedback incorporated.
- Field data-entry forms and DoCC/MFAT-aligned report templates.
- Administrator access handed to DoCC.
- ⚠ GIS layers descoped (05 Jul 2026); the existing Analysis map remains as-is
  with no further GIS work.

## 3. Deployment and access

| Item | Detail |
|---|---|
| Environment | Vanuatu Government server — self-hosted Supabase via Docker Compose + nginx (see `docs/migration-runbook.md`, `docs/docc-go-live-runbook.md`). |
| Production URL | ⚠ *[insert production domain]* |
| Data sovereignty | Production data hosted on the Government server; open-source, self-hostable stack. |
| Admin access | Handed to DoCC. ⚠ *[confirm account provisioning + MFA enrolment]* |
| Backup / continuity | See `docs/backup-restore.md`. |

## 4. Modules & features (final)

| Module | Delivered capability |
|---|---|
| Dashboard / Overview | Executive KPIs (Projects, Total Funding, Disbursed, Beneficiaries); Vanuatu province summary; implementation-performance and needs-attention views; single filter bar with Reset and contextual Export. |
| Projects (RBM) | Results chains: goal → outcomes → outputs → activities → indicators with baselines, targets and GEDSI disaggregation. |
| Datasets / data input | CSV/Excel bulk upload with mapping and validation; evidence (MoV) upload; online entry forms; field forms. |
| Approval workflow | Draft → Submitted → Reviewed → Approved / Returned with notifications; approved data protected; immutable audit log. |
| Analysis | KPI overview, indicator trends (Recharts), GEDSI disaggregation. Existing province map retained (GIS descoped). |
| Reports | DoCC/MFAT-aligned reports generated in-browser; export to PDF and Excel. |
| Administration | Five-role user management, project configuration, audit log; EN/FR interface. |

## 5. Security, roles & permissions

Access is aligned to responsibilities across five roles (access matrix in
`docs/user-manual.md` §2):

- **System Administrator** — users, roles, configuration; MFA mandatory.
- **DoCC Senior Officer** — oversight; approve reports.
- **DoCC M&E Officer** — define indicators; validate and approve data.
- **Project Manager** — manage projects, activities and reporting.
- **Field Staff** — field data entry within assigned projects.

Enforced by RBAC + PostgreSQL Row-Level Security, bcrypt password hashing, JWT
(1 h expiry + refresh), TOTP MFA, immutable audit logging and HTTPS/TLS.

## 6. Testing summary

| Test area | Coverage | Result |
|---|---|---|
| Functionality | Core workflows across all modules; UAT with DoCC. | ⚠ *[pass/notes]* |
| Security & access | RBAC, RLS, MFA, audit log. | ⚠ *[pass/notes]* |
| Performance / context | Bandwidth-light UI on Pacific government devices. | ⚠ *[pass/notes]* |
| Deployment | Government-server deploy validated against the runbook. | ⚠ *[pass/notes]* |

## 7. Documentation, training & handover

- User and technical documentation, sysadmin guide and migration runbook, plus
  training, are delivered under D4.
- Full system handover, including the source-code repository, is delivered under
  D5.

## 8. Change record

| Date | Change | Scope affected |
|---|---|---|
| 05 Jul 2026 | GIS/map features removed from the contract (GIS layers dropped from D2/D3 scope; the Analysis map already built remains as-is, no further GIS work). | D2, D3 |
| ⚠ *[date]* | ⚠ *[any further approved variation]* | ⚠ *[scope]* |

## 9. Acceptance

| | Name | Signature | Date |
|---|---|---|---|
| Submitted by (Contractor) | Micky E. Welin | | |
| Approved by (DoCC Project Manager) | | | |
