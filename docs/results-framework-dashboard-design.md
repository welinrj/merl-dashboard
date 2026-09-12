# Results-framework dashboard — design proposal

**Status:** proposal. Nothing here is applied. No migration, table, RPC, page or
component has been added to the portal by this document.

**Source read:** `VCAP_2_Project_Results_Framework.xlsx` (VCAP 2 results
framework, 5 sheets), read against the repository at commit `9a04787`.

**Goal:** model, record and monitor VCAP 2's results framework and the eleven
other DoCC projects in one dashboard, without a second system per donor.

A visual version of this proposal — including the four screen mockups — is
published separately as a Claude artifact; this file is the technical record.

**Superseded in part:** [`results-framework-consolidation.md`](results-framework-consolidation.md)
extends this design after reading VCCRP's GCF framework. It widens G1, G2 and
G3, adds G6 (currency) and G7 (baseline qualifiers), reorders the rollout, and
reverses one rule below — "missing is shown as missing" becomes "missing only
where a value was due," because GCF outcome indicators are collected at
mid-term and end-term only.

---

## 1. What the workbook contains

| Component | Title | Outcomes | Outputs | Indicators |
| --- | --- | ---: | ---: | ---: |
| — | Project Objective (resilience of vulnerable areas and communities) | — | — | 1 |
| 1 | Integrated community approaches to NRM and climate change adaptation | 3 | 7 | 15 |
| 2 | Information and early warning systems on coastal hazards | 1 | 3 | 2 |
| 3 | Climate change and natural resource management governance | 3 | 5 | 4 |
| 4 | Knowledge management and lessons sharing | 1 | 2 | 1 |

Totals: **4 components, 8 outcomes, 17 outputs, 23 measurable indicator rows.**

Every indicator carries a baseline, a mid-term target, an end-of-project target
and a 20-column quarterly grid running Q1 2024 – Q4 2028. Three indicators are
sex-disaggregated at target level (beneficiaries, people trained, people reached
by awareness). Seven are GEF Core Indicators with their own sub-indicator
numbering (1.1, 1.2, 2.1, 2.2, 3.1–3.4, 4.1–4.3, 5).

### 1.1 Four things in the file that must be settled before loading it

1. **Two different "Indicator 11."** The objective-level beneficiary count (`C5`)
   and the automatic weather stations under Outcome 2.1 (`C40`) share the number.
   Any join on the printed indicator number merges them.
2. **Output 1.1.2 appears twice.** On the `VCAP 2` sheet, rows 17 and 18 are both
   labelled 1.1.2; the `Component 1` sheet numbers the second one 1.1.3. The
   component sheets are the correct version.
3. **Units live inside the value.** The same column holds `1000`,
   `"200 hectares"`, `"1,000 hectares"` and `"Not Applicable"`.
4. **Targets already disagree with the portal.** The workbook puts Indicator 10
   at 25 investments end-of-project (`F36`); the profile seeded in migration
   `0018` says 15. Indicator 12 is a count in the workbook (`F41` = 25) and a
   percentage in `0018` (end 100%).

Point 1 is already solved by the portal: `0009` generates codes server-side, so
the printed number becomes a display label and the join uses the generated code.

---

## 2. Where it lands in the existing schema

| VCAP 2 element | Lands in | Status |
| --- | --- | --- |
| Project objective statement | `merl.objectives` | fits |
| Components 1–4 | — | **no level for it** |
| Outcomes 1.1 … 4.1 | `merl.outcomes` | fits |
| Outputs 1.1.1 … 4.1.2 | `merl.outputs` | fits |
| Indicator register | `merl.project_indicators` | fits |
| Baseline, end-of-project target | `baseline_value`, `target_value` | fits |
| Mid-term target | — | **no column** |
| Quarterly actuals | `merl.indicator_progress` | period is free text |
| Sex-disaggregated results | `merl.beneficiaries` | not linked to the indicator |
| Means of verification / evidence | `merl.evidence` + storage (`0048`) | fits |
| Financial delivery | `merl.financial_progress` | fits |
| Risks, lessons, PIR narrative | `risks_issues`, `learning_updates` | fits |

Most of the framework already has a home. The design below is an extension of
`0009` / `0029`, not a rebuild.

