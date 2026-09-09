import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

const fmtVuv = (value) => {
  const n = Number(value || 0);
  return n ? `VT ${n.toLocaleString('en-US')}` : '—';
};

const fmtDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : '—';

function Field({ label, value, wide = false }) {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className={`docc-register-field${wide ? ' wide' : ''}`}>
      <div className="docc-register-label">{label}</div>
      <div className="docc-register-value">{shown}</div>
    </div>
  );
}

export default function DoCCProjectRegister() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const { data: authData } = await supabase.auth.getSession();
      if (!authData?.session) {
        if (active) {
          setError('Please sign in to the MERL Dashboard before opening the DoCC Project Register.');
          setLoading(false);
        }
        return;
      }
      const { data, error: readError } = await supabase
        .from('v_docc_project_profiles_source')
        .select('*')
        .order('source_row', { ascending: true });
      if (!active) return;
      if (readError) setError(readError.message || 'Could not load the DoCC project register.');
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const projectOptions = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      if (!seen.has(row.project_id)) seen.set(row.project_id, row.programme_project_title);
    });
    return [...seen.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (projectId !== 'all' && row.project_id !== projectId) return false;
      if (!needle) return true;
      return [row.programme_project_title, row.gip_code, row.npp_code, row.funding_source, row.confirm_status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, query, projectId]);

  const distinctProjects = useMemo(() => new Set(rows.map((r) => r.project_id)).size, [rows]);
  const totalBudget = useMemo(() => rows.reduce((sum, r) => sum + Number(r.source_budget_total_vuv || 0), 0), [rows]);

  return (
    <div className="docc-register-page">
      <style>{`
        .docc-register-page{min-height:100vh;background:#f5f7fb;color:#172b3a;font-family:var(--font-ui,Arial,sans-serif);padding:24px}
        .docc-register-shell{max-width:1500px;margin:0 auto}
        .docc-register-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}
        .docc-register-kicker{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#00736f;margin-bottom:6px}
        .docc-register-title{margin:0;color:#08233c;font-size:30px;line-height:1.15}
        .docc-register-sub{margin:8px 0 0;color:#65758a;max-width:900px}
        .docc-register-back{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid #cfd8e3;border-radius:8px;background:#fff;color:#08233c;text-decoration:none;font-weight:700;white-space:nowrap}
        .docc-register-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}
        .docc-register-stat{background:#fff;border:1px solid #dce3eb;border-radius:12px;padding:15px 16px}
        .docc-register-stat b{display:block;font-size:24px;color:#08233c;margin-top:3px}
        .docc-register-stat span{font-size:12px;color:#65758a;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
        .docc-register-tools{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
        .docc-register-tools input,.docc-register-tools select{height:42px;border:1px solid #cfd8e3;border-radius:8px;background:#fff;padding:0 12px;font:inherit;color:#172b3a}
        .docc-register-tools input{min-width:320px;flex:1}.docc-register-tools select{min-width:320px;max-width:540px}
        .docc-register-card{background:#fff;border:1px solid #dce3eb;border-radius:14px;margin-bottom:16px;overflow:hidden}
        .docc-register-card-head{padding:16px 18px;background:#f9fbfd;border-bottom:1px solid #e4e9ef;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        .docc-register-card h2{font-size:18px;line-height:1.35;margin:0;color:#08233c}.docc-register-code{font-size:12px;color:#65758a;margin-top:5px}
        .docc-register-status{font-size:12px;font-weight:800;color:#075985;background:#e0f2fe;border-radius:999px;padding:5px 9px;max-width:340px;text-align:right}
        .docc-register-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-bottom:1px solid #edf1f5}
        .docc-register-field{padding:13px 16px;border-right:1px solid #edf1f5;border-bottom:1px solid #edf1f5;min-width:0}.docc-register-field.wide{grid-column:span 2}
        .docc-register-label{font-size:11px;text-transform:uppercase;letter-spacing:.045em;color:#718096;font-weight:800;margin-bottom:5px}.docc-register-value{font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
        .docc-register-desc{padding:16px 18px;border-bottom:1px solid #edf1f5}.docc-register-desc p{margin:5px 0 0;line-height:1.55;font-size:14px}
        .docc-register-budget{padding:16px 18px}.docc-register-budget h3{font-size:13px;margin:0 0 10px;color:#08233c;text-transform:uppercase;letter-spacing:.04em}.docc-register-budget-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #e1e7ee;border-radius:9px;overflow:hidden}.docc-register-budget-cell{padding:10px;text-align:right;border-right:1px solid #e1e7ee;background:#fff}.docc-register-budget-cell:last-child{border-right:0}.docc-register-budget-cell span{display:block;font-size:11px;color:#718096;font-weight:800}.docc-register-budget-cell b{display:block;font-size:12px;margin-top:4px;color:#172b3a}
        .docc-register-note{font-size:12px;color:#65758a;margin-top:10px}.docc-register-empty{padding:40px;text-align:center;background:#fff;border:1px solid #dce3eb;border-radius:12px;color:#65758a}
        @media(max-width:1000px){.docc-register-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.docc-register-budget-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.docc-register-budget-cell{border-bottom:1px solid #e1e7ee}.docc-register-summary{grid-template-columns:1fr}.docc-register-top{flex-direction:column}}
        @media(max-width:600px){.docc-register-page{padding:14px}.docc-register-grid{grid-template-columns:1fr}.docc-register-field.wide{grid-column:span 1}.docc-register-budget-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.docc-register-tools input,.docc-register-tools select{min-width:100%;width:100%}.docc-register-card-head{flex-direction:column}.docc-register-status{text-align:left}}
      `}</style>
      <div className="docc-register-shell">
        <div className="docc-register-top">
          <div>
            <div className="docc-register-kicker">Department of Climate Change</div>
            <h1 className="docc-register-title">DoCC Project Register</h1>
            <p className="docc-register-sub">Complete project-profile information transcribed from the Department's source workbook. Blank source cells are shown as “—”; they are not filled with assumptions.</p>
          </div>
          <Link className="docc-register-back" to="/dashboards">← Back to Dashboard</Link>
        </div>

        {error ? <div className="docc-register-empty">{error}<br/><br/><Link to="/">Open sign in</Link></div> : null}
        {!error && loading ? <div className="docc-register-empty">Loading DoCC project register…</div> : null}
        {!error && !loading ? <>
          <div className="docc-register-summary">
            <div className="docc-register-stat"><span>Distinct projects</span><b>{distinctProjects}</b></div>
            <div className="docc-register-stat"><span>Source spreadsheet rows</span><b>{rows.length}</b></div>
            <div className="docc-register-stat"><span>Annual budget allocations captured</span><b>{fmtVuv(totalBudget)}</b></div>
          </div>
          <div className="docc-register-tools">
            <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search project, code, funder or status…" aria-label="Search DoCC projects" />
            <select value={projectId} onChange={(e)=>setProjectId(e.target.value)} aria-label="Filter by project">
              <option value="all">All projects</option>
              {projectOptions.map(([id,title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          </div>

          {filtered.map((row) => (
            <article className="docc-register-card" key={row.id}>
              <div className="docc-register-card-head">
                <div><h2>{row.programme_project_title}</h2><div className="docc-register-code">GIP: {row.gip_code || '—'} · NPP: {row.npp_code || '—'} · Source row {row.source_row}</div></div>
                <div className="docc-register-status">{row.confirm_status || 'No confirmation status in source'}</div>
              </div>
              <div className="docc-register-grid">
                <Field label="Ministry" value={row.ministry} wide />
                <Field label="Department" value={row.department} />
                <Field label="Disaster" value={row.disaster} />
                <Field label="Cost Centre" value={row.cost_centre} />
                <Field label="Program" value={row.program} />
                <Field label="Activity" value={row.activity} />
                <Field label="Type of support" value={row.support_type} />
                <Field label="Start Date" value={fmtDate(row.start_date)} />
                <Field label="End Date" value={fmtDate(row.end_date)} />
                <Field label="Source of Funding" value={row.funding_source} wide />
                <Field label="Budget Policy Priority" value={row.budget_policy_priority} wide />
              </div>
              <div className="docc-register-desc"><div className="docc-register-label">Description</div><p>{row.description || '—'}</p></div>
              <div className="docc-register-budget">
                <h3>Budget by fiscal year (VUV)</h3>
                <div className="docc-register-budget-grid">
                  {YEARS.map((year) => <div className="docc-register-budget-cell" key={year}><span>{year}</span><b>{fmtVuv(row[`budget_${year}_vuv`])}</b></div>)}
                </div>
                <div className="docc-register-note">Source-row allocation total: <b>{fmtVuv(row.source_budget_total_vuv)}</b>. These annual values are source spreadsheet budget allocations and are not automatically treated as the approved total project budget.</div>
              </div>
            </article>
          ))}
          {!filtered.length ? <div className="docc-register-empty">No matching project profile found.</div> : null}
        </> : null}
      </div>
    </div>
  );
}
