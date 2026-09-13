from pathlib import Path


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Project Setup: add an explicit project-profile edit route using the same
# canonical upsert_project RPC as registration.
# -----------------------------------------------------------------------------
p = Path('frontend/src/pages/ProjectSetup.jsx')
s = p.read_text()
s = must_replace(
    s,
    'function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin }) {',
    'function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin, onEditProject }) {',
    'ProjectConfiguration signature',
)
s = must_replace(
    s,
    "supabase.from('v_projects').select('id,code,name').order('code'),",
    "supabase.from('v_projects').select('id,code,name,acronym,description,status,category,lead_agency,executing_agency,implementing_partners,donor,funding_window,currency,budget_vuv,start_date,end_date,approval_date,project_type,primary_climate_theme,coverage_type,provinces,islands,area_councils,communities,project_manager,me_officer,finance_officer,est_direct_beneficiaries,est_indirect_beneficiaries,expected_primary_outcome').order('code'),",
    'project profile select',
)
old_header = """        <select className="field-input" value={projectId} onChange={(e)=>setProjectId(e.target.value)}>
          <option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
        </select>
        {isAdmin && projectId && <button type="button" className="btn btn-secondary" onClick={deleteProject} disabled={busy} style={{color:'var(--red-600)',borderColor:'var(--red-200)'}}>Delete project</button>}"""
new_header = """        <select className="field-input" value={projectId} onChange={(e)=>setProjectId(e.target.value)}>
          <option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
        </select>
        {canEdit && projectId && <button type="button" className="btn btn-secondary" onClick={()=>onEditProject?.(projects.find((p)=>p.id===projectId))} disabled={busy}>Edit profile</button>}
        {isAdmin && projectId && <button type="button" className="btn btn-secondary" onClick={deleteProject} disabled={busy} style={{color:'var(--red-600)',borderColor:'var(--red-200)'}}>Delete project</button>}"""
s = must_replace(s, old_header, new_header, 'project edit button')
s = must_replace(
    s,
    "  const [registered, setRegistered] = useState(null);\n  const [resetKey, setResetKey] = useState(0);",
    "  const [registered, setRegistered] = useState(null);\n  const [editId, setEditId] = useState(null);\n  const [resetKey, setResetKey] = useState(0);",
    'edit state',
)
handler_marker = """  const dirty = useMemo(() => Object.entries(v).some(([k, value]) => {
    const base = blankProfile()[k];
    return Array.isArray(value) ? value.length > 0 : String(value ?? '') !== String(base ?? '');
  }), [v]);

  if (!canEdit) {"""
handler_repl = """  const dirty = useMemo(() => Object.entries(v).some(([k, value]) => {
    const base = blankProfile()[k];
    return Array.isArray(value) ? value.length > 0 : String(value ?? '') !== String(base ?? '');
  }), [v]);

  const beginEditProfile = (project) => {
    if (!project) return;
    const next = blankProfile();
    Object.keys(next).forEach((key) => {
      if (project[key] !== null && project[key] !== undefined) next[key] = project[key];
    });
    next.implementing_partners = toArr(project.implementing_partners);
    next.provinces = toArr(project.provinces);
    next.islands = toArr(project.islands);
    next.area_councils = toArr(project.area_councils);
    next.communities = toArr(project.communities);
    setV(next);
    setEditId(project.id);
    setRegistered(null);
    setMode('register');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!canEdit) {"""
