# Staging Environment — UAT Guide

**Portal:** https://vanua-spatial-solutions.github.io/merl-dashboard/
**Backend:** Supabase project `merl-dashboard-staging` (`ndntvncboeajanipafeq`, ap-southeast-2)

The staging build signs in against live Supabase Auth and reads live data —
there are no demo accounts. The frontend targets the staging project by
default; override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at
build time for other environments.

## Test accounts

One account per contract role. **Passwords are distributed separately —
never stored in this repository.** Ask the contractor (VSS) or retrieve
them from the agreed credential channel.

| Email | Name | Role |
|---|---|---|
| ronal.tavita@vcap.gov.vu | Ronal Tavita | System Administrator (TOTP MFA enforced) |
| peter.naupa@mof.gov.vu | Peter Naupa | DoCC Senior Officer |
| jean.kalsakau@vcap.gov.vu | Jean Kalsakau | DoCC M&E Officer |
| mere.bani@vcap.gov.vu | Mere Bani | Project Manager |
| sarah.loughman@oxfam.org.vu | Sarah Loughman | Field Staff |

Notes for testers:

- The **administrator** account is walked through authenticator-app (TOTP)
  enrollment on first sign-in; subsequent sign-ins require the 6-digit code.
- Sign-out is in the sidebar footer. Sessions persist across page reloads.
- The **Dashboard** shows live indicator and budget data from the staging
  database (header says "Live data"; "Sample data (offline)" means the
  backend was unreachable).
- The **Datasets** module uploads to Supabase Storage and writes rows other
  testers see in real time; approval/rejection is limited to M&E Officer,
  Senior Officer, and Administrator roles (enforced by row-level security,
  not just the UI).

## What is enforced server-side

Row-level security follows the access matrix in `docs/user-manual.md` §2 /
`docs/architecture.md` §5.1 (migrations `0002_role_alignment.sql` and
`0003_supabase_auth.sql`). Anonymous API calls are denied outright.

## Rebuilding this environment

1. Create a Supabase project and apply, in order:
   `supabase/migrations/0001_initial_schema.sql`,
   `0002_role_alignment.sql`, `0003_supabase_auth.sql`,
   then `supabase/seed/seed_data.sql`.
2. Create the auth users (Dashboard → Authentication, or SQL) and link them:
   `UPDATE merl.users SET auth_user_id = <auth.users.id> WHERE email = <email>;`
3. Point the frontend at the project via `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (or the defaults in
   `frontend/src/supabaseClient.ts`).

## Known limits of the current staging build

- Projects, Analysis and Reports pages still render sample data; wiring to
  live data is the next Deliverable 2 work item.
- GIS layers are out of contract scope (see the change record in
  `docs/deliverables/README.md`); the existing Analysis map stays as built.
- Free-tier Supabase pauses after ~7 days of inactivity; if sign-in fails
  with a network error, restore the project from the Supabase dashboard.
