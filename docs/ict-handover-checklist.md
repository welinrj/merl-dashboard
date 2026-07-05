# ICT Handover Checklist — DoCC M&E Monitoring Platform (DMP)

**Purpose:** formal transfer of the platform from the consultant (Vanua
Spatial Solutions) to the Department of Climate Change, per contract
Deliverable 5 (full system handover). Work through every section in a
joint session; both parties sign §7.

---

## 1. Source Code and Repository

- [ ] DoCC/Government GitHub organisation or account has **owner** access
      to the repository (or has received a complete archive)
- [ ] Repository contains: frontend source, database schema
      (`supabase/migrations/`), seed data, deployment stack
      (`docker-compose.yml`, `nginx/`), and all documentation (`docs/`)
- [ ] CI build passes on the default branch
- [ ] Consultant's personal access removed or downgraded as directed by DoCC

## 2. Documentation Package (contract Deliverable 4)

- [ ] Technical architecture — `docs/architecture.md`
- [ ] User manual (role-specific) — `docs/user-manual.md`
- [ ] System administrator guide — `docs/admin-manual.md`
- [ ] Government server migration runbook — `docs/migration-runbook.md`
- [ ] Backup & restore procedures — `docs/backup-restore.md`
- [ ] Environment variables reference — `docs/environment-variables.md`
- [ ] Compose operations reference — `docs/docker-compose-reference.md`
- [ ] Training materials delivered and sessions completed
      (M&E Officers: Day 27; Field Staff: Day 28)

## 3. Credentials and Secrets (hand over in person / password manager — never by email)

- [ ] Server SSH access transferred; consultant keys removed from
      `~/.ssh/authorized_keys`
- [ ] `/opt/supabase/docker/.env` secrets recorded in the Government
      password manager (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
      `SERVICE_ROLE_KEY`, Studio dashboard login, SMTP)
- [ ] `/opt/dmp/.env` recorded
- [ ] DNS zone control confirmed with Government ICT
- [ ] TLS certificate renewal method understood (certbot automatic, or
      Government CA procedure documented)
- [ ] System Administrator application account created for the DoCC ICT
      officer, with MFA enrolled
- [ ] Supabase Cloud (staging) project ownership transferred or scheduled
      for decommissioning (final backup exported first)

## 4. Operational Readiness

- [ ] DoCC ICT officer has performed, unassisted, with the consultant
      observing:
  - [ ] a manual database backup (backup-restore.md §2.1)
  - [ ] a service restart (docker-compose-reference.md §3)
  - [ ] a user creation + password reset (admin-manual.md §2)
- [ ] Daily backup cron installed and last night's dump verified
- [ ] Off-server backup destination agreed and first copy completed
- [ ] Post-migration smoke test passed and signed
      (migration-runbook.md §10)

## 5. Support Arrangements

- [ ] Post-launch support period, response times, and contact channel
      confirmed in writing (per contract: support through end of contract
      period)
- [ ] Maintenance contact after contract end:
      _Name:_ ______________  _Email/Phone:_ ______________
- [ ] Escalation path documented for issues beyond DoCC ICT capacity

## 6. Intellectual Property

- [ ] Confirmed: all designs, source code, and work products are the
      property of DoCC (contract clause D12)
- [ ] No third-party licence in the stack restricts Government use
      (all components open-source: React, Supabase, PostgreSQL, nginx,
      Docker)

## 7. Sign-off

| | Name | Signature | Date |
|---|---|---|---|
| For DoCC (Purchaser) | | | |
| DoCC ICT Officer | | | |
| For the Contractor | Micky E. Welin | | |
