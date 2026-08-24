# Deliverable 5 — Final Report + Handover (DRAFT)

**Project:** Development of the DoCC M&E Monitoring Platform (DMP) — MERL Dashboard
**Contract:** L&D C.08 | Vanuatu Loss and Damage Fund Development Project
**Contractor:** Micky E. Welin, Vanua Spatial Solutions (VSS)
**Submitted to:** Project Manager, Department of Climate Change (DoCC)
**Contract period:** 01 July 2026 – 11 August 2026
**Status:** DRAFT — final report & handover — due Day 30 (~30 Jul 2026)

> **Consultant's note:** items marked ⚠ are confirmed at contract close (final
> dates, UAT outcomes, and handover acknowledgements).

---

## 1. Executive summary

This report concludes Contract L&D C.08 — development of the DoCC M&E Monitoring
Platform (DMP) — delivered by Micky E. Welin / Vanua Spatial Solutions (VSS) for
the Department of Climate Change, with MFAT (New Zealand) funding support. The
assignment delivered a full-stack, multi-user, web-based M&E system for DoCC,
initially supporting the Vanuatu Loss and Damage Fund Development Project and
architected to scale to all DoCC-managed climate projects.

All five contract deliverables were completed: **D1 Inception**, **D2
Prototype**, **D3 Final Dashboard**, **D4 Documentation & Training** and this
**D5 Final Report + handover**. ⚠ *[confirm final acceptance dates]*

## 2. Assignment recap

- Objective — design, develop, test, deploy, document and hand over the DMP
  within 30 working days (01 Jul – 11 Aug 2026).
- Approach — consultative requirements; iterative build validated by prototype
  UAT; low-cost, self-hostable, open-source architecture; GEDSI and honest data
  handling throughout.

## 3. Deliverables produced

| # | Deliverable | Status |
|---|---|---|
| 1 | Inception report — work plan, requirements, architecture. | ⚠ *[approved / date]* |
| 2 | Prototype dashboard — staging deploy for DoCC review & UAT. | ⚠ *[approved / date]* |
| 3 | Final dashboard — production deployment; admin handed to DoCC. | ⚠ *[approved / date]* |
| 4 | Documentation & training — docs package + 2 sessions. | ⚠ *[approved / date]* |
| 5 | Final report + full system handover (this document). | ⚠ *[submitted / date]* |

## 4. The delivered system

The DMP provides: an executive Dashboard/Overview; Projects configured as RBM
results chains with GEDSI disaggregation; Datasets with CSV/Excel upload,
validation and evidence; an approval workflow with notifications and an immutable
audit log; Analysis (KPIs, indicator trends, GEDSI views; existing province map
retained, GIS descoped); DoCC/MFAT-aligned Reports (PDF/Excel); and five-role
Administration with an EN/FR interface. Built on React/Vite and self-hosted
Supabase (PostgreSQL + PostGIS) with RBAC + Row-Level Security, MFA and
HTTPS/TLS.

## 5. Outcomes against the Terms of Reference

- **Improved data visibility and decision-making** — KPIs and analytics in one
  place.
- **Enhanced efficiency in data management and reporting** — bulk upload,
  validation and one-click DoCC/MFAT reports reduce manual effort.
- **Increased transparency and accountability** — approved, auditable data
  accessible to authorised users, partners and donors.

## 6. Challenges and lessons learned

| Challenge | Response / lesson |
|---|---|
| Inconsistent source data and definitions | Consolidated into one model with controlled vocabularies; gaps shown honestly, not inferred. |
| Scope management within 30 days | GIS descoped by written variation (05 Jul 2026); change control applied from Day-10 sign-off. |
| Connectivity / device constraints | Bandwidth-light UI validated on government devices. |
| ⚠ *[other]* | ⚠ *[response]* |

## 7. Recommendations & sustainability

- Complete migration of authoritative data and retire parallel spreadsheets.
- Confirm DoCC ICT ownership: backups, MFA enrolment and account lifecycle
  (`docs/ict-handover-checklist.md`).
- Extend the platform to further DoCC-managed climate projects, as architected.
- ⚠ *[any phase-2 recommendations, e.g. reinstating GIS layers under a future
  variation]*

## 8. Handover

- Source-code repository transferred to DoCC (full history).
- Administrator access and credentials handed over; documentation package in
  `docs/`.
- ⚠ *[record repository location/owner and the handover acknowledgement]*

## 9. Acceptance

| | Name | Signature | Date |
|---|---|---|---|
| Submitted by (Contractor) | Micky E. Welin | | |
| Approved by (DoCC Project Manager) | | | |