s = must_replace(s, handler_marker, handler_repl, 'profile edit handler')
s = must_replace(s, '      p_id: null,', '      p_id: editId,', 'upsert edit id')
s = must_replace(
    s,
    "    setRegistered({ id: data, name: v.name.trim(), acronym: v.acronym?.trim() });\n    setV(blankProfile());\n    setResetKey((n) => n + 1);\n    toast.success('Project registered successfully.');\n    setMode('manage');",
    "    const action = editId ? 'updated' : 'registered';\n    setRegistered({ id: data, name: v.name.trim(), acronym: v.acronym?.trim(), action });\n    setV(blankProfile());\n    setEditId(null);\n    setResetKey((n) => n + 1);\n    toast.success(action === 'updated' ? 'Project profile updated successfully.' : 'Project registered successfully.');\n    setMode('manage');",
    'save success state',
)
s = must_replace(
    s,
    "        <button type=\"button\" className={mode === 'manage' ? 'active' : ''} onClick={() => setMode('manage')}>Manage projects</button>\n        <button type=\"button\" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register new project</button>",
    "        <button type=\"button\" className={mode === 'manage' ? 'active' : ''} onClick={() => { setEditId(null); setMode('manage'); }}>Manage projects</button>\n        <button type=\"button\" className={mode === 'register' ? 'active' : ''} onClick={() => { setEditId(null); setV(blankProfile()); setMode('register'); }}>Register new project</button>",
    'mode buttons',
)
s = must_replace(
    s,
    "      {registered && mode === 'manage' && <div role=\"status\" style={{ marginBottom: '1rem', padding: '.8rem 1rem', border: '1px solid #16a34a55', background: '#dcece2', borderRadius: 10, color: '#155e34' }}><strong>{registered.acronym ? `${registered.acronym} — ` : ''}{registered.name}</strong> was registered and is selected below.</div>}",
    "      {registered && mode === 'manage' && <div role=\"status\" style={{ marginBottom: '1rem', padding: '.8rem 1rem', border: '1px solid #16a34a55', background: '#dcece2', borderRadius: 10, color: '#155e34' }}><strong>{registered.acronym ? `${registered.acronym} — ` : ''}{registered.name}</strong> was {registered.action || 'registered'} and is selected below.</div>}",
    'registered status wording',
)
s = must_replace(s, '<h2 style={{ margin: \'0 0 1rem\', fontSize: \'1rem\' }}>Project Profile</h2>', '<h2 style={{ margin: \'0 0 1rem\', fontSize: \'1rem\' }}>{editId ? \'Edit Project Profile\' : \'Project Profile\'}</h2>', 'profile heading')
s = must_replace(
    s,
    "          <button type=\"button\" className=\"btn btn-secondary\" disabled={!dirty || saving} onClick={() => setV(blankProfile())}>Clear form</button>\n          <button type=\"submit\" className=\"btn btn-primary\" disabled={saving}>{saving ? 'Registering…' : 'Register project'}</button>",
    "          <button type=\"button\" className=\"btn btn-secondary\" disabled={saving} onClick={() => { setV(blankProfile()); if (editId) { setEditId(null); setMode('manage'); } }}> {editId ? 'Cancel edit' : 'Clear form'} </button>\n          <button type=\"submit\" className=\"btn btn-primary\" disabled={saving}>{saving ? (editId ? 'Saving…' : 'Registering…') : (editId ? 'Save profile changes' : 'Register project')}</button>",
    'profile submit controls',
)
s = must_replace(
    s,
    "      {mode === 'manage' && <ProjectConfiguration preferredProjectId={registered?.id} canEdit={canEdit} isAdmin={user?.role === 'ROLE_ADMIN'} />}",
    "      {mode === 'manage' && <ProjectConfiguration preferredProjectId={registered?.id} canEdit={canEdit} isAdmin={user?.role === 'ROLE_ADMIN'} onEditProject={beginEditProfile} />}",
    'editable project configuration',
)
p.write_text(s)


# -----------------------------------------------------------------------------
# Reports: explicitly communicate approval/completeness basis and stop creating
# derived zero financial values when the source data is missing.
# -----------------------------------------------------------------------------
p = Path('frontend/src/pages/Reports.jsx')
s = p.read_text()
s = must_replace(
    s,
    "const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);",
    "const hasValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));\nconst sumKnown = (values) => values.length && values.every(hasValue) ? values.reduce((total, value) => total + Number(value), 0) : null;\nconst remainingBalance = (budget, expenditure) => hasValue(budget) && hasValue(expenditure) ? Number(budget) - Number(expenditure) : null;\nconst humanToken = (value) => value ? String(value).replaceAll('_', ' ').replace(/\\b\\w/g, (m) => m.toUpperCase()) : '—';",
    'report financial helpers',
)
assurance_marker = """  const generatedAt = new Date();

  // Log the generation to the Report Library"""
