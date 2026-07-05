# Documentation — DoCC M&E Monitoring Platform (DMP)

Documentation package for the MERL Dashboard of the Vanuatu Loss and Damage
Fund Development Project. Documentation is a compulsory contract deliverable
(Deliverable 4) — every document below is kept in step with the code in
this repository.

## For platform users

| Document | Audience |
|---|---|
| [User Manual](user-manual.md) | All DoCC officers, project managers, and field staff |

## For the system administrator / Government ICT

| Document | Purpose |
|---|---|
| [System Administrator Guide](admin-manual.md) | Day-to-day administration: users, projects, audit log, health checks, troubleshooting |
| [Migration Runbook](migration-runbook.md) | **Step-by-step migration onto the Vanuatu Government server** |
| [Backup & Restore](backup-restore.md) | Daily backups, off-server copies, disaster recovery |
| [Docker Compose Reference](docker-compose-reference.md) | Service operations, updates, boot order |
| [Environment Variables](environment-variables.md) | Every configuration value and secret-handling rules |
| [ICT Handover Checklist](ict-handover-checklist.md) | Formal transfer of the system to DoCC (Deliverable 5) |

## For developers and reviewers

| Document | Purpose |
|---|---|
| [Technical Architecture](architecture.md) | Stack, components, database design, security model |
| [Contract Deliverables](deliverables/README.md) | The five contract deliverables, their status and acceptance records |

## Mapping to contract Deliverable 4

> *"Documentation and training materials — user manual (role-specific
> guides for all five user roles), technical architecture document, system
> administrator guide, Government server migration runbook."*

| Contract requirement | Document(s) |
|---|---|
| User manual (role-specific) | user-manual.md (§2 role matrix + per-module guidance) |
| Technical architecture document | architecture.md |
| System administrator guide | admin-manual.md + docker-compose-reference.md + backup-restore.md + environment-variables.md |
| Government server migration runbook | migration-runbook.md |
