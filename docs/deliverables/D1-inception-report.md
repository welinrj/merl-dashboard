# Deliverable 1 — Inception Report (DRAFT)

**Project:** Development of the DoCC M&E Monitoring Platform (DMP) — MERL Dashboard
**Contract:** L&D C.08 | Vanuatu Loss and Damage Fund Development Project
**Contractor:** Micky E. Welin, Vanua Spatial Solutions (VSS)
**Submitted to:** Project Manager, Department of Climate Change (DoCC)
**Contract period:** 01 July 2026 – 11 August 2026
**Status:** DRAFT for DoCC Project Manager review — due Day 10

> **Consultant's note:** sections marked ⚠ require input from the Phase 1
> stakeholder workshops before this report is finalised for sign-off.

---

## 1. Introduction

This Inception Report is the first contract deliverable. It confirms the
consultant's understanding of the assignment, presents the requirements
gathered to date, proposes the system architecture, and sets out the work
plan for the 30-day contract.

The assignment: design, develop, test, deploy, and hand over the DoCC M&E
Monitoring Platform (DMP) — a full-stack, multi-user, web-based M&E system
for the Department of Climate Change. The initial implementation supports
the Vanuatu Loss and Damage Fund Development Project (funded by MFAT New
Zealand), with the platform architected from the outset to scale to all
DoCC-managed climate projects.

## 2. Requirements Summary

### 2.1 Functional requirements (from TOR + consultations)

1. **Results-Based Management (RBM) core** — each project configured as a
   results chain (goal → outcomes → outputs → activities → indicators with
   baselines, targets, and GEDSI disaggregation).
2. **Data input** — CSV/Excel bulk upload with column mapping and
   validation; photo/document evidence upload (Means of Verification);
   manual online entry forms.
3. **Approval workflow** — datasets are reviewed and approved before they
   enter reporting, with real-time notifications.
4. **Dashboard & analysis** — KPI overview, indicator trends (Recharts),
   GEDSI disaggregation views, GIS mapping (Leaflet) by province/island.
5. **Reporting** — in-browser generation of DoCC/MFAT-aligned reports,
   exportable as PDF and Excel.
6. **Administration** — five-role user management, project configuration,
   audit log.
7. **Bilingual interface** — English and French.

### 2.2 Non-functional requirements

- **Data sovereignty:** production data hosted on the Vanuatu Government
  server; open-source, self-hostable stack; full handover to DoCC.
- **Security:** RBAC + PostgreSQL Row-Level Security; bcrypt password
  hashing (min 10 chars); JWT expiry 1 h with auto-refresh; TOTP MFA
  (mandatory for administrator); immutable audit logging; HTTPS/TLS.
- **Context fit:** optimised for Pacific government bandwidth and devices;
  simple field-user flows.

### 2.3 User roles

System Administrator; DoCC Senior Officer; DoCC M&E Officer; Project
Manager; Field Staff (access matrix in `docs/user-manual.md` §2).

### 2.4 ⚠ Outstanding requirements questions for Phase 1 workshops

- Final indicator framework and baselines for the L&D Fund results chain
- Existing data sources/systems to import (formats, owners, history)
- Confirmation of user list and role assignments
- Government server specifications and network constraints (validates
  `docs/migration-runbook.md` §1.1)
- Final production domain name(s)
- MFAT/DoCC report templates to reproduce in the Reports module

## 3. Proposed Architecture

Summarised here; full detail in `docs/architecture.md`.

- **Frontend:** React 18 + TypeScript (Vite), Tailwind CSS, Recharts,
  Leaflet, i18next (EN/FR).
- **Backend:** Supabase v2 — PostgreSQL 15 + PostGIS, GoTrue auth (JWT +
  MFA), PostgREST API, Realtime, Storage. No custom server-side code;
  server-enforced rules live in the database (RLS, triggers, immutable
  audit log).
- **Deployments:** staging on GitHub Pages (demo mode) + Supabase Cloud
  during development and UAT; production on the Government server via
  Docker Compose + nginx with self-hosted Supabase (migration fully
  scripted in `docs/migration-runbook.md`).

## 4. Work Plan (30 days, 01 Jul – 11 Aug 2026)

| Phase | Days | Activities | Deliverable |
|---|---|---|---|
| 1 Inception & requirements | 1–10 | Stakeholder workshops (DoCC M&E Officers, PM, LDWG); review existing data systems; confirm roles; finalise requirements & architecture | **D1: this report** (Day 10) |
| 2 Design & architecture | 11–12 | Final schema (PostgreSQL + PostGIS); UI/UX wireframes; RBM chain configured for L&D Fund; environments & repository | Architecture sign-off (appendix to D1) |
| 3 Development & integration | 13–24 | Core modules (dashboard, projects, datasets, analysis/GIS, reports, admin); Supabase backend; staging deploy | **D2: prototype dashboard** (Day 24) |
| 4 Testing, training & deployment | 25–28 | UAT with DoCC; fixes; training (M&E Officers Day 27, Field Staff Day 28); production deploy; runbook validation | **D3: final dashboard** (Day 28) |
| 5 Handover & final report | 29–30 | Documentation package; final review meeting; source-code handover | **D4: docs & training** (Day 29); **D5: final report + handover** (Day 30) |

## 5. Stakeholder Engagement Plan

| Stakeholder | Role | Engagement |
|---|---|---|
| DoCC Project Manager | Primary client; approves deliverables | Weekly check-ins; sign-off meetings |
| DoCC M&E Officers | Define indicators; validate data; reports | Requirements workshop (Days 3–5); UAT (Day 25); training (Day 27) |
| DoCC Senior Officers | Oversight; approve reports | Demonstration + report walkthrough |
| LDWG | Report consumer | Consultation session; shared reporting views |
| MFAT New Zealand | Report consumer | Reports module aligned to MFAT templates |

## 6. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Stakeholder availability (Days 1–10) | Workshop dates fixed at commencement; asynchronous questionnaires as backup |
| Connectivity / infrastructure constraints | Bandwidth-light UI; server requirements documented early in the runbook |
| User adoption | Role-specific training; plain-language manuals; support through contract end |
| Scope creep | Written DoCC PM approval required for scope additions after Day 10 sign-off |

## 7. Acceptance

| | Name | Signature | Date |
|---|---|---|---|
| Submitted by (Contractor) | Micky E. Welin | | |
| Approved by (DoCC Project Manager) | | | |