assurance_repl = """  const generatedAt = new Date();
  const approvalScope = d.reporting.filter((row) =>
    (!period || row.period_label === period || row.reporting_period === period)
    && (type !== 'project' || !projectId || row.project_id === projectId));
  const approvedCount = approvalScope.filter((row) => row.submission_status === 'approved').length;
  const approvalBasis = approvalScope.length === 0
    ? 'No matching reporting-period approval record is configured for this report scope. Treat the report as working information, not approved reporting.'
    : approvedCount === approvalScope.length
      ? `Approval basis: ${approvedCount} of ${approvalScope.length} matching reporting period${approvalScope.length === 1 ? '' : 's'} approved.`
      : `Approval warning: ${approvedCount} of ${approvalScope.length} matching reporting period${approvalScope.length === 1 ? '' : 's'} approved. This report may include draft, submitted, returned or reviewed information.`;
  const approvalComplete = approvalScope.length > 0 && approvedCount === approvalScope.length;

  // Log the generation to the Report Library"""
s = must_replace(s, assurance_marker, assurance_repl, 'report approval basis')
s = must_replace(
    s,
    "        .rp-stamp b{color:#333}",
    "        .rp-stamp b{color:#333}\n        .rp-assurance{font-size:.78rem;line-height:1.45;padding:.65rem .75rem;margin:0 0 .9rem;border:1px solid #f0c36b;background:#fff8e7;color:#6b4f12;border-radius:8px}.rp-assurance.ok{border-color:#9ac7aa;background:#edf7f0;color:#245b35}",
    'report assurance css',
)
s = must_replace(
    s,
    "        <div className=\"rp-stamp\">\n          <span>{t('rpt.generated')} <b>{fmtDateTime(generatedAt)}</b></span>\n          <span>{t('rpt.dataAsAt')} <b>{dataAsAt ? fmtDateTime(dataAsAt) : '—'}</b></span>\n        </div>",
    "        <div className=\"rp-stamp\">\n          <span>{t('rpt.generated')} <b>{fmtDateTime(generatedAt)}</b></span>\n          <span>{t('rpt.dataAsAt')} <b>{dataAsAt ? fmtDateTime(dataAsAt) : '—'}</b></span>\n        </div>\n        <div className={`rp-assurance${approvalComplete ? ' ok' : ''}`}><b>{approvalComplete ? 'Approved reporting basis.' : 'Reporting status.'}</b> {approvalBasis}</div>",
    'report assurance banner',
)
s = must_replace(
    s,
    "          <div><b>{t('rpt.remainingBalanceLbl')}</b> {fmtAmount(fin?.remaining_balance ?? ((Number(budget) || 0) - (Number(exp) || 0)))}</div>",
    "          <div><b>{t('rpt.remainingBalanceLbl')}</b> {fmtAmount(fin?.remaining_balance ?? remainingBalance(budget, exp))}</div>",
    'remaining balance null handling',
)
s = must_replace(
    s,
    "{locs.map((l) => <tr key={l.id}><td>{l.province_code || '—'}</td><td>{l.area_council_name || '—'}</td><td>{l.coverage_status || '—'}</td><td>{l.feasibility_status || '—'}</td><td>{l.feasibility_note || '—'}</td></tr>)}",
    "{locs.map((l) => <tr key={l.id}><td>{l.province_code || '—'}</td><td>{l.area_council_name || '—'}</td><td>{humanToken(l.coverage_status)}</td><td>{humanToken(l.feasibility_status)}</td><td>{l.feasibility_note || '—'}</td></tr>)}",
    'friendly area council status',
)
s = must_replace(
    s,
    "  const budget = sum(d.projects, (p) => p.budget_vuv);\n  const exp = [...fin.values()].reduce((a, r) => a + (Number(r.cumulative_expenditure) || 0), 0);",
    "  const budget = sumKnown(d.projects.map((p) => p.budget_vuv));\n  const exp = sumKnown(d.projects.map((p) => fin.get(p.id)?.cumulative_expenditure ?? p.spent_vuv));",
    'portfolio complete financial totals',
)
s = must_replace(s, "{fmtNum(portfolioBeneficiaries(d.beneficiaries) ?? 0)}", "{fmtNum(portfolioBeneficiaries(d.beneficiaries))}", 'portfolio beneficiary missing value')
p.write_text(s)


