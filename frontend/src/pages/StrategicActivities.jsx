import { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Search, AlertCircle, Columns3, ImagePlus, Loader2, Upload, FileText, Download } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import { processReportFile, reportKind, ACCEPTED_REPORT_EXT, REPORT_KIND_LABEL } from '../reportProcessing';
import { signPhotoPaths } from '../lib/photoUrls';
import { ACTIVITIES as EMBEDDED } from '../strategicPlan';

const BANNER = `${import.meta.env.BASE_URL}IMG_0874.jpeg`;
const PHOTO_BUCKET = 'activity-photos';
const REPORT_BUCKET = 'activity-reports';
const MAX_PHOTO_MB = 10;
const MAX_REPORT_MB = 25;
const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const THEMES = ['Adaptation', 'Mitigation', 'Governance', 'Finance', 'Knowledge', 'Cross-cutting'];
const STATUS = {
  on_track:    { label:'On Track',    col:'#1a8c4e', bg:'#dcece2', txt:'#155e34' },
  at_risk:     { label:'At Risk',     col:'#d99a2b', bg:'#f7ead0', txt:'#8a6416' },
  no_progress: { label:'No Progress', col:'#b3402f', bg:'#f6ded8', txt:'#8a2e21' },
  unrated:     { label:'Unrated',     col:'#9a9186', bg:'#ece9e3', txt:'#5b5349' },
};
const MAP = { green:'on_track', amber:'at_risk', red:'no_progress', none:'unrated' };
const fmtVUV = n => !n ? '—' :
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : String(Math.round(n));

const emptyForm = {
  name:'', theme:'Adaptation', focus_area:'', code:'', indicator:'',
  budget_vuv:'', status:'unrated', progress:'', risk:'', target_2030:'', custom:{},
};

function StatusBadge({ s }) {
  const m = STATUS[s] ?? STATUS.unrated;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', background:m.bg, color:m.txt,
      borderRadius:9999, padding:'0.15rem 0.55rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:m.col }} />{m.label}
    </span>
  );
}

