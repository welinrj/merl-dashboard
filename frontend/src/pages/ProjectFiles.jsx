// Project Files — a submission portal + file manager for project documents
// (Annual Workplan, 6-Month Report, Annual Report). Users submit a document
// with the project name and the submitting officer's name; the portal scans it
// for a summary, timestamps and logs the submission, and files it under the
// project name in the private project-documents store.
import { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Upload, Loader2, Download, Trash2, FileText, Search, ChevronDown, ChevronRight, FolderOpen, Check, Minus, GaugeCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import { processReportFile, reportKind, ACCEPTED_REPORT_EXT, REPORT_KIND_LABEL } from '../reportProcessing';

const BUCKET = 'project-documents';
const MAX_MB = 25;
const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const DOC_TYPES = [
  { id: 'annual_workplan',   label: 'Annual Workplan' },
  { id: 'six_month_report',  label: '6-Month Report' },
  { id: 'annual_report',     label: 'Annual Report' },
];
const DOC_LABEL = Object.fromEntries(DOC_TYPES.map(d => [d.id, d.label]));
const DOC_BADGE = {
  annual_workplan:  { bg: '#dcece2', txt: '#155e34' },
  six_month_report: { bg: '#f7ead0', txt: '#8a6416' },
  annual_report:    { bg: '#e5e7f7', txt: '#3b3f7a' },
};

const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const emptyForm = { docType: 'annual_workplan', projectName: '', officer: '', file: null };

// Present/missing indicator for a key document type. Uses an icon (not colour
// alone) so the state reads without relying on colour perception.
function DocCell({ count }) {
  if (count > 0) {
    return (
      <span title={`${count} on file`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--green-700, #155e34)', fontWeight: 700, fontSize: '0.75rem' }}>
        <Check size={15} />{count > 1 ? count : ''}
      </span>
    );
  }
  return (
    <span title="Not submitted" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-3)' }}>
      <Minus size={15} />
    </span>
  );
}

// Completeness meter against the three key document types (0–3).
function Completeness({ present }) {
  const pct = Math.round((present / 3) * 100);
  const col = present === 3 ? 'var(--green-600, #1a8c4e)' : present >= 1 ? 'var(--gold-500, #d99a2b)' : 'var(--red-600, #b3402f)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, minWidth: 60, height: 7, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{present}/3</span>
    </div>
  );
}