# -----------------------------------------------------------------------------
# Public Dashboard + map: distinguish missing geographic coverage from zero.
# -----------------------------------------------------------------------------
p = Path('frontend/src/pages/PublicDashboard.jsx')
s = p.read_text()
coverage_marker = """  const selectedIds = new Set(filtered.map(p=>String(p.id)));
  const areas = (data?.areas||[]).map(a=>{"""
coverage_repl = """  const selectedIds = new Set(filtered.map(p=>String(p.id)));
  const sourceAreas = data?.areas || [];
  const coveredProjectIds = new Set(sourceAreas.flatMap((area) => list(area.project_ids)).map(String).filter((id) => selectedIds.has(id)));
  const projectsWithCoverage = coveredProjectIds.size;
  const projectsMissingCoverage = Math.max(0, filtered.length - projectsWithCoverage);
  const areas = sourceAreas.map(a=>{"""
s = must_replace(s, coverage_marker, coverage_repl, 'public geographic counts')
s = must_replace(
    s,
    "  const coverage = <div className=\"pbd-area-list\">{areaNames.length ? areaNames.map(name => <div key={name} className=\"pbd-area-row\"><span>{name}</span><strong>{areas.find(a=>a.area_council===name)?.project_count || 0}</strong></div>) : <Empty>{c.noData}</Empty>}</div>;",
    "  const coverage = <div><p className=\"pbd-disclosure\"><strong>{projectsWithCoverage} of {filtered.length}</strong> published project{filtered.length === 1 ? '' : 's'} in this view have recorded Area Council coverage.{projectsMissingCoverage > 0 ? ` ${projectsMissingCoverage} project${projectsMissingCoverage === 1 ? '' : 's'} have no approved Area Council coverage record yet; this is missing coverage data, not zero activity.` : ''}</p><div className=\"pbd-area-list\">{areaNames.length ? areaNames.map(name => <div key={name} className=\"pbd-area-row\"><span>{name}</span><strong>{areas.find(a=>a.area_council===name)?.project_count || 0}</strong></div>) : <Empty>No approved Area Council coverage records match the current filters.</Empty>}</div></div>;",
    'coverage disclosure',
)
p.write_text(s)

p = Path('frontend/src/components/PublicCoverageMap.jsx')
s = p.read_text()
s = must_replace(
    s,
    '<div className="pub-map-key"><strong>Area Council project coverage</strong><span>Coloured areas have approved projects. Select an area to view its projects.</span></div>',
    '<div className="pub-map-key"><strong>Recorded Area Council coverage</strong><span>Strongly shaded areas have approved project coverage records. Pale areas mean no approved coverage record is available for the current data; they do not mean zero project activity.</span></div>',
    'map missing coverage wording',
)
p.write_text(s)