export default function StrategicActivities({ user }) {
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);          // custom column definitions
  const [photos, setPhotos] = useState({});      // activity_id -> [photo rows]
  const [reportCounts, setReportCounts] = useState({}); // activity_id -> count
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fTheme, setFTheme] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [modal, setModal] = useState(null);      // activity add/edit
  const [colsOpen, setColsOpen] = useState(false);
  const [photoModal, setPhotoModal] = useState(null); // { id, name } — manage photos
  const [reportModal, setReportModal] = useState(null); // { id, name } — manage reports
  const [saving, setSaving] = useState(false);

  const loadPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_srf_activity_photos').select('*').order('sort_order');
    if (error || !data) { setPhotos({}); return; }
    const map = {};
    data.forEach(p => { (map[p.activity_id] ||= []).push(p); });
    setPhotos(map);
  }, []);

  const loadReportCounts = useCallback(async () => {
    const { data, error } = await supabase.from('v_srf_activity_reports').select('activity_id');
    if (error || !data) { setReportCounts({}); return; }
    const map = {};
    data.forEach(r => { map[r.activity_id] = (map[r.activity_id] || 0) + 1; });
    setReportCounts(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [act, col] = await Promise.all([
      supabase.from('v_srf_activities').select('*').order('sort_order'),
      supabase.from('v_srf_columns').select('*').order('sort_order'),
    ]);
    if (!act.error && act.data && act.data.length) {
      setRows(act.data); setCols(col.error ? [] : (col.data ?? [])); setLive(true);
      loadPhotos(); loadReportCounts();
    } else {
      setRows(EMBEDDED.map((a, i) => ({
        id: `embed-${i}`, code:a.code, name:a.name, theme:a.theme, focus_area:a.focusArea,
        indicator:a.indicator, budget_vuv:a.budget, status:MAP[a.status] ?? 'unrated',
        progress:a.progress, risk:a.risk, target_2030:a.target2030, custom:{},
      })));
      setCols([]); setPhotos({}); setReportCounts({}); setLive(false);
    }
    setLoading(false);
  }, [loadPhotos, loadReportCounts]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r =>
    (fTheme === 'all' || r.theme === fTheme) &&
    (fStatus === 'all' || r.status === fStatus) &&
    (!q || `${r.name} ${r.focus_area} ${r.indicator} ${r.code}`.toLowerCase().includes(q.toLowerCase()))
  ), [rows, fTheme, fStatus, q]);

  const counts = useMemo(() => {
    const c = { on_track:0, at_risk:0, no_progress:0, unrated:0 };
    rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const openAdd = () => setModal({ form: { ...emptyForm, custom:{} }, editingId: null });
  const openEdit = (r) => setModal({ editingId: r.id, form: {
    name:r.name ?? '', theme:r.theme ?? 'Adaptation', focus_area:r.focus_area ?? '', code:r.code ?? '',
    indicator:r.indicator ?? '', budget_vuv:r.budget_vuv ?? '', status:r.status ?? 'unrated',
    progress:r.progress ?? '', risk:r.risk ?? '', target_2030:r.target_2030 ?? '', custom:{ ...(r.custom ?? {}) },
  } });

  const save = async (e) => {
    e.preventDefault();
    const f = modal.form;
    if (!f.name.trim() || !f.focus_area.trim()) { toast.error('Name and focus area are required.'); return; }
    setSaving(true);
    const p = {
      p_name:f.name.trim(), p_theme:f.theme, p_focus_area:f.focus_area.trim(),
      p_code:f.code.trim() || null, p_indicator:f.indicator.trim() || null,
      p_budget_vuv:f.budget_vuv === '' ? 0 : Number(f.budget_vuv), p_status:f.status,
      p_progress:f.progress.trim() || null, p_risk:f.risk.trim() || null,
      p_target_2030:f.target_2030 === '' ? null : Number(f.target_2030),
    };
    const res = modal.editingId
      ? await supabase.rpc('update_srf_activity', { p_id: modal.editingId, ...p })
      : await supabase.rpc('create_srf_activity', p);
    if (res.error) { setSaving(false); toast.error(res.error.message || 'Save failed.'); return; }
    const id = modal.editingId ?? res.data?.id;
    if (id && cols.length) {
      const custom = {}; cols.forEach(c => { custom[c.key] = f.custom?.[c.key] ?? null; });
      const cres = await supabase.rpc('set_srf_activity_custom', { p_id: id, p_custom: custom });
      if (cres.error) { setSaving(false); toast.error(cres.error.message || 'Saved, but custom fields failed.'); return; }
    }
    setSaving(false);
    toast.success(modal.editingId ? 'Activity updated.' : 'Activity added.');
    const created = !modal.editingId && id ? { id, name: f.name.trim() } : null;
    setModal(null); load();
    if (created) setPhotoModal(created); // let the user attach photos to the new activity right away
  };

  const changeStatus = async (r, status) => {
    const { error } = await supabase.rpc('set_srf_activity_status', { p_id: r.id, p_status: status });
    if (error) { toast.error(error.message || 'Update failed.'); return; }
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status } : x));
  };

  const remove = async (r) => {
    if (!(await confirmDialog({ title:'Delete activity', message:`Delete activity "${r.name}"? This cannot be undone.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_srf_activity', { p_id: r.id });
    if (error) { toast.error(error.message || 'Delete failed.'); return; }
    toast.success('Activity deleted.'); load();
  };

  const cellVal = (r, c) => {
    const v = r.custom?.[c.key];
    return (v === null || v === undefined || v === '') ? '—' : String(v);
  };

  return (
    <div style={{ maxWidth:1400 }} className="animate-fade-up page-pad">
      <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800, letterSpacing:'-0.02em', color:'var(--text-1)', margin:'0 0 0.25rem' }}>
        Strategic Results Framework — Activities
      </h1>
      <div style={{ fontSize:'0.85rem', color:'var(--text-2)', margin:'0 0 1.25rem' }}>
        DoCC Strategic Plan 2025–2030 · {rows.length} activities
        {!live && <span style={{ color:'var(--gold-500)', fontWeight:600 }}> · offline (read-only)</span>}
      </div>

      <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', marginBottom:'1rem' }}>
        {Object.entries(STATUS).map(([k, m]) => (
          <div key={k} style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'var(--white)', border:'1px solid var(--border)', borderRadius:10, padding:'0.5rem 0.85rem' }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:m.col }} />
            <span style={{ fontSize:'0.8rem', color:'var(--text-2)' }}>{m.label}</span>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, color:'var(--text-1)' }}>{counts[k]}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ height:56, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.1rem', position:'relative',
          backgroundImage:`url(${BANNER})`, backgroundRepeat:'no-repeat', backgroundSize:'cover', backgroundPosition:'center 22%' }}>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(18,13,10,0.9), rgba(18,13,10,0.4))' }} />
          <div style={{ position:'relative', zIndex:1, color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, textShadow:'0 1px 4px rgba(0,0,0,0.45)' }}>Activities Register</div>
          {canEdit && live && (
            <div style={{ position:'relative', zIndex:1, display:'flex', gap:'0.5rem' }}>
              <button onClick={() => setColsOpen(true)} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.4rem 0.7rem', borderRadius:8, fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
                <Columns3 size={15} /> Columns
              </button>
              <button onClick={openAdd} className="btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.4rem 0.8rem', borderRadius:8, fontSize:'0.8rem', fontWeight:700, border:'none', cursor:'pointer' }}>
                <Plus size={15} /> Add activity
              </button>
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', padding:'0.9rem 1rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ position:'relative', flex:'1 1 220px' }}>
            <Search size={15} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search activities…" className="field-input" style={{ paddingLeft:32 }} />
          </div>
          <select value={fTheme} onChange={e => setFTheme(e.target.value)} className="field-input" style={{ flex:'0 0 auto', width:'auto' }}>
            <option value="all">All themes</option>
            {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="field-input" style={{ flex:'0 0 auto', width:'auto' }}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ overflowX:'auto' }} className="scrollbar-thin activities-table-wrap">
          <table className="data-table" style={{ minWidth: 820 + cols.length * 140 }}>
            <thead>
              <tr>
                <th>Activity</th><th>Theme</th><th>Focus Area</th><th>Output Indicator</th>
                <th style={{ textAlign:'right' }}>Budget</th><th>Status</th>
                {cols.map(c => <th key={c.id}>{c.label}</th>)}
                {canEdit && live && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7 + cols.length} style={{ textAlign:'center', color:'var(--text-3)', padding:'2rem' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7 + cols.length} style={{ textAlign:'center', color:'var(--text-3)', padding:'2rem' }}>No activities match.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ maxWidth:300 }}>
                    <div style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{r.name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      {r.code && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{r.code}</span>}
                      {live && photos[r.id]?.length > 0 && (
                        <span title={`${photos[r.id].length} photo${photos[r.id].length > 1 ? 's' : ''}`}
                          style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', fontSize:'0.65rem', fontWeight:700, color:'var(--green-700, #155e34)' }}>
                          <ImagePlus size={12} />{photos[r.id].length}
                        </span>
                      )}
                      {live && reportCounts[r.id] > 0 && (
                        <span title={`${reportCounts[r.id]} report${reportCounts[r.id] > 1 ? 's' : ''}`}
                          style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', fontSize:'0.65rem', fontWeight:700, color:'var(--gold-600, #8a6416)' }}>
                          <FileText size={12} />{reportCounts[r.id]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize:'0.78rem', color:'var(--text-2)' }}>{r.theme}</td>
                  <td style={{ fontSize:'0.75rem', color:'var(--text-2)', maxWidth:150 }}>{r.focus_area}</td>
                  <td style={{ fontSize:'0.72rem', color:'var(--text-3)', maxWidth:240 }}>{r.indicator || '—'}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.8125rem', whiteSpace:'nowrap' }}>{fmtVUV(r.budget_vuv)}</td>
                  <td>
                    {canEdit && live ? (
                      <select value={r.status} onChange={e => changeStatus(r, e.target.value)}
                        style={{ fontSize:'0.7rem', fontWeight:700, border:`1px solid ${STATUS[r.status]?.col ?? 'var(--border)'}`, color:STATUS[r.status]?.txt, background:STATUS[r.status]?.bg, borderRadius:9999, padding:'0.15rem 0.4rem', cursor:'pointer' }}>
                        {Object.entries(STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                      </select>
                    ) : <StatusBadge s={r.status} />}
                  </td>
                  {cols.map(c => (
                    <td key={c.id} style={{ fontSize:'0.75rem', color:'var(--text-2)', maxWidth:160 }}>{cellVal(r, c)}</td>
                  ))}
                  {canEdit && live && (
                    <td style={{ whiteSpace:'nowrap' }}>
                      <button onClick={() => setReportModal({ id:r.id, name:r.name })} title="Reports" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}><FileText size={15} /></button>
                      <button onClick={() => setPhotoModal({ id:r.id, name:r.name })} title="Photos" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}><ImagePlus size={15} /></button>
                      <button onClick={() => openEdit(r)} title="Edit" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} title="Delete" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red-600)', padding:4 }}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — the table is replaced by cards on small screens */}
        <div className="activities-cards">
          {loading ? (
            <div style={{ textAlign:'center', color:'var(--text-3)', padding:'1.5rem' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text-3)', padding:'1.5rem' }}>No activities match.</div>
          ) : filtered.map(r => (
            <div key={r.id} className="activity-card">
              <div className="activity-card-head">
                <div style={{ minWidth:0 }}>
                  {r.code && <span className="activity-card-code">{r.code}</span>}
                  <div className="activity-card-name">{r.name}</div>
                </div>
                <StatusBadge s={r.status} />
              </div>
              <dl className="activity-card-meta">
                <div><dt>Theme</dt><dd>{r.theme || '—'}</dd></div>
                <div><dt>Focus Area</dt><dd>{r.focus_area || '—'}</dd></div>
                <div><dt>Output Indicator</dt><dd>{r.indicator || '—'}</dd></div>
                <div><dt>Budget</dt><dd>{r.budget_vuv ? `${fmtVUV(r.budget_vuv)} VUV` : '—'}</dd></div>
                {cols.map(c => (
                  <div key={c.id}><dt>{c.label}</dt><dd>{cellVal(r, c)}</dd></div>
                ))}
              </dl>
              {(live && (photos[r.id]?.length > 0 || reportCounts[r.id] > 0)) && (
                <div className="activity-card-badges">
                  {photos[r.id]?.length > 0 && (
                    <span style={{ color:'var(--green-700, #155e34)' }}><ImagePlus size={13} />{photos[r.id].length}</span>
                  )}
                  {reportCounts[r.id] > 0 && (
                    <span style={{ color:'var(--gold-600, #8a6416)' }}><FileText size={13} />{reportCounts[r.id]}</span>
                  )}
                </div>
              )}
              {canEdit && live && (
                <div className="activity-card-actions">
                  <select value={r.status} onChange={e => changeStatus(r, e.target.value)} aria-label="Status"
                    style={{ fontSize:'0.72rem', fontWeight:700, border:`1px solid ${STATUS[r.status]?.col ?? 'var(--border)'}`, color:STATUS[r.status]?.txt, background:STATUS[r.status]?.bg, borderRadius:9999, padding:'0.25rem 0.5rem', cursor:'pointer' }}>
                    {Object.entries(STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                  <div style={{ marginLeft:'auto', display:'flex', gap:'0.15rem' }}>
                    <button onClick={() => setReportModal({ id:r.id, name:r.name })} title="Reports" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:6 }}><FileText size={17} /></button>
                    <button onClick={() => setPhotoModal({ id:r.id, name:r.name })} title="Photos" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:6 }}><ImagePlus size={17} /></button>
                    <button onClick={() => openEdit(r)} title="Edit" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:6 }}><Pencil size={17} /></button>
                    <button onClick={() => remove(r)} title="Delete" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red-600)', padding:6 }}><Trash2 size={17} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {!canEdit && (
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginTop:'0.9rem', fontSize:'0.8rem', color:'var(--text-3)' }}>
          <AlertCircle size={15} /> Editing is restricted to administrators, M&amp;E officers and project managers.
        </div>
      )}

      {modal && (
        <ActivityModal modal={modal} setModal={setModal} cols={cols} saving={saving} onSave={save} />
      )}
      {colsOpen && (
        <ColumnsModal cols={cols} onClose={() => setColsOpen(false)} onChanged={load} />
      )}
      {photoModal && (
        <PhotosModal
          activity={photoModal}
          photos={photos[photoModal.id] ?? []}
          user={user}
          onClose={() => setPhotoModal(null)}
          onChanged={loadPhotos}
        />
      )}
      {reportModal && (
        <ReportsModal
          activity={reportModal}
          onClose={() => setReportModal(null)}
          onChanged={() => { loadReportCounts(); loadPhotos(); }}
        />
      )}
    </div>
  );
}

/* ── Activity reports modal ──────────────────────────────────────────────── */
function ReportsModal({ activity, onClose, onChanged }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_srf_activity_reports').select('*')
      .eq('activity_id', activity.id).order('created_at', { ascending: false });
    setReports(error ? [] : (data ?? []));
    setLoading(false);
  }, [activity.id]);

  useEffect(() => { load(); }, [load]);

  const upload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const file of files) {
        const kind = reportKind(file);
        if (!['docx', 'doc', 'pdf', 'xlsx'].includes(kind)) { toast.error(`${file.name}: only Word, PDF and Excel files are accepted.`); continue; }
        if (file.size > MAX_REPORT_MB * 1024 * 1024) { toast.error(`${file.name} exceeds ${MAX_REPORT_MB}MB.`); continue; }

        // 1. store the report file (private bucket)
        setProgress(`Uploading ${file.name}…`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${activity.id}/${Date.now()}_${safeName}`;
        const up = await supabase.storage.from(REPORT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (up.error) { toast.error(up.error.message || `Upload of ${file.name} failed.`); continue; }

        // 2. extract summary + embedded photos in the browser
        setProgress(`Reading ${file.name}…`);
        let processed = { summary: null, wordCount: null, images: [] };
        try { processed = await processReportFile(file); } catch { /* keep defaults */ }

        // 3. save report metadata
        const ins = await supabase.rpc('add_srf_activity_report', {
          p_activity_id: activity.id, p_storage_path: path, p_file_name: file.name,
          p_file_type: kind, p_file_size: file.size, p_summary: processed.summary,
          p_word_count: processed.wordCount, p_photo_count: processed.images.length,
        });
        if (ins.error) {
          await supabase.storage.from(REPORT_BUCKET).remove([path]);
          toast.error(ins.error.message || 'Could not save report.');
          continue;
        }
        const reportId = ins.data?.id;

        // 4. push any extracted photos into the gallery
        if (reportId && processed.images.length) {
          setProgress(`Saving ${processed.images.length} photo(s) from ${file.name}…`);
          for (let i = 0; i < processed.images.length; i++) {
            const img = processed.images[i];
            const ipath = `${activity.id}/report/${reportId}/${i + 1}.${img.ext}`;
            const iup = await supabase.storage.from(PHOTO_BUCKET).upload(ipath, img.blob, { upsert: true, contentType: img.blob.type || `image/${img.ext}` });
            if (iup.error) continue;
            await supabase.rpc('add_srf_report_photo', {
              p_activity_id: activity.id, p_report_id: reportId, p_storage_path: ipath,
              p_caption: `${file.name} — photo ${i + 1}`,
            });
          }
        }
        ok += 1;
      }
      if (ok > 0) { toast.success(`${ok} report${ok > 1 ? 's' : ''} uploaded.`); onChanged(); load(); }
    } finally {
      setBusy(false); setProgress('');
    }
  };

  const download = async (r) => {
    const { data, error } = await supabase.storage.from(REPORT_BUCKET).createSignedUrl(r.storage_path, 120);
    if (error || !data?.signedUrl) { toast.error('Could not open the file.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = r.file_name; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const remove = async (r) => {
    if (!(await confirmDialog({ title: 'Delete report', message: `Delete "${r.file_name}"? Any photos taken from it will also be removed. This cannot be undone.`, confirmLabel: 'Delete' }))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('delete_srf_activity_report', { p_id: r.id });
    if (error) { setBusy(false); toast.error(error.message || 'Delete failed.'); return; }
    const paths = Array.isArray(data) ? data : [];
    const reportPaths = paths.filter(p => p === r.storage_path);
    const photoPaths = paths.filter(p => p !== r.storage_path);
    if (reportPaths.length) await supabase.storage.from(REPORT_BUCKET).remove(reportPaths);
    if (photoPaths.length) await supabase.storage.from(PHOTO_BUCKET).remove(photoPaths);
    setBusy(false); toast.success('Report deleted.'); onChanged(); load();
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(18,13,10,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'3rem 1rem' }} onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:640, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'1rem', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem' }}>Activity reports</div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-3)', marginTop:'0.15rem' }}>{activity.name}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18} /></button>
        </div>

        <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.9rem' }}>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.4rem', border:'1.5px dashed var(--border)', borderRadius:10, padding:'1.1rem', cursor: busy ? 'default' : 'pointer', color:'var(--text-3)', background:'var(--green-50, #f3f7f4)' }}>
            {busy ? <Loader2 size={20} style={{ animation:'spin 1s linear infinite' }} /> : <Upload size={20} />}
            <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-2)' }}>{busy ? (progress || 'Working…') : 'Click to upload reports'}</span>
            <span style={{ fontSize:'0.7rem', textAlign:'center' }}>Word, PDF or Excel · up to {MAX_REPORT_MB}MB · summarised automatically; photographs inside are added to the gallery (logos and graphics are skipped)</span>
            <input type="file" accept={ACCEPTED_REPORT_EXT} multiple disabled={busy} style={{ display:'none' }}
              onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          </label>

          {loading ? (
            <div style={{ fontSize:'0.85rem', color:'var(--text-3)', textAlign:'center', padding:'0.5rem 0' }}>Loading…</div>
          ) : reports.length === 0 ? (
            <div style={{ fontSize:'0.85rem', color:'var(--text-3)', textAlign:'center', padding:'0.5rem 0' }}>No reports yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.7rem' }}>
              {reports.map(r => (
                <div key={r.id} style={{ border:'1px solid var(--border)', borderRadius:10, padding:'0.7rem 0.8rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <FileText size={16} style={{ color:'var(--gold-600, #8a6416)', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.file_name}</div>
                      <div style={{ fontSize:'0.68rem', color:'var(--text-3)' }}>
                        {REPORT_KIND_LABEL[r.file_type] || 'Document'}
                        {r.photo_count > 0 && ` · ${r.photo_count} photo${r.photo_count > 1 ? 's' : ''} → gallery`}
                        {r.uploaded_by && ` · ${r.uploaded_by}`}
                      </div>
                    </div>
                    <button onClick={() => download(r)} title="Download" style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'0.3rem 0.45rem', cursor:'pointer', color:'var(--text-2)', display:'flex' }}><Download size={14} /></button>
                    <button onClick={() => remove(r)} disabled={busy} title="Delete" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red-600, #b3402f)', padding:4, display:'flex' }}><Trash2 size={15} /></button>
                  </div>
                  {r.summary && (
                    <div style={{ fontSize:'0.72rem', color:'var(--text-2)', marginTop:'0.5rem', lineHeight:1.5, whiteSpace:'pre-line', maxHeight:96, overflow:'auto' }} className="scrollbar-thin">{r.summary}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <button type="button" onClick={onClose} className="btn-primary" style={{ padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>Done</button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Activity photos modal ───────────────────────────────────────────────── */
function PhotosModal({ activity, photos, user, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [captions, setCaptions] = useState({});   // photo id -> draft caption
  const [urls, setUrls] = useState(new Map());     // storage_path -> signed URL

  // The activity-photos bucket is private; sign the visible paths on demand.
  const pathKey = photos.map(p => p.storage_path).join('|');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await signPhotoPaths(photos.map(p => p.storage_path));
      if (!cancelled) setUrls(map);
    })();
    return () => { cancelled = true; };
  }, [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} is not an image.`); continue; }
        if (file.size > MAX_PHOTO_MB * 1024 * 1024) { toast.error(`${file.name} exceeds ${MAX_PHOTO_MB}MB.`); continue; }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${activity.id}/${Date.now()}_${safeName}`;
        const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
        if (up.error) { toast.error(up.error.message || `Upload of ${file.name} failed.`); continue; }
        const rpc = await supabase.rpc('add_srf_activity_photo', {
          p_activity_id: activity.id, p_storage_path: path, p_caption: null,
        });
        if (rpc.error) {
          await supabase.storage.from(PHOTO_BUCKET).remove([path]); // roll back orphaned object
          toast.error(rpc.error.message || 'Could not save photo.');
          continue;
        }
        ok += 1;
      }
      if (ok > 0) { toast.success(`${ok} photo${ok > 1 ? 's' : ''} uploaded.`); onChanged(); }
    } finally {
      setBusy(false);
    }
  };

  const saveCaption = async (p) => {
    const draft = captions[p.id];
    if (draft === undefined || draft === (p.caption ?? '')) return;
    const { error } = await supabase.rpc('update_srf_activity_photo', { p_id: p.id, p_caption: draft });
    if (error) { toast.error(error.message || 'Could not save caption.'); return; }
    toast.success('Caption saved.'); onChanged();
  };

  const remove = async (p) => {
    if (!(await confirmDialog({ title:'Delete photo', message:'Delete this photo? This cannot be undone.', confirmLabel:'Delete' }))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('delete_srf_activity_photo', { p_id: p.id });
    if (error) { setBusy(false); toast.error(error.message || 'Delete failed.'); return; }
    if (data) await supabase.storage.from(PHOTO_BUCKET).remove([data]);
    setBusy(false); toast.success('Photo deleted.'); onChanged();
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(18,13,10,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'3rem 1rem' }} onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:620, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'1rem', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem' }}>Activity photos</div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-3)', marginTop:'0.15rem' }}>{activity.name}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18} /></button>
        </div>

        <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.9rem' }}>
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.4rem', border:'1.5px dashed var(--border)', borderRadius:10, padding:'1.1rem', cursor: busy ? 'default' : 'pointer', color:'var(--text-3)', background:'var(--green-50, #f3f7f4)' }}>
            {busy ? <Loader2 size={20} style={{ animation:'spin 1s linear infinite' }} /> : <Upload size={20} />}
            <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-2)' }}>
              {busy ? 'Uploading…' : 'Click to upload photos'}
            </span>
            <span style={{ fontSize:'0.7rem' }}>JPG, PNG or WebP · up to {MAX_PHOTO_MB}MB each · these appear in generated reports</span>
            <input type="file" accept="image/*" multiple disabled={busy} style={{ display:'none' }}
              onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          </label>

          {photos.length === 0 ? (
            <div style={{ fontSize:'0.85rem', color:'var(--text-3)', textAlign:'center', padding:'0.5rem 0' }}>No photos yet.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'0.8rem' }}>
              {photos.map(p => (
                <div key={p.id} style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', background:'var(--white)' }}>
                  <div style={{ position:'relative', aspectRatio:'4 / 3', background:'#ece9e3' }}>
                    <img src={urls.get(p.storage_path) || ''} alt={p.caption || 'Activity photo'} loading="lazy"
                      style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                    <button onClick={() => remove(p)} disabled={busy} title="Delete photo" aria-label="Delete photo"
                      style={{ position:'absolute', top:8, right:8, background:'rgba(179,64,47,0.92)', border:'none', borderRadius:8, cursor:'pointer', color:'#fff', padding:'0.4rem', display:'flex', boxShadow:'0 1px 4px rgba(0,0,0,0.35)' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input className="field-input" placeholder="Add a caption…" style={{ border:'none', borderTop:'1px solid var(--border)', borderRadius:0, fontSize:'0.72rem' }}
                    value={captions[p.id] ?? p.caption ?? ''}
                    onChange={e => setCaptions(s => ({ ...s, [p.id]: e.target.value }))}
                    onBlur={() => saveCaption(p)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                  <button onClick={() => remove(p)} disabled={busy}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem', width:'100%', border:'none', borderTop:'1px solid var(--border)', background:'var(--white)', color:'var(--red-600, #b3402f)', padding:'0.45rem', cursor: busy ? 'default' : 'pointer', fontSize:'0.72rem', fontWeight:700 }}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <button type="button" onClick={onClose} className="btn-primary" style={{ padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>Done</button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Activity add/edit modal ─────────────────────────────────────────────── */
function ActivityModal({ modal, setModal, cols, saving, onSave }) {
  const setF = (k, v) => setModal(m => ({ ...m, form:{ ...m.form, [k]:v } }));
  const setCustom = (key, v) => setModal(m => ({ ...m, form:{ ...m.form, custom:{ ...m.form.custom, [key]:v } } }));
  const f = modal.form;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(18,13,10,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'3rem 1rem' }} onClick={() => !saving && setModal(null)}>
      <form onClick={e => e.stopPropagation()} onSubmit={onSave} className="card" style={{ width:'100%', maxWidth:560, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem' }}>{modal.editingId ? 'Edit activity' : 'Add activity'}</div>
          <button type="button" onClick={() => setModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
          <div><label className="field-label">Activity name *</label><input className="field-input" value={f.name} onChange={e => setF('name', e.target.value)} /></div>
          <div><label className="field-label">Focus area *</label><input className="field-input" value={f.focus_area} onChange={e => setF('focus_area', e.target.value)} /></div>
          <div><label className="field-label">Code (e.g. 1.2)</label><input className="field-input" value={f.code} onChange={e => setF('code', e.target.value)} /></div>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <div style={{ flex:1 }}><label className="field-label">Theme</label>
              <select className="field-input" value={f.theme} onChange={e => setF('theme', e.target.value)}>{THEMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div style={{ flex:1 }}><label className="field-label">Status</label>
              <select className="field-input" value={f.status} onChange={e => setF('status', e.target.value)}>{Object.entries(STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></div>
          </div>
          <div><label className="field-label">Output indicator</label><textarea className="field-input" rows={2} value={f.indicator} onChange={e => setF('indicator', e.target.value)} /></div>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <div style={{ flex:1 }}><label className="field-label">Budget (VUV)</label><input className="field-input" type="number" min="0" value={f.budget_vuv} onChange={e => setF('budget_vuv', e.target.value)} /></div>
            <div style={{ flex:1 }}><label className="field-label">2030 target (0–1)</label><input className="field-input" type="number" min="0" max="1" step="0.1" value={f.target_2030} onChange={e => setF('target_2030', e.target.value)} /></div>
          </div>
          <div><label className="field-label">Progress note</label><input className="field-input" value={f.progress} onChange={e => setF('progress', e.target.value)} /></div>
          <div><label className="field-label">Risk</label><input className="field-input" value={f.risk} onChange={e => setF('risk', e.target.value)} /></div>
          {cols.length > 0 && (
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.85rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div style={{ fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-3)' }}>Custom fields</div>
              {cols.map(c => (
                <div key={c.id}>
                  <label className="field-label">{c.label}</label>
                  {c.type === 'select' ? (
                    <select className="field-input" value={f.custom?.[c.key] ?? ''} onChange={e => setCustom(c.key, e.target.value)}>
                      <option value="">—</option>
                      {(c.options || []).map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="field-input" type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      value={f.custom?.[c.key] ?? ''} onChange={e => setCustom(c.key, e.target.value)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.5rem', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary" style={{ padding:'0.5rem 1rem', borderRadius:8, cursor:'pointer' }}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary" style={{ padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>
            {saving ? 'Saving…' : modal.editingId ? 'Save changes' : 'Add activity'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Manage-columns modal ────────────────────────────────────────────────── */
function ColumnsModal({ cols, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState('');
  const [edits, setEdits] = useState({});   // id -> {label,type,options}

  const optsArr = (s) => s.split(',').map(x => x.trim()).filter(Boolean);

  const add = async () => {
    if (!newLabel.trim()) { toast.error('Column name is required.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('create_srf_column', {
      p_label: newLabel.trim(), p_type: newType, p_options: newType === 'select' ? optsArr(newOptions) : [],
    });
    setBusy(false);
    if (error) { toast.error(error.message || 'Could not add column.'); return; }
    setNewLabel(''); setNewType('text'); setNewOptions(''); toast.success('Column added.'); onChanged();
  };

  const saveEdit = async (c) => {
    const e = edits[c.id] || {};
    const label = e.label ?? c.label;
    const type = e.type ?? c.type;
    const options = e.options !== undefined ? optsArr(e.options) : (c.options || []);
    setBusy(true);
    const { error } = await supabase.rpc('update_srf_column', { p_id: c.id, p_label: label, p_type: type, p_options: type === 'select' ? options : [] });
    setBusy(false);
    if (error) { toast.error(error.message || 'Could not update column.'); return; }
    toast.success('Column updated.'); onChanged();
  };

  const del = async (c) => {
    if (!(await confirmDialog({ title:'Delete column', message:`Delete column "${c.label}"? Its values will be removed from all activities.`, confirmLabel:'Delete' }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_srf_column', { p_id: c.id });
    setBusy(false);
    if (error) { toast.error(error.message || 'Could not delete column.'); return; }
    toast.success('Column deleted.'); onChanged();
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(18,13,10,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'3rem 1rem' }} onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:600, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem' }}>Manage columns</div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>
            Core columns (Activity, Theme, Focus Area, Indicator, Budget, Status) are fixed. Add your own custom columns below.
          </div>

          {cols.length === 0 && <div style={{ fontSize:'0.85rem', color:'var(--text-3)' }}>No custom columns yet.</div>}
          {cols.map(c => {
            const e = edits[c.id] || {};
            const type = e.type ?? c.type;
            return (
              <div key={c.id} style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap', border:'1px solid var(--border)', borderRadius:10, padding:'0.6rem' }}>
                <input className="field-input" style={{ flex:'1 1 140px' }} value={e.label ?? c.label}
                  onChange={ev => setEdits(s => ({ ...s, [c.id]:{ ...s[c.id], label:ev.target.value } }))} />
                <select className="field-input" style={{ flex:'0 0 auto', width:'auto' }} value={type}
                  onChange={ev => setEdits(s => ({ ...s, [c.id]:{ ...s[c.id], type:ev.target.value } }))}>
                  <option value="text">Text</option><option value="number">Number</option>
                  <option value="date">Date</option><option value="select">Select</option>
                </select>
                {type === 'select' && (
                  <input className="field-input" style={{ flex:'1 1 140px' }} placeholder="Option A, Option B"
                    value={e.options ?? (c.options || []).join(', ')}
                    onChange={ev => setEdits(s => ({ ...s, [c.id]:{ ...s[c.id], options:ev.target.value } }))} />
                )}
                <button onClick={() => saveEdit(c)} disabled={busy} className="btn-secondary" style={{ padding:'0.4rem 0.7rem', borderRadius:8, cursor:'pointer', fontSize:'0.78rem', fontWeight:700 }}>Save</button>
                <button onClick={() => del(c)} disabled={busy} title="Delete" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red-600)', padding:4 }}><Trash2 size={16} /></button>
              </div>
            );
          })}

          {/* add new */}
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.85rem', display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
            <input className="field-input" style={{ flex:'1 1 140px' }} placeholder="New column name" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            <select className="field-input" style={{ flex:'0 0 auto', width:'auto' }} value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Select</option>
            </select>
            {newType === 'select' && (
              <input className="field-input" style={{ flex:'1 1 140px' }} placeholder="Option A, Option B" value={newOptions} onChange={e => setNewOptions(e.target.value)} />
            )}
            <button onClick={add} disabled={busy} className="btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.45rem 0.8rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>
              <Plus size={15} /> Add column
            </button>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <button type="button" onClick={onClose} className="btn-primary" style={{ padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>Done</button>
        </div>
      </div>
    </div>
  );
}
