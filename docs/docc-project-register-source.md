# DoCC project register source

The DoCC Project Register is sourced from the Department workbook `DoCC Projects Infor(1).xlsx`, sheet `DOCC PMU`.

All workbook fields are represented in `merl.docc_project_profiles_source`, including NPP/GIP codes, title, description, disaster, ministry, department, cost centre, program, activity, dates, type of support, annual VUV budget allocations for 2020–2026, source of funding, budget policy priority, and confirmation status.

The National Adaptation Plan project (`24B498`) legitimately occupies two source rows in 2024 because the workbook separates Grant and Aid in Kind. The dashboard therefore shows both source rows rather than collapsing one as a duplicate.

Annual budget values are source-spreadsheet allocations. Their sum is exposed as `source_budget_total_vuv` for reference, but it is not automatically treated as the approved total project budget.