# -----------------------------------------------------------------------------
# Admin audit history: human-readable action and record labels, while preserving
# technical schema/table/id information in the details view.
# -----------------------------------------------------------------------------
p = Path('frontend/src/pages/AdminPanel.jsx')
s = p.read_text()
audit_marker = """const PAGE_SIZE = 25;

function AuditTab() {"""
audit_repl = """const PAGE_SIZE = 25;
const AUDIT_OBJECT_LABELS = {
  projects: 'Project', project_activities: 'Activity', project_indicators: 'Indicator', framework_nodes: 'Result',
  reporting_periods: 'Reporting period', indicator_progress: 'Indicator progress', financial_progress: 'Financial progress',
  beneficiaries: 'Beneficiary record', risks_issues: 'Risk / issue', learning_updates: 'Learning update', evidence: 'Evidence', users: 'User',
};
const auditObjectLabel = (row) => AUDIT_OBJECT_LABELS[row.table_name] || String(row.table_name || 'record').replaceAll('_', ' ').replace(/\\b\\w/g, (m) => m.toUpperCase());
const auditRecordLabel = (row) => {
  const values = row.new_values || row.old_values || {};
  return values.code || values.acronym || values.period_label || values.name || values.title || values.full_name || values.email || (row.record_id ? `ID ${String(row.record_id).slice(0, 8)}` : 'Record');
};
const auditActionSummary = (row) => {
  const verb = row.action === 'INSERT' ? 'Created' : row.action === 'DELETE' ? 'Deleted' : row.action === 'UPDATE' ? 'Updated' : row.action;
  return `${verb} ${auditObjectLabel(row).toLowerCase()}`;
};

function AuditTab() {"""
s = must_replace(s, audit_marker, audit_repl, 'audit helpers')
old_cols = """          {key:'action',label:t('adm.action'),sortable:false,render:r=><span className={`px-2 py-1 rounded text-xs font-semibold ${ACTION_STYLE[r.action]||'bg-gray-100 text-gray-600'}`}>{r.action}</span>},
          {key:'table_name',label:t('adm.table'),sortable:false,value:r=>`${r.schema_name}.${r.table_name}`,render:r=><span className="font-mono text-xs">{r.schema_name}.{r.table_name}</span>},
          {key:'record_id',label:t('adm.record'),sortable:false,render:r=><span className="font-mono text-xs">{r.record_id?String(r.record_id).slice(0,8):'—'}</span>},"""
new_cols = """          {key:'action',label:t('adm.action'),sortable:false,render:r=><span><span className={`px-2 py-1 rounded text-xs font-semibold ${ACTION_STYLE[r.action]||'bg-gray-100 text-gray-600'}`}>{r.action}</span><small className="block mt-1 text-gray-500">{auditActionSummary(r)}</small></span>},
          {key:'table_name',label:'Record type',sortable:false,value:r=>`${r.schema_name}.${r.table_name}`,render:r=><span><span className="text-sm text-gray-700">{auditObjectLabel(r)}</span><small className="block font-mono text-[10px] text-gray-400">{r.schema_name}.{r.table_name}</small></span>},
          {key:'record_id',label:t('adm.record'),sortable:false,render:r=><span><span className="text-sm text-gray-700">{auditRecordLabel(r)}</span><small className="block font-mono text-[10px] text-gray-400">{r.record_id?String(r.record_id).slice(0,8):'—'}</small></span>},"""
s = must_replace(s, old_cols, new_cols, 'friendly audit columns')
s = must_replace(
    s,
    "expandedRow={r=><div className=\"grid gap-3 sm:grid-cols-2 p-2\"><div><div className=\"text-xs font-semibold text-gray-500 mb-1\">{t('adm.before')}</div>",
    "expandedRow={r=><div className=\"p-2\"><div className=\"mb-3 text-sm text-gray-700\"><strong>{auditActionSummary(r)}</strong> · {auditRecordLabel(r)} <span className=\"font-mono text-xs text-gray-400\">({r.schema_name}.{r.table_name} · {r.record_id || 'no id'})</span></div><div className=\"grid gap-3 sm:grid-cols-2\"><div><div className=\"text-xs font-semibold text-gray-500 mb-1\">{t('adm.before')}</div>",
    'audit expanded summary start',
)
s = must_replace(
    s,
    "</pre></div></div>}\n      />",
    "</pre></div></div></div>}\n      />",
    'audit expanded summary close',
)
p.write_text(s)
