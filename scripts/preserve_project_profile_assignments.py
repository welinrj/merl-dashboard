from pathlib import Path

p = Path('frontend/src/pages/ProjectSetup.jsx')
s = p.read_text()
replacements = [
    (
        "  project_manager: '', me_officer: '', finance_officer: '',\n",
        "  project_manager_id: '', me_officer_id: '', finance_officer_id: '',\n  project_manager: '', me_officer: '', finance_officer: '',\n",
        'profile assignment ids',
    ),
    (
        "provinces,islands,area_councils,communities,project_manager,me_officer,finance_officer,est_direct_beneficiaries",
        "provinces,islands,area_councils,communities,project_manager_id,me_officer_id,finance_officer_id,project_manager,me_officer,finance_officer,est_direct_beneficiaries",
        'project select assignment ids',
    ),
    ("      p_budget_vuv: budget ?? 0,\n", "      p_budget_vuv: budget,\n", 'budget preservation'),
    ("      p_project_manager_id: null,\n      p_me_officer_id: null,\n      p_finance_officer_id: null,\n",
     "      p_project_manager_id: toNull(v.project_manager_id),\n      p_me_officer_id: toNull(v.me_officer_id),\n      p_finance_officer_id: toNull(v.finance_officer_id),\n",
     'linked user preservation'),
]
for old, new, label in replacements:
    if old not in s:
        raise SystemExit(f'{label} marker not found')
    s = s.replace(old, new, 1)
p.write_text(s)