---

## 3. Five changes, all additive

Each is a new table or a nullable column, so the other eleven projects and
everything already recorded keep working the day it lands.

### G1 — A component level between objective and outcome

New `merl.components`; nullable `merl.outcomes.component_id`. Projects without
components carry null and render as today.

Each project also stores what it *calls* that level, in a `level_labels` jsonb on
`merl.projects` — GEF says Component, GCF puts Activities below Output, a
bilateral grant may say Pillar or Workstream. One spine, each donor's vocabulary
on screen and in reports.

Reusing `merl.objectives` for components was rejected: VCAP 2 has a real single
objective carrying the mandatory beneficiary indicator, and folding four
components into that level leaves the indicator nowhere.

### G2 — Three targets, not one, and a real unit field

Add `midterm_target_value`, `midterm_target_date`, `target_qualifier` and
`reference_code` to the indicator register; make `unit` a controlled vocabulary
(ha, people, plans, investments, stations, %, policies).

The mid-term target is the number the MTR mission grades against, and today it
exists only inside the `merl.project_profiles` JSON blob. The qualifier is what
holds "Entire population of Vanuatu" beside the numeric 307,150 without breaking
arithmetic. This also settles finding 1.1(4): the framework register becomes the
single source and the profile JSON is derived from it rather than typed twice.

### G3 — Canonical reporting periods

New `merl.reporting_periods` (`period_code`, `period_type`, `start_date`,
`end_date`, `fiscal_year`, `quarter`); `merl.indicator_progress` gains
`period_id`, keeping the existing free-text column as the display label.

This is the single change that makes a twelve-project view possible. Today
`'Q1 2026'`, `'FY26 Q1'` and `'Jan–Mar 2026'` are three different periods. VCAP 2
makes the case sharply: its workbook grid is **calendar** quarters while its PIR
reports to **30 June**. The period row must carry both or one view is always
wrong.

### G4 — Disaggregation as rows, not columns

New `merl.indicator_progress_splits (progress_id, dimension, category, value)`,
where `dimension` ∈ sex, age band, disability, province, island, area council.

Three VCAP 2 indicators are sex-disaggregated in their targets; the portal can
currently record a gender split only against a beneficiary record, not against
the indicator it proves. Rows rather than columns means "by area council" is
later a data change, not a migration, and the province rollup feeds the existing
`InteractiveCoverageMap`.

Carry over the guard already written for beneficiaries in `MerlReporting.jsx`:
categories within a dimension may not exceed the headline value.

### G5 — A shared indicator catalogue

New `merl.indicator_catalogue` (GEF Core Indicators 1–5 with sub-indicators, plus
national NDC / NAP codes); nullable `project_indicators.catalogue_id`.

This is what makes a portfolio number honest. "Hectares restored across DoCC" may
only sum indicators mapped to Core Indicator 3. It also records which siblings
are *not* additive — Core Indicator 1.1 (newly created) and 1.2 (under improved
management) must never be summed.

### Sketch (not applied)

```sql
CREATE TABLE merl.components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
  objective_id   UUID REFERENCES merl.objectives (id) ON DELETE SET NULL,
  code           VARCHAR(30) NOT NULL,   -- merl.next_code(…, 'component', 'CMP')
  reference_code TEXT,                   -- "1", as printed in the workbook
  statement      TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',
  UNIQUE (project_id, code)
);

ALTER TABLE merl.outcomes
  ADD COLUMN IF NOT EXISTS component_id UUID
      REFERENCES merl.components (id) ON DELETE SET NULL;  -- nullable

ALTER TABLE merl.project_indicators
  ADD COLUMN IF NOT EXISTS midterm_target_value NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS midterm_target_date  DATE,
  ADD COLUMN IF NOT EXISTS target_qualifier     TEXT,
  ADD COLUMN IF NOT EXISTS reference_code       TEXT,
  ADD COLUMN IF NOT EXISTS catalogue_id         UUID
      REFERENCES merl.indicator_catalogue (id);
```

