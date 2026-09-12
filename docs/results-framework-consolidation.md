# Consolidating two results frameworks — VCAP 2 (GEF) and VCCRP (GCF)

**Status:** proposal. Nothing here is applied. No migration, table, RPC, page or
component has been added to the portal by this document.

**Extends:** [`results-framework-dashboard-design.md`](results-framework-dashboard-design.md),
which was written against VCAP 2 alone. Gaps are referenced as G1–G5 from that
document; G6–G7 are new here.

**Sources read:** `VCAP_2_Project_Results_Framework.xlsx`; VCCRP `LOGFRAME.pdf`
(GCF Funding Proposal section E), `Monitoring_and_Evaluation_plan_FP-Annex-11.pdf`,
`Funding-proposal.pdf`. Read against the repository at commit `d070cb8`.

---

## 1. The two frameworks are not the same shape

| | VCAP 2 | VCCRP |
| --- | --- | --- |
| Fund | GEF-7 · UNDP | Green Climate Fund · Save the Children Australia (AE) |
| Executing | DoCC / MALFFB | MoCC **and** Save the Children Vanuatu, co-executing |
| Envelope | VUV, as registered | USD 32,650,440 (GCF grant USD 26,182,878) |
| Implementation | Quarterly grid Q1 2024 – Q4 2028 | 6 years; 12-year lifespan |
| **Levels below project** | Objective → Component → Outcome → Output (4) | Component → Outcome → Output → Activity → Sub-activity (5) |
| Structure | 4 components, 8 outcomes, 17 outputs | 3 components, 3 outcomes, 8 outputs |
| **Core taxonomy** | GEF Core Indicators 1–5 with sub-indicators | GCF IRMF Core 2, 4, 5, 6, 8 + Supplementary 2.1, 2.2, 2.5, 4.1 |
| Indicators | 23, all numeric | 29, of which 6 are not numbers |
| Baselines | All zero | Zero; non-zero (61,600 people); approximate ("Approx. 10%"); bounded ("<1,495"); range ("720–1,380") |
| **Cadence** | Quarterly grid + annual PIR | Per indicator: baseline once; annual (output level); **mid-term and end-term only** (outcome level) |
| Geography | 9 Area Councils | 29 Area Councils, 282 communities, 19,556 households, all 6 provinces |
| Extra axis | — | GCF Result Areas ARA1 / ARA2 / ARA4, weighted 45% / 45% / 10% |

VCCRP sub-activity 1.1.1.1 is "DoCC develops and field-tests the CDCCC status
assessment tool." DoCC sits inside both delivery chains, which is the actual
argument for one system rather than two.

## 2. Why naive consolidation fails

Two sums, computed from the documents as written.

**Adding beneficiaries exceeds the national population.** VCAP 2's Mandatory
Indicator 11 end-of-project target is 307,150, written in the workbook as
"Entire Population of Vanuatu." VCCRP's IRMF Core 2 direct target is 90,157,
described in its own funding proposal as 33% of that same population.
`307,150 + 90,157 = 397,307`, or **129% of Vanuatu**. Adding VCCRP's 110,000
indirect beneficiaries reaches 165%. The two indicators measure nested
populations, not adjacent ones.

**VCCRP's 11,600 hectares are stated three times in its own logframe.** IRMF
Core 4, Supplementary 4.1 and the Output 2.1 indicator all carry baseline 0,
mid-term 5,800, final 11,600 and identical means of verification. Summing them
gives 34,800 ha against an actual 11,600 ha. The same trap sits in section E.3,
where IRMF Core 2 appears once per Result Area with a note reading "direct and
indirect beneficiaries are the same for all three results areas."

## 3. Approach: consolidate at two seams only

Do **not** design one framework shape and map both projects into it — that loses
the MTR target's meaning for GEF, the Result Area weighting for GCF, and the
sub-activity chain VCCRP's budget annex is built on.

Instead:

1. **Store each framework in its own shape.** Each project prints its own
   donor's vocabulary and reports in its own donor's format, because that is
   what has to be submitted.
2. **Join them at exactly two places** — a **measure** layer (what is physically
   being counted) and a **period** layer (when). Everything the dashboard says
   across projects is computed from those two. Anything not expressible through
   them is not shown as a portfolio number.

The test: a director asks "how many hectares are under improved management
across the portfolio?" and gets either a number with its contributors named, or
a plain statement of why there isn't one. Never a number that double-counts.

## 4. Seam one — the measure catalogue

