# Functional audit remediation — 14 October 2026

Changes cover the audited production revision `7ef3953`.

| Finding | Resolution |
| --- | --- |
| F01 Submission bypass | The database now checks the same three saved reporting sections as the interface, after locking the period and checking project access. |
| F02 Legacy document permission | Removed anonymous/authenticated execution of the unused metadata endpoint; retained service-only access. Current project-scoped evidence APIs continue to work. |
| F03 Empty map | Restored the previously reviewed Big Bay Inland VCAP2 assignment and the explicit Big Bay Coast non-coverage record. Other assignments still need verified source data. Empty-state wording now specifies Area Councils rather than claiming no province locations exist. |
| F04 Missing financial records | Corrected the follow-up action to open the financial reporting module. No expenditure values were invented; verified financial reports remain required. |
| F05 Funding completeness | Public unknown legacy zero budgets publish as null, while explicitly confirmed zeros are retained. Public funding shows recorded-project coverage and is labelled Recorded Project Funding. |
| F06 Draft beneficiaries | Internal beneficiary context shows reporting period, unapproved status and pending double-counting verification. Existing reports were not automatically approved. Source verification remains required. |
| F07 Workplan-only frameworks | Results Framework explicitly distinguishes recorded structure from missing formal indicators. Source workplans explicitly lack formal indicator definitions, so none were fabricated. |
| F08 Portfolio scope | Internal overview explicitly states that its framework-based scope includes completed projects. The separate 12-project public scope is preserved. |
| F09 Auth/security | Retired the exposed legacy endpoint. Leaked-password protection is a hosted Auth setting; the connected database tools cannot change it. It remains an administrator action at https://supabase.com/dashboard/project/ndntvncboeajanipafeq/auth/settings . Supabase documents availability on Pro and above; no paid upgrade was made. Other guarded SECURITY DEFINER routines remain intentional API entry points rather than being revoked wholesale. |
| F10 French | Translated public theme options and map controls/layers. French users see a source-language fallback explanation for untranslated record content; no unverified translations replace official source text. |
| F11 QA assurance | Control sweep restores its starting state per action, records click failures, counts successful clicks, and exits nonzero for findings/network failures. A rollback-only database integration script covers actual submission, authorisation, approval, locking and reopening. |
| F12 Initial download | Lazy-loaded private workspaces and report libraries. Main application chunk reduced from approximately 1.91 MB / 560 KB gzip to 606 KB / 177 KB gzip (about 68% smaller). This is a bundle-size measurement, not a network timing claim. |
| F13 Dependencies | Compatible dependency updates plus tested router/CSS-toolchain upgrades remove the reported advisories. Supabase client pinned and lockfile committed. |

## Verification

- 244 unit tests pass; type checking and production build pass.
- Full dependency audit: zero reported vulnerabilities.
- Live database rollback test: incomplete submission blocked, unassigned manager denied, complete submission succeeds, manager approval denied, reviewer approval succeeds, approved finance locked, reopened period editable, viewer submission denied, retired document endpoint not client-executable. All fixtures and test audit entries roll back.
- New database migrations applied to the existing dashboard backend. Reviewed VCAP2 coverage is the only implementation-location data restored.
- Browser regression and deployment results are available in the pull request checks.

Run `supabase/tests/audit_workflow_rollback.sql` using an administrative database test connection. It ends with ROLLBACK and never leaves its fixture records behind. This tests the deployed database routines, not external email delivery or the evidence-analysis service.

## Still requires verified inputs or account settings

- Actual period financial reports; nine missing public project budgets; remaining Area Council assignments and missing project manager profiles.
- Official ICAT/PARTneR indicator definitions and approved translations when available.
- Beneficiary source/deduplication confirmation and the normal review/approval workflow.
- Hosted leaked-password protection (requires an eligible Supabase plan and Auth settings access).

These are not marked complete merely because their interface states are improved.
