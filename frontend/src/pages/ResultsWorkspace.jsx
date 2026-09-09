import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import * as OPT from '../constants/formOptions';

const value = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

export default function ResultsWorkspace({ user: _user }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [data, setData] = useState({ projects: [], objectives: [], outcomes: [], outputs: [], indicators: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      localised(() => supabase.from('v_projects').select(i18nCols('id, code, acronym, name, status')).order('code')),
      localised(() => supabase.from('v_objectives').select('*').order('code')),
      localised(() => supabase.from('v_outcomes').select('*').order('code')),
      localised(() => supabase.from('v_outputs').select('*').order('code')),
      localised(() => supabase.from('v_project_indicators').select('*').order('code')),
    ]).then((responses) => {
      if (!alive) return;
      const failed = responses.find((r) => r.error);
      if (failed) {
        setError(dbErrorMessage(failed.error));
        setLoading(false);
        return;
      }
      const [projects, objectives, outcomes, outputs, indicators] = responses.map((r) => r.data ?? []);
      setData({ projects, objectives, outcomes, outputs, indicators });
      setLoading(false);
    }).catch((err) => {
      if (!alive) return;
      setError(dbErrorMessage(err));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [lang]);

  const rows = useMemo(() => {
    const objById = new Map(data.objectives.map((r) => [r.id, r]));
    const outcomeById = new Map(data.outcomes.map((r) => [r.id, r]));
    const outputById = new Map(data.outputs.map((r) => [r.id, r]));
    const projects = new Map(data.projects.map((p) => [p.id, p]));
    const built = [];
    const indicatorLinked = new Set();

    for (const indicator of data.indicators) {
      const project = projects.get(indicator.project_id);
      if (!project) continue;
      const output = indicator.output_id ? outputById.get(indicator.output_id) : null;
      const outcome = indicator.outcome_id ? outcomeById.get(indicator.outcome_id) : (output?.outcome_id ? outcomeById.get(output.outcome_id) : null);
      const objective = indicator.objective_id ? objById.get(indicator.objective_id) : (outcome?.objective_id ? objById.get(outcome.objective_id) : null);
      built.push({ project, objective, outcome, output, indicator });
      if (indicator.output_id) indicatorLinked.add(`output:${indicator.output_id}`);
      if (indicator.outcome_id) indicatorLinked.add(`outcome:${indicator.outcome_id}`);
      if (indicator.objective_id) indicatorLinked.add(`objective:${indicator.objective_id}`);
    }

    for (const output of data.outputs) {
      if (indicatorLinked.has(`output:${output.id}`)) continue;
      const project = projects.get(output.project_id);
      if (!project) continue;
      const outcome = output.outcome_id ? outcomeById.get(output.outcome_id) : null;
      const objective = outcome?.objective_id ? objById.get(outcome.objective_id) : null;
      built.push({ project, objective, outcome, output, indicator: null });
      if (output.outcome_id) indicatorLinked.add(`outcome:${output.outcome_id}`);
      if (objective?.id) indicatorLinked.add(`objective:${objective.id}`);
    }

    for (const outcome of data.outcomes) {
      const hasOutput = data.outputs.some((o) => o.outcome_id === outcome.id);
      if (hasOutput || indicatorLinked.has(`outcome:${outcome.id}`)) continue;
      const project = projects.get(outcome.project_id);
      if (!project) continue;
      const objective = outcome.objective_id ? objById.get(outcome.objective_id) : null;
      built.push({ project, objective, outcome, output: null, indicator: null });
      if (objective?.id) indicatorLinked.add(`objective:${objective.id}`);
    }

    for (const objective of data.objectives) {
      const hasOutcome = data.outcomes.some((o) => o.objective_id === objective.id);
      if (hasOutcome || indicatorLinked.has(`objective:${objective.id}`)) continue;
      const project = projects.get(objective.project_id);
      if (!project) continue;
      built.push({ project, objective, outcome: null, output: null, indicator: null });
    }

    for (const project of data.projects) {
      const hasAny = built.some((r) => r.project.id === project.id);
      if (!hasAny) built.push({ project, objective: null, outcome: null, output: null, indicator: null });
    }

    return built.sort((a, b) => {
      const pc = `${a.project.code ?? ''} ${a.project.name}`.localeCompare(`${b.project.code ?? ''} ${b.project.name}`);
      if (pc) return pc;
      return `${a.objective?.code ?? ''}${a.outcome?.code ?? ''}${a.output?.code ?? ''}${a.indicator?.code ?? ''}`
        .localeCompare(`${b.objective?.code ?? ''}${b.outcome?.code ?? ''}${b.output?.code ?? ''}${b.indicator?.code ?? ''}`);
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (projectFilter !== 'all' && r.project.id !== projectFilter) return false;
      if (!q) return true;
      return [r.project.code, r.project.acronym, r.project.name, r.objective?.code, r.objective?.statement,
        r.outcome?.code, r.outcome?.statement, r.output?.code, r.output?.statement,
        r.indicator?.code, r.indicator?.name].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, projectFilter, search]);

  const projectCount = new Set(filtered.map((r) => r.project.id)).size;
  const indicatorCount = filtered.filter((r) => r.indicator).length;

  return (
    <div className="page-pad rf-page">
      <style>{`
        .rf-page{max-width:none;margin:0 auto}
        .rf-title{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
        .rf-title h1{margin:0;font-family:var(--font-display);font-size:clamp(1.55rem,2.4vw,2rem)}
        .rf-title p{margin:.35rem 0 0;color:var(--text-2);max-width:780px}
        .rf-stats{display:flex;gap:.5rem;flex-wrap:wrap}
        .rf-stat{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.55rem .75rem;min-width:105px}
        .rf-stat strong{display:block;font-size:1rem}.rf-stat span{font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em}
        .rf-tools{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,360px) auto;gap:.65rem;align-items:end;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:.8rem;margin-bottom:.8rem}
        .rf-tools label{display:flex;flex-direction:column;gap:.25rem}.rf-tools span{font-size:.72rem;font-weight:700;color:var(--text-2)}
        .rf-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--white);max-height:calc(100vh - 300px)}
        .rf-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1500px;font-size:.78rem}
        .rf-table th{position:sticky;top:0;z-index:3;background:var(--surface-1);color:var(--text-2);font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;text-align:left;padding:.65rem;border-bottom:1px solid var(--border);white-space:nowrap}
        .rf-table td{vertical-align:top;padding:.65rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);line-height:1.35}
        .rf-table tr:last-child td{border-bottom:none}.rf-table td:last-child,.rf-table th:last-child{border-right:none}
        .rf-project{min-width:230px}.rf-level{min-width:250px}.rf-indicator{min-width:280px}.rf-num{min-width:90px;text-align:right}.rf-small{min-width:120px}
        .rf-code{display:block;font-family:var(--font-mono);font-size:.68rem;font-weight:700;color:var(--green-700);margin-bottom:.18rem}
        .rf-project strong{display:block;font-size:.82rem}.rf-empty{padding:2rem;text-align:center;color:var(--text-3)}
        @media(max-width:760px){.rf-tools{grid-template-columns:1fr}.rf-table-wrap{max-height:none}}
      `}</style>
      <div className="rf-title">
        <div>
          <h1>Results Framework</h1>
          <p>Portfolio-wide view of objectives, outcomes, outputs and indicators for all projects available to your account.</p>
        </div>
        <div className="rf-stats" aria-label="Results framework totals">
          <div className="rf-stat"><strong>{projectCount}</strong><span>Projects shown</span></div>
          <div className="rf-stat"><strong>{indicatorCount}</strong><span>Indicators shown</span></div>
        </div>
      </div>

      <div className="rf-tools">
        <label><span>Search framework</span><input className="field-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project, objective, outcome, output or indicator" /></label>
        <label><span>Project</span><select className="field-input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">All projects</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></label>
        <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setProjectFilter('all'); }}>Reset</button>
      </div>

      {loading && <div className="rf-empty" role="status">Loading results framework…</div>}
      {error && <div className="rf-empty" role="alert">{error}</div>}
      {!loading && !error && (
        <div className="rf-table-wrap">
          <table className="rf-table">
            <thead><tr><th>Project</th><th>Objective</th><th>Outcome</th><th>Output</th><th>Indicator</th><th>Baseline</th><th>Target</th><th>Unit</th><th>Reporting Frequency</th></tr></thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.project.id}-${r.indicator?.id ?? r.output?.id ?? r.outcome?.id ?? r.objective?.id ?? idx}`}>
                  <td className="rf-project"><span className="rf-code">{r.project.code || r.project.acronym || 'NO CODE'}</span><strong>{r.project.name}</strong></td>
                  <td className="rf-level">{r.objective ? <><span className="rf-code">{r.objective.code}</span>{r.objective.statement}</> : '—'}</td>
                  <td className="rf-level">{r.outcome ? <><span className="rf-code">{r.outcome.code}</span>{r.outcome.statement}</> : '—'}</td>
                  <td className="rf-level">{r.output ? <><span className="rf-code">{r.output.code}</span>{r.output.statement}</> : '—'}</td>
                  <td className="rf-indicator">{r.indicator ? <><span className="rf-code">{r.indicator.code}</span>{r.indicator.name}</> : '—'}</td>
                  <td className="rf-num">{r.indicator ? value(r.indicator.baseline_value) : '—'}</td>
                  <td className="rf-num">{r.indicator ? value(r.indicator.target_value) : '—'}</td>
                  <td className="rf-small">{r.indicator ? value(r.indicator.unit) : '—'}</td>
                  <td className="rf-small">{r.indicator?.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY, r.indicator.frequency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="rf-empty">No results-framework rows match the current filters.</div>}
        </div>
      )}
    </div>
  );
}