This generalises G5. A **measure** is a physical thing counted; donor taxonomies
become *mappings onto* a measure rather than the measure itself.

```sql
CREATE TABLE merl.measures (
  id              UUID PRIMARY KEY,
  code            TEXT UNIQUE,     -- 'ha_improved_mgmt', 'people_direct'
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL,   -- hectare, person, household, community, plan
  unit_of_account TEXT NOT NULL,   -- what one unit IS, for overlap logic
  additive        BOOLEAN NOT NULL,
  overlap_axis    TEXT             -- 'geographic' | 'beneficiary' | NULL
);

CREATE TABLE merl.measure_mappings (
  measure_id     UUID REFERENCES merl.measures (id),
  framework      TEXT NOT NULL,    -- 'GEF7' | 'GCF_IRMF' | 'NDC' | 'NAP' | 'SDG'
  taxonomy_code  TEXT NOT NULL,    -- 'Core 4' · 'Supplementary 4.1'
  taxonomy_label TEXT,
  PRIMARY KEY (measure_id, framework, taxonomy_code)
);

ALTER TABLE merl.project_indicators
  ADD COLUMN measure_id  UUID REFERENCES merl.measures (id),
  ADD COLUMN rollup_role TEXT CHECK (rollup_role IN
      ('primary','restatement','subset'));   -- only 'primary' enters a rollup
```

`rollup_role` does the work. VCCRP's Core 4 is `primary`; its Supplementary 4.1
and Output 2.1 indicator are `restatement` — visible on the project's own
screens and in its GCF report, excluded from any total. IRMF Core 2 is primary
under ARA1 and a restatement under ARA2 and ARA4. GEF sub-indicators such as
3.1–3.4 are `subset`: summed with their siblings, never alongside their parent.

It also settles GEF Core Indicator 1.1 vs 1.2, which look additive and are not —
"newly created" and "under improved management effectiveness" are two different
measures, both primary, kept in separate rows.

### Worked mapping

| Measure | Unit | VCAP 2 maps from | VCCRP maps from | Additive |
| --- | --- | --- | --- | --- |
| People directly reached | person | Mandatory Ind. 11 (primary) | IRMF Core 2 / ARA1 (primary); ARA2, ARA4 (restatement) | never |
| Land under improved management | hectare | GEF Core 4 (4.1–4.3) (subset) | IRMF Core 4 (primary); Supp 4.1, Output 2.1 (restatement) | if geographies disjoint |
| Land restored | hectare | GEF Core 3 (3.1–3.4) (subset) | — GCF folds restoration into Core 4 | one contributor only |
| Protected area created | hectare | GEF Core 1.1, 2.1 (primary) | — | yes |
| People trained | person | Indicator 15 (primary) | Outputs 1.3, 2.2, 2.3, 3.1 (primary ×4) | not without dedup |
| Community adaptation plans | plan | Ind. 13 — Area Council plans | Output 1.2 — community plans | different unit of account |
| Institutional coordination capacity | scale 0–3 | — | IRMF Core 5 (primary) | ordinal — never summed |

Five of seven resolve to "do not sum." That is the correct answer, and the
catalogue's job is to make it explicit and auditable rather than leaving it to
whoever builds the next chart.

## 5. Five things VCAP 2 never asked for

### G2 extended — an indicator's value is not always a number

Add `value_type` ∈ `numeric · percentage · ordinal · milestone · boolean`, plus
the fields each type needs: `denominator` for percentages, `scale_id` for
ordinals (→ `merl.measurement_scales`), `target_text` for milestones.

VCCRP has all five. IRMF Core 5 is a four-level scorecard with baseline `low`
and target `Level 2`. Paradigm shift is rated low/medium/high across three
dimensions. Output 3.1's second indicator reads "Social protection system
designed" then "Vulnerability criteria tested" — a milestone with no number.
Most project-specific indicators are percentages of a target population, which
are meaningless without the denominator (282 communities, 29 Area Councils)
stored beside them.

An ordinal indicator has no "% achievement": it renders as its scale with
baseline and target marked, and progress is a step, not a percentage.

### G3 extended — not every indicator is due every period

Add `collection_frequency` to the indicator register
(`baseline_only · annual · quarterly · midterm_and_final · continuous`) and
extend `period_type` to include `baseline`, `midterm`, `final`.

VCCRP's M&E plan sets frequency per indicator: the baseline study runs once in
year 1, output-level indicators are annual, and **all GCF outcome-level core
indicators are collected at mid-term and end-term only**.

