# Technical Architecture — DoCC M&E Monitoring Platform (DMP)

**Project:** Vanuatu Loss and Damage Fund Development Project
**Client:** Department of Climate Change (DoCC), Ministry of Climate Change, Government of Vanuatu
**Funded by:** Ministry of Foreign Affairs and Trade (MFAT), Government of New Zealand

This document is part of the contract Deliverable 4 documentation package.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Component Descriptions](#3-component-descriptions)
4. [Database Design](#4-database-design)
5. [Security Architecture](#5-security-architecture)
6. [Deployment Environments](#6-deployment-environments)
7. [Data Flow](#7-data-flow)

---

## 1. System Overview

The DMP is a full-stack, multi-user web-based M&E system. It consists of a
React single-page application (SPA) served as static files, and a Supabase
backend that provides the PostgreSQL database, authentication, file storage,
auto-generated REST API, and real-time change notifications.

```
┌───────────────┐   HTTPS/TLS 1.2+    ┌─────────────────────────────────────┐
│   Browser     │ ──────────────────► │  nginx reverse proxy (:80/:443)     │
│  (any modern  │                     │   ├─ dmp.gov.vu     → frontend      │
│   browser)    │                     │   └─ api.dmp.gov.vu → Supabase Kong │
└───────────────┘                     └───────────┬─────────────┬───────────┘
                                                  │             │
                                       ┌──────────▼───┐   ┌─────▼────────────────────┐
                                       │  Frontend    │   │  Supabase (self-hosted)  │
                                       │  React SPA   │   │   ├─ Auth (GoTrue, JWT)  │
                                       │  static via  │   │   ├─ PostgREST (API)     │
                                       │  nginx :3000 │   │   ├─ Realtime (WebSocket)│
                                       └──────────────┘   │   ├─ Storage (files)     │
                                                          │   └─ PostgreSQL 15       │
                                                          │       + PostGIS          │
                                                          └──────────────────────────┘
```

There is **no custom backend server**. All business rules that must be
enforced server-side live in the PostgreSQL schema itself: Row-Level
Security (RLS) policies, triggers, constraints, and the immutable audit
log. This keeps the system simple to operate and fully self-hostable by
Government ICT staff.

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript, Vite 5 | Single-page application |
| Styling | Tailwind CSS 3.4 | Responsive UI, low-bandwidth friendly |
| Charts | Recharts 2 | KPI charts, indicator trend lines |
| Mapping | Leaflet 1.9 (react-leaflet) | GIS mapping, spatial disaggregation |
| i18n | i18next / react-i18next | English and French interfaces |
| Data fetching | @tanstack/react-query, supabase-js v2 | Server state, caching |
| File parsing | PapaParse (CSV), SheetJS/xlsx (Excel) | Dataset import |
| Report export | SheetJS (Excel); PDF export | DoCC / MFAT-aligned reports |
| Backend | Supabase v2 (self-hostable) | Auth, REST API, Realtime, Storage |
| Database | PostgreSQL 15 + PostGIS | All M&E data, spatial data, audit log |
| Deployment | Docker Compose + nginx | Government server deployment |

All components are open-source and self-hostable, satisfying the contract's
national-ownership and data-sovereignty requirements.

## 3. Component Descriptions

### 3.1 Frontend (React SPA)

Six role-gated modules, matching the navigation sidebar:

| Route | Module | Purpose |
|---|---|---|
| `/dashboard` | Dashboard | KPI overview, indicator progress, recent activity |
| `/projects` | Projects | Project portfolio, RBM results chains |
| `/datasets` | Datasets | CSV/Excel upload, photo/document evidence, approval workflow |
| `/analysis` | Analysis & GIS | Trend analysis, disaggregation, Leaflet map views |
| `/reports` | Reports | Generate and download DoCC/MFAT-aligned reports |
| `/admin` | Admin Panel | User management, project configuration (Admin only) |

The app runs in two modes controlled by `VITE_APP_ENV`:

- **Demo mode** (`VITE_APP_ENV` ≠ `production`): local demo accounts and
  mock data allow stakeholder review on static hosting (GitHub Pages)
  without exposing real data.
- **Production mode**: Supabase Auth logins only; all data comes from the
  live database.

### 3.2 Supabase services

| Service | Role in the DMP |
|---|---|
| **GoTrue (Auth)** | Email/password login, JWT issuance (1-hour expiry, auto-refresh), TOTP MFA |
| **PostgREST** | Auto-generated REST API over the `merl` schema; every request executes under the caller's JWT so RLS applies |
| **Realtime** | WebSocket change feeds — used for dataset-approval notifications |
| **Storage** | Project-scoped private buckets for photos, PDFs, and signed agreements (Means of Verification) |
| **Kong** | API gateway in front of the above services |

## 4. Database Design

Single schema `merl` (see `supabase/migrations/0001_initial_schema.sql`).

### 4.1 Core tables

| Table | Contents |
|---|---|
| `users` | Application user profiles and roles |
| `indicators` | Indicator definitions: baseline, target, unit, domain, GEDSI disaggregation type |
| `indicator_values` | Time-series indicator measurements with reporting period, province, disaggregation |
| `activities` / `activity_milestones` | RBM activities and their milestones |
| `financial_transactions` | Disbursements and expenditures per activity |
| `ld_events` | Loss & damage events with PostGIS geometry (`geom`) for mapping |
| `community_engagements` | Consultations, trainings, awareness sessions by province/island |
| `learning_entries` | MERL lessons-learned register |
| `document_uploads` | Evidence file metadata (files live in Supabase Storage) |
| `audit_logs` | Immutable audit trail — INSERT-only; DELETE/TRUNCATE revoked |

### 4.2 GEDSI disaggregation

Disaggregation (sex, age, disability, location) is a first-class column set
on `indicator_values`, not an afterthought — data cannot be entered without
passing through the disaggregation model, satisfying the contract's GEDSI
requirement.

### 4.3 Spatial data

PostGIS is enabled. `ld_events.geom` carries event geometry with a GIST
index; provinces and islands are recorded on engagement and indicator
records for spatial disaggregation in the Analysis module.

## 5. Security Architecture

Defence in depth, in four layers:

1. **Transport** — HTTPS/TLS 1.2+ everywhere; HSTS; security headers set
   at the nginx proxy.
2. **Authentication** — Supabase Auth: bcrypt-hashed passwords (min 10
   characters), JWT tokens expiring after 1 hour with automatic refresh,
   TOTP MFA (mandatory for the System Administrator role).
3. **Authorization** —
   - *Application level*: role-based navigation and route guards
     (`TAB_ACCESS` in `frontend/src/App.tsx`).
   - *Database level*: Row-Level Security policies on every table.
     Because PostgREST executes queries as the calling user, RLS holds even
     if the application layer is bypassed or an API request is crafted
     directly.
4. **Accountability** — every create/update/delete is recorded in
   `merl.audit_logs` (user identity, timestamp, changed values). The table
   is INSERT-only; DELETE and TRUNCATE privileges are revoked.

### 5.1 User roles

| Role | Access |
|---|---|
| System Administrator | All modules incl. Admin Panel; user and project management; MFA mandatory |
| DoCC Senior Officer | Dashboard, Projects, Datasets, Analysis, Reports (approve/publish) |
| DoCC M&E Officer | Dashboard, Projects, Datasets, Analysis, Reports (full read/write) |
| Project Manager | Dashboard, Projects, Datasets, Analysis, Reports (assigned projects) |
| Field Staff | Datasets, Analysis (data submission and review) |

> **Known gap (tracked):** the database `user_role` enum predates the final
> five-role model and must be aligned. See the repository issue
> "Align database role enum with the five contract roles".

## 6. Deployment Environments

| Environment | Frontend | Backend | Purpose |
|---|---|---|---|
| Development | Vite dev server (localhost:5173) | Supabase Cloud (dev project) | Consultant development |
| Staging | GitHub Pages (demo mode) | Mock data / Supabase Cloud | Stakeholder review, UAT |
| **Production** | Docker on Government server | **Self-hosted Supabase** on the same server | Final deployment — all data inside Government systems |

The migration from staging to the Government server is fully scripted in
[migration-runbook.md](migration-runbook.md).

## 7. Data Flow

Example — an M&E Officer uploads a quarterly indicator CSV:

1. Officer signs in; GoTrue returns a JWT encoding their identity.
2. Officer uploads the CSV in **Datasets**; PapaParse parses it in the
   browser, columns are auto-mapped and validated client-side.
3. Rows are written via supabase-js → PostgREST → PostgreSQL. RLS verifies
   the officer's role permits writes to `indicator_values`.
4. A database trigger writes the change to `audit_logs`.
5. Supabase Realtime broadcasts the new dataset; reviewers see an in-app
   notification and approve or return the dataset.
6. Approved data immediately appears in Dashboard KPIs, Analysis charts,
   and generated reports.