export default function ProjectFiles({ user }) {
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);
  const [docs, setDocs] = useState([]);
  const [projects, setProjects] = useState([]); // for name suggestions
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({}); // project_name -> collapsed?

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const [d, p] = await Promise.all([
      supabase.from('v_project_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('v_projects').select('code,name').order('code'),
    ]);
    setDocs(d.error ? [] : (d.data ?? []));
    setProjects(p.error ? [] : (p.data ?? []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const projectName = form.projectName.trim();
    const officer = form.officer.trim();
    if (!projectName) { toast.error('Please enter the project name.'); return; }
    if (!officer) { toast.error('Please enter the submitting officer.'); return; }
    if (!form.file) { toast.error('Please choose a document to upload.'); return; }
    const kind = reportKind(form.file);
    if (!['docx', 'doc', 'pdf', 'xlsx'].includes(kind)) { toast.error('Only Word, PDF and Excel files are accepted.'); return; }
    if (form.file.size > MAX_MB * 1024 * 1024) { toast.error(`File exceeds ${MAX_MB}MB.`); return; }

    setBusy(true);
    try {
      // 1. store the document (private bucket), namespaced by project
      setProgress('Uploading…');
      const safeProject = projectName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
      const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${safeProject}/${Date.now()}_${safeName}`;
      const up = await supabase.storage.from(BUCKET).upload(path, form.file, { upsert: false, contentType: form.file.type || undefined });
      if (up.error) { toast.error(up.error.message || 'Upload failed.'); setBusy(false); setProgress(''); return; }

      // 2. scan the document for a summary
      setProgress('Scanning document…');
      let processed = { summary: null, wordCount: null };
      try { processed = await processReportFile(form.file); } catch { /* keep defaults */ }

      // 3. record the submission (logs officer + signed-in user + timestamp)
      const ins = await supabase.rpc('add_project_document', {
        p_project_name: projectName, p_doc_type: form.docType, p_submitted_by: officer,
        p_storage_path: path, p_file_name: form.file.name, p_file_type: kind,
        p_file_size: form.file.size, p_summary: processed.summary, p_word_count: processed.wordCount,
      });
      if (ins.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(ins.error.message || 'Could not record submission.');
        setBusy(false); setProgress(''); return;
      }
      toast.success('Document submitted.');
      setForm(f => ({ ...emptyForm, docType: f.docType, projectName: f.projectName })); // keep project for repeat submissions
      setOpen(o => ({ ...o, [projectName]: false }));
      load();
    } finally {
      setBusy(false); setProgress('');
    }
  };

  const download = async (d) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 120);
    if (error || !data?.signedUrl) { toast.error('Could not open the file.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = d.file_name; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const remove = async (d) => {
    if (!(await confirmDialog({ title: 'Delete document', message: `Delete "${d.file_name}" from ${d.project_name}? This cannot be undone.`, confirmLabel: 'Delete' }))) return;
    const { data, error } = await supabase.rpc('delete_project_document', { p_id: d.id });
    if (error) { toast.error(error.message || 'Delete failed.'); return; }
    if (data) await supabase.storage.from(BUCKET).remove([data]);
    toast.success('Document deleted.'); load();
  };

  // Per-project documentation KPIs: which key documents each project has on
  // file, completeness against the three key types, latest submission, officers.
  const kpi = useMemo(() => {
    const KEYS = ['annual_workplan', 'six_month_report', 'annual_report'];
    const byProject = new Map();
    const typeTotals = { annual_workplan: 0, six_month_report: 0, annual_report: 0 };
    docs.forEach(d => {
      if (!byProject.has(d.project_name)) {
        byProject.set(d.project_name, {
          project: d.project_name, total: 0,
          types: { annual_workplan: 0, six_month_report: 0, annual_report: 0 },
          officers: new Set(), latest: null,
        });
      }
      const p = byProject.get(d.project_name);
      p.total += 1;
      if (p.types[d.doc_type] !== undefined) p.types[d.doc_type] += 1;
      if (typeTotals[d.doc_type] !== undefined) typeTotals[d.doc_type] += 1;
      if (d.submitted_by) p.officers.add(d.submitted_by);
      if (!p.latest || new Date(d.created_at) > new Date(p.latest)) p.latest = d.created_at;
    });
    const rows = [...byProject.values()].map(p => {
      const present = KEYS.filter(k => p.types[k] > 0).length;
      return { ...p, officerCount: p.officers.size, present, complete: present === 3 };
    }).sort((a, b) => a.project.localeCompare(b.project));
    return {
      rows, typeTotals,
      projectCount: rows.length,
      totalDocs: docs.length,
      completeCount: rows.filter(r => r.complete).length,
    };
  }, [docs]);

  // Group documents by project name, honouring the search filter.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map();
    docs.forEach(d => {
      if (needle && !(`${d.project_name} ${d.file_name} ${d.submitted_by} ${DOC_LABEL[d.doc_type] || ''}`.toLowerCase().includes(needle))) return;
      if (!map.has(d.project_name)) map.set(d.project_name, []);
      map.get(d.project_name).push(d);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs, q]);

  return (
    <div style={{ maxWidth: 1100 }} className="animate-fade-up page-pad">
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)', margin: '0 0 0.25rem' }}>
        Project Files
      </h1>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: '0 0 1.25rem' }}>
        Submit project workplans and reports · {docs.length} document{docs.length === 1 ? '' : 's'} on file
      </div>

      {/* ── Submission form ─────────────────────────────────────────────── */}
      <form onSubmit={submit} className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', marginBottom: '1rem' }}>Submit a document</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '0.85rem' }}>
          <div>
            <label className="field-label">Document type *</label>
            <select className="field-input" value={form.docType} onChange={e => setF('docType', e.target.value)} disabled={busy}>
              {DOC_TYPES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Project name *</label>
            <input className="field-input" list="project-name-options" value={form.projectName}
              onChange={e => setF('projectName', e.target.value)} placeholder="e.g. VCAP2" disabled={busy} />
            <datalist id="project-name-options">
              {projects.map(p => <option key={p.code} value={p.name ? `${p.name}` : p.code}>{p.code}</option>)}
            </datalist>
          </div>
          <div>
            <label className="field-label">Submitting officer *</label>
            <input className="field-input" value={form.officer} onChange={e => setF('officer', e.target.value)} placeholder="Full name of officer" disabled={busy} />
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', border: '1.5px dashed var(--border)', borderRadius: 10, padding: '1.1rem', cursor: busy ? 'default' : 'pointer', color: 'var(--text-3)', background: 'var(--green-50, #f3f7f4)' }}>
          {busy ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={20} />}
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-2)' }}>
            {busy ? (progress || 'Working…') : form.file ? form.file.name : 'Choose a document'}
          </span>
          <span style={{ fontSize: '0.7rem', textAlign: 'center' }}>Word, PDF or Excel · up to {MAX_MB}MB · scanned automatically and filed under the project</span>
          <input type="file" accept={ACCEPTED_REPORT_EXT} disabled={busy} style={{ display: 'none' }}
            onChange={e => setF('file', e.target.files?.[0] || null)} />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="submit" disabled={busy} className="btn-primary" style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer', fontWeight: 700 }}>
            {busy ? 'Submitting…' : 'Submit document'}
          </button>
        </div>
      </form>

      {/* ── Documentation KPIs ──────────────────────────────────────────── */}
      {!loading && kpi.projectCount > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
            <GaugeCircle size={17} style={{ color: 'var(--green-700, #155e34)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>Key documents KPIs</span>
          </div>

          {/* Summary stat band */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '1rem 1.1rem', borderBottom: '1px solid var(--border)', background: 'var(--green-50, #f3f7f4)' }}>
            {[
              ['Projects', kpi.projectCount],
              ['Documents', kpi.totalDocs],
              ['Complete sets', `${kpi.completeCount}/${kpi.projectCount}`],
              ['Annual Workplans', kpi.typeTotals.annual_workplan],
              ['6-Month Reports', kpi.typeTotals.six_month_report],
              ['Annual Reports', kpi.typeTotals.annual_report],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--green-700, #155e34)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Per-project scorecard */}
          <div style={{ overflowX: 'auto' }} className="scrollbar-thin">
            <table className="data-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th style={{ textAlign: 'center' }}>Docs</th>
                  <th style={{ textAlign: 'center' }}>Annual Workplan</th>
                  <th style={{ textAlign: 'center' }}>6-Month Report</th>
                  <th style={{ textAlign: 'center' }}>Annual Report</th>
                  <th>Completeness</th>
                  <th>Latest</th>
                  <th style={{ textAlign: 'center' }}>Officers</th>
                </tr>
              </thead>
              <tbody>
                {kpi.rows.map(r => (
                  <tr key={r.project}>
                    <td style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.8125rem', maxWidth: 220 }}>{r.project}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{r.total}</td>
                    {['annual_workplan', 'six_month_report', 'annual_report'].map(k => (
                      <td key={k} style={{ textAlign: 'center' }}><DocCell count={r.types[k]} /></td>
                    ))}
                    <td style={{ minWidth: 130 }}><Completeness present={r.present} /></td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{r.latest ? fmtDateTime(r.latest) : '—'}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{r.officerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── File manager ────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
          <FolderOpen size={17} style={{ color: 'var(--green-700, #155e34)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>File manager</span>
          <div style={{ position: 'relative', marginLeft: 'auto', flex: '0 1 260px' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects & files…" className="field-input" style={{ paddingLeft: 30, height: 34 }} />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>
            {docs.length === 0 ? 'No documents submitted yet.' : 'No documents match your search.'}
          </div>
        ) : (
          <div>
            {groups.map(([project, list]) => {
              const collapsed = open[project] === false ? false : open[project]; // undefined => expanded
              const isCollapsed = collapsed === true;
              return (
                <div key={project} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => setOpen(o => ({ ...o, [project]: !isCollapsed }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.1rem', background: 'var(--green-50, #f3f7f4)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{project}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: '0.25rem' }}>{list.length} document{list.length > 1 ? 's' : ''}</span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      {list.map(d => {
                        const badge = DOC_BADGE[d.doc_type] || DOC_BADGE.annual_workplan;
                        return (
                          <div key={d.id} style={{ display: 'flex', gap: '0.7rem', padding: '0.75rem 1.1rem 0.75rem 2.2rem', borderTop: '1px solid var(--border)' }}>
                            <FileText size={16} style={{ color: 'var(--gold-600, #8a6416)', flexShrink: 0, marginTop: '0.15rem' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', background: badge.bg, color: badge.txt, borderRadius: 4, padding: '0.1rem 0.4rem' }}>{DOC_LABEL[d.doc_type]}</span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name}</span>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>
                                Submitted by <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{d.submitted_by}</span> · {fmtDateTime(d.created_at)}
                                {d.file_type && ` · ${REPORT_KIND_LABEL[d.file_type] || 'Document'}`}
                              </div>
                              {d.summary && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', marginTop: '0.4rem', lineHeight: 1.5, whiteSpace: 'pre-line', maxHeight: 90, overflow: 'auto' }} className="scrollbar-thin">{d.summary}</div>
                              )}
                            </div>
                            <button onClick={() => download(d)} title="Download" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.45rem', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignSelf: 'flex-start' }}><Download size={14} /></button>
                            {canEdit && (
                              <button onClick={() => remove(d)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600, #b3402f)', padding: 4, display: 'flex', alignSelf: 'flex-start' }}><Trash2 size={15} /></button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