This reverses a rule from the first design. "Missing is shown as missing"
becomes **"missing is shown as missing only where a value was due"** —
everything else reads "not due this period." Without it the consolidated view
would paint VCCRP almost entirely as un-reported.

### G1 extended — five levels, not four

GCF runs Component → Outcome → Output → **Activity → Sub-activity**, and VCCRP's
budget annex uses that numbering (`1.1.1.1`, `1.1.1.2`…). `merl.project_activities`
already sits under output, so sub-activities need a nullable self-reference
`parent_activity_id` plus a `deliverables` field, since GCF states expected
deliverables per sub-activity. The per-project `level_labels` from G1 lets one
screen render four levels for VCAP 2 and six for VCCRP.

### G6 (new) — money is in two currencies

Add `currency` to `merl.financial_progress` and a small
`merl.fx_rates (currency, as_of_date, rate_to_vuv)`; show portfolio money in one
presentation currency with the rate date named on screen.

VCCRP is a USD 32,650,440 project. The portal's amount column is named
`budget_vuv`, and although `0008` added `currency` to `merl.projects`, financial
progress rows carry no currency at all — a portfolio budget total today would
add US dollars to vatu. VCCRP also carries a per-indicator M&E budget in its
monitoring plan, worth storing as the only written record of what measurement
costs.

### G7 (new) — baselines are not all facts

Add `baseline_qualifier` ∈ `exact · approximate · upper_bound · range ·
not_applicable` and `baseline_value_upper`.

VCAP 2's baselines are all exactly zero. VCCRP's include "Approx. 10% target
communities", "<1,495 people", "720–1,380 people nation-wide", and a
61,600-person food-security baseline the logframe itself flags as pre-COVID and
due for re-establishment at inception. The M&E plan budgets USD 100,000 for a
year-1 baseline study precisely to replace these, so the register must record
that a baseline was superseded rather than silently overwrite it.

### Unchanged

**G4 (disaggregation as rows) and G5 (the catalogue) carry over.** VCCRP only
strengthens them: every VCCRP target is sex-split at source, and it adds
households, communities and Area Councils as units alongside people — exactly
what a dimension/category table absorbs without a migration.

## 6. Revised rollout

Loading a second framework moves the catalogue up. It is no longer something to
defer until several projects exist, because with two frameworks the wrong number
is already computable.

| # | Phase | Contains | Ships |
| --- | --- | --- | --- |
| 1 | Value types, baselines and periods | G2 ext., G7, G3 ext. | 1 migration, indicator register form, no new screens |
| 2 | Levels, then load both frameworks | G1 ext. + data entry | 1 migration, component and sub-activity CRUD, project framework screen |
| 3 | Measures and rollup roles | G5 as measure catalogue | 1 migration, catalogue admin, portfolio-by-measure screen |
| 4 | Splits and currency | G4, G6 | 1 migration, reporting form changes, fx admin, indicator detail screen |

Phase 1 renders nothing differently for VCAP 2, but VCCRP cannot be entered at
all until an indicator can hold an ordinal, a percentage with a denominator, a
milestone, an approximate baseline and a collection frequency.

## 7. Open decisions

1. **Do VCAP 2 and VCCRP overlap on the ground?** VCAP 2 works in 9 Area
   Councils and reports activity in South Epi; VCCRP covers 29 Area Councils
   including Epi. If they share Area Councils the 16,600 ha figure needs a
   deduction. A list of each project's Area Councils settles it.
2. **Does DoCC want portfolio totals at all, or per-project reporting side by
   side?** If the real requirement is "one place to see all twelve projects'
   own reports," phase 3 shrinks and the measure layer becomes optional
   metadata rather than the centre of the design.
3. **Who enters VCCRP — DoCC or Save the Children?** VCCRP is co-executed by
   MoCC and Save the Children Vanuatu, and sub-activity 1.1.1.1 is assigned to
   DoCC. The portal's roles assume DoCC officers; an external executing partner
   needs either project-scoped accounts or a DoCC officer transcribing.
4. **One presentation currency, or each project in its own?** Assumed VUV with
   the FX date shown, matching the national budget cycle. Showing USD for VCCRP
   throughout is the alternative, but then no portfolio money total is possible.
5. **Is the quarterly grid real for VCAP 2?** Open from the first design and now
   more consequential: VCCRP is explicitly annual and mid-term/end-term. If
   VCAP 2 is in practice also annual, the portfolio can be built on annual
   periods and the quarterly grid becomes a planning artefact.