Writes go through `create_component` / `update_component` / `delete_component`
RPCs following the `0009` pattern exactly — `SECURITY DEFINER`,
`merl.require_editor()`, RLS enabled with a select-only policy, audit triggers.
Component statements are record text, so they also need a row in
`merl.translatable_fields` **and** an entry in `TRANSLATABLE_FIELDS` in
`lib/contentLocale.js`.

---

## 4. Screens

Two questions drive the design: *who has not reported?* and *what is off track?*

1. **Portfolio results** (`/analytics/results-portfolio`) — KPI tiles over a
   project × quarter heat grid showing reporting status and performance for all
   twelve projects, plus a core-indicator rollup. Organisation-wide aggregate of
   verified values, so it reads through `cachedRead()`.
2. **Project framework** (`…/:projectCode`) — the Component → Outcome → Output
   tree with a progress track per indicator: fill to the current actual, a tick
   at the mid-term target, the end-of-project target as the track's end. Header
   vocabulary comes from the project's `level_labels`.
3. **Indicator detail** (`…/:projectCode/:indicatorCode`) — one measure, one
   scale, quarterly slots with unrecorded quarters drawn as empty rather than
   interpolated; baseline and target reference lines; the split panel; evidence;
   the period table.
4. **Quarterly entry** — the existing `MerlReporting` indicator-progress form
   with three additions: the unit beside every number, a live achievement-against
   target line, and a splits row replacing the free-text disaggregation note.
   Everything else (drafts via `useFormDraft`, evidence into the `0048` bucket,
   the `requiredForSubmission` gate) already works and is not rebuilt.

### Three rules the design commits to

- **Unverified values never reach a portfolio number.** They show on the
  project's own screens marked provisional.
- **Nothing is summed unless the catalogue says it may be.** Unmapped indicators
  appear in their project and are excluded from rollups.
- **Missing is shown as missing.** A quarter with no submission renders empty,
  never as zero and never interpolated.

---

## 5. Constraints this respects

| Rule already in the codebase | What the design does |
| --- | --- |
| Shared aggregates cached, per-user data not | Portfolio screen reads verified aggregates via `cachedRead()` / `v_srf_analytics`; drafts and unverified rows stay on the direct Supabase path with the user's token |
| Two translation mechanisms | Screen labels are `i18n.js` keys; component and indicator statements are record text (`i18n` jsonb + `merl.translatable_fields` + `TRANSLATABLE_FIELDS` + `localised()` at the fetch, `sourceRow()` on edit) |
| Mobile is a first-class target | Heat grid and wide tables in `overflow-x:auto` containers; indicator rows become the stacked-card pattern below 768px; nothing that changes at a breakpoint is an inline style |
| Writes go through role-gated RPCs | New tables get `SECURITY DEFINER` RPCs behind `require_editor()`, RLS select-only, audit triggers |
| Drafts never relax validation | A split row or indicator value counts only when saved and validated; a draft never completes a section |

---

## 6. Rollout

Ordered by dependency; each phase ships on its own and leaves the portal working.

| # | Phase | Contains | Ships |
| --- | --- | --- | --- |
| 1 | Periods and targets | G3, G2 | 1 migration, indicator register form, no new screens |
| 2 | Components, then load VCAP 2 | G1 + data entry | 1 migration, component CRUD, screen 2 |
| 3 | Splits and the indicator view | G4 | 1 migration, reporting form changes, screen 3 |
| 4 | Catalogue and the portfolio view | G5 | 1 migration, catalogue admin, screen 1, cached aggregate |

Phase 2 is where the four workbook discrepancies get settled with the project
team. Phase 4 is only worth building once more than one framework is loaded.

---

## 7. Open decisions

1. **Which eleven projects, and do they have frameworks shaped like this?** If
   most are GEF or Adaptation Fund, G1 covers them. A GCF project with an
   activity layer below output, or a national NPP/GIP line with no framework at
   all, changes G1.
2. **Calendar quarters or fiscal year to 30 June as the default view?** The
   design carries both; one has to be what the portfolio view opens on. Assumed
   fiscal year, matching the PIR and the national budget cycle.
3. **Indicator 10 and Indicator 12 — which numbers are correct?** 25 vs 15
   investments; a count vs a percentage for early-warning coverage.
4. **Should unverified values show on the project screen?** Assumed yes, clearly
   marked. The alternative is stricter and slower.
