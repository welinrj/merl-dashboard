# DoCC M&E Monitoring Platform (DMP) — MERL Dashboard

**Vanuatu Loss and Damage Fund Development Project**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2-3FCF8E?logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%20%2B%20PostGIS-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-Property%20of%20DoCC-red)

The DMP is the Monitoring, Evaluation, Reporting and Learning (MERL)
dashboard for the **Department of Climate Change (DoCC), Ministry of
Climate Change, Government of Vanuatu**. Its first implementation supports
the Vanuatu Loss and Damage Fund Development Project, funded by **MFAT New
Zealand**, and it is architected to scale to all DoCC-managed climate
projects.

Developed under contract **L&D C.08** by **Micky E. Welin / Vanua Spatial
Solutions (VSS)**. All designs, source code, and work products are the
property of DoCC (contract clause D12).

---

## What it does

- **RBM results chains** — goal → outcomes → outputs → activities →
  indicators with baselines, targets, and GEDSI (sex, age, disability,
  location) disaggregation built into the data model.
- **Data input** — CSV/Excel bulk upload with column mapping and
  validation; photo/PDF evidence uploads (Means of Verification); manual
  entry forms.
- **Approval workflow** — datasets are reviewed before entering reporting,
  with real-time notifications.
- **Dashboards & analysis** — KPI cards, indicator trend charts
  (Recharts), GIS mapping (Leaflet) with province/island disaggregation.
- **Reports** — DoCC/MFAT-aligned reports generated in the browser,
  exportable as PDF and Excel.
- **Security** — five-role RBAC, PostgreSQL Row-Level Security, TOTP MFA,
  immutable audit logging, HTTPS/TLS. English and French interfaces.

## Repository layout

```
frontend/              React 18 + TypeScript SPA (Vite, Tailwind, Recharts, Leaflet)
supabase/
  migrations/          PostgreSQL 15 + PostGIS schema (RLS, audit log)
  seed/                Development/demo seed data
docker-compose.yml     Production stack for the Government server
nginx/                 Reverse proxy / TLS configuration
docs/                  Full documentation package  ← start at docs/README.md
docs/deliverables/     Contract deliverables tracker + inception report
.github/workflows/     CI (build/typecheck) and GitHub Pages staging deploy
```

## Quick start (development)

```bash
cd frontend
npm install
cp .env.example .env.local     # fill in Supabase URL/key or leave demo mode
npm run dev                    # http://localhost:5173
```

Without a Supabase project configured, the app runs in **demo mode** with
five demo accounts and mock data — useful for stakeholder review. Set
`VITE_APP_ENV=production` to disable demo mode.

```bash
npm run build                  # production bundle → frontend/dist/
```

Pushes to `main` deploy the demo automatically to GitHub Pages (staging).

## Production deployment (Vanuatu Government server)

Production runs entirely on Government infrastructure — frontend, database,
files, and authentication — using Docker Compose with **self-hosted
Supabase**, satisfying the project's data-sovereignty requirement.

Follow the step-by-step **[Migration Runbook](docs/migration-runbook.md)**.
Summary:

```bash
docker network create dmp-net
# 1. deploy self-hosted Supabase (runbook §5)
# 2. restore database + storage (runbook §6–7)
cp .env.example .env           # set VITE_SUPABASE_URL + anon key
docker compose up -d --build   # frontend + TLS proxy (runbook §8)
```

## Documentation

The complete package is indexed at **[docs/README.md](docs/README.md)**:
user manual, system administrator guide, technical architecture, migration
runbook, backup & restore, environment variables, compose reference, and
the ICT handover checklist.

Contract deliverables and their status:
**[docs/deliverables/README.md](docs/deliverables/README.md)**.

## User roles

| Role | Access |
|---|---|
| System Administrator | Everything, incl. Admin Panel (user/project management); MFA mandatory |
| DoCC Senior Officer | Dashboard, Projects, Datasets, Analysis, Reports |
| DoCC M&E Officer | Dashboard, Projects, Datasets, Analysis, Reports |
| Project Manager | Dashboard, Projects, Datasets, Analysis, Reports (assigned projects) |
| Field Staff | Datasets, Analysis |

## Contributing

Maintained by Vanua Spatial Solutions on behalf of DoCC/MoCC. External
contributions are not accepted without prior written agreement.

---

*Developed for the Department of Climate Change, Government of Vanuatu.
Funded by the Ministry of Foreign Affairs and Trade (MFAT), New Zealand.*
