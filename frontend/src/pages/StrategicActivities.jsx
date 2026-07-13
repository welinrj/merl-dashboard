import { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Search, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { ACTIVITIES as EMBEDDED } from '../strategicPlan';

const BANNER = `${import.meta.env.BASE_URL}IMG_0874.jpeg`;
const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const THEMES = ['Adaptation', 'Mitigation', 'Governance', 'Finance', 'Knowledge', 'Cross-cutting'];
const STATUS = {
  on_track:    { label:'On Track',    col:'#1a8c4e', bg:'#dcece2', txt:'#155e34' },
  at_risk:     { label:'At Risk',     col:'#d99a2b', bg:'#f7ead0', txt:'#8a6416' },
  no_progress: { label:'No Progress', col:'#b3402f', bg:'#f6ded8', txt:'#8a2e21' },
  unrated:     { label:'Unrated',     col:'#9a9186', bg:'#ece9e3', txt:'#5b5349' },
};
// Embedded fallback uses the traffic-light keys; map to DB status keys.
const MAP = { green:'on_track', amber:'at_risk', red:'no_progress', none:'unrated' };
const fmtVUV = n => !n ? '—' :
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : String(Math.round(n));

const emptyForm = {
  name:'', theme:'Adaptation', focus_area:'', code:'', indicator:'',
  budget_vuv:'', status:'unrated', progress:'', risk:'', target_2030:'',
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
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fTheme, setFTheme] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [modal, setModal] = useState(null);   // { form, editingId } | null
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('v_srf_activities').select('*').order('sort_order');
    if (!error && data && data.length) {
      setRows(data); setLive(true);
    } else {
      // Offline / not migrated yet — show the embedded plan (read-only).
      setRows(EMBEDDED.map((a, i) => ({
        id: `embed-${i}`, code:a.code, name:a.name, theme:a.theme, focus_area:a.focusArea,
        indicator:a.indicator, budget_vuv:a.budget, status:MAP[a.status] ?? 'unrated',
        progress:a.progress, risk:a.risk, target_2030:a.target2030,
      })));
      setLive(false);
    }
    setLoading(false);
  }, []);

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

  const openAdd = () => setModal({ form: { ...emptyForm }, editingId: null });
  const openEdit = (r) => setModal({ editingId: r.id, form: {
    name:r.name ?? '', theme:r.theme ?? 'Adaptation', focus_area:r.focus_area ?? '', code:r.code ?? '',
    indicator:r.indicator ?? '', budget_vuv:r.budget_vuv ?? '', status:r.status ?? 'unrated',
    progress:r.progress ?? '', risk:r.risk ?? '', target_2030:r.target_2030 ?? '',
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
    const { error } = modal.editingId
      ? await supabase.rpc('update_srf_activity', { p_id: modal.editingId, ...p })
      : await supabase.rpc('create_srf_activity', p);
    setSaving(false);
    if (error) { toast.error(error.message || 'Save failed.'); return; }
    toast.success(modal.editingId ? 'Activity updated.' : 'Activity added.');
    setModal(null); load();
  };

  const changeStatus = async (r, status) => {
    const { error } = await supabase.rpc('set_srf_activity_status', { p_id: r.id, p_status: status });
    if (error) { toast.error(error.message || 'Update failed.'); return; }
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status } : x));
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete activity "${r.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.rpc('delete_srf_activity', { p_id: r.id });
    if (error) { toast.error(error.message || 'Delete failed.'); return; }
    toast.success('Activity deleted.'); load();
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

      {/* Status summary */}
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
        {/* banner header */}
        <div style={{ height:56, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.1rem', position:'relative',
          backgroundImage:`url(${BANNER})`, backgroundRepeat:'no-repeat', backgroundSize:'cover', backgroundPosition:'center 22%' }}>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(18,13,10,0.9), rgba(18,13,10,0.4))' }} />
          <div style={{ position:'relative', zIndex:1, color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, textShadow:'0 1px 4px rgba(0,0,0,0.45)' }}>Activities Register</div>
          {canEdit && live && (
            <button onClick={openAdd} className="btn-primary" style={{ position:'relative', zIndex:1, display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.4rem 0.8rem', borderRadius:8, fontSize:'0.8rem', fontWeight:700, border:'none', cursor:'pointer' }}>
              <Plus size={15} /> Add activity
            </button>
          )}
        </div>

        {/* filters */}
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

        {/* table */}
        <div style={{ overflowX:'auto' }} className="scrollbar-thin">
          <table className="data-table" style={{ minWidth:820 }}>
            <thead>
              <tr>
                <th>Activity</th><th>Theme</th><th>Focus Area</th><th>Output Indicator</th>
                <th style={{ textAlign:'right' }}>Budget</th><th>Status</th>{canEdit && live && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-3)', padding:'2rem' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-3)', padding:'2rem' }}>No activities match.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ maxWidth:300 }}>
                    <div style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{r.name}</div>
                    {r.code && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{r.code}</div>}
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
                  {canEdit && live && (
                    <td style={{ whiteSpace:'nowrap' }}>
                      <button onClick={() => openEdit(r)} title="Edit" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} title="Delete" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red-600)', padding:4 }}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!canEdit && (
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginTop:'0.9rem', fontSize:'0.8rem', color:'var(--text-3)' }}>
          <AlertCircle size={15} /> Editing is restricted to administrators, M&amp;E officers and project managers.
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(18,13,10,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'3rem 1rem' }} onClick={() => !saving && setModal(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={save} className="card" style={{ width:'100%', maxWidth:560, padding:0, overflow:'hidden' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem' }}>{modal.editingId ? 'Edit activity' : 'Add activity'}</div>
              <button type="button" onClick={() => setModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              {[
                ['name','Activity name *','text'],
                ['focus_area','Focus area *','text'],
                ['code','Code (e.g. 1.2)','text'],
              ].map(([k, label, type]) => (
                <div key={k}>
                  <label className="field-label">{label}</label>
                  <input className="field-input" type={type} value={modal.form[k]}
                    onChange={e => setModal(m => ({ ...m, form:{ ...m.form, [k]:e.target.value } }))} />
                </div>
              ))}
              <div style={{ display:'flex', gap:'0.75rem' }}>
                <div style={{ flex:1 }}>
                  <label className="field-label">Theme</label>
                  <select className="field-input" value={modal.form.theme} onChange={e => setModal(m => ({ ...m, form:{ ...m.form, theme:e.target.value } }))}>
                    {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label className="field-label">Status</label>
                  <select className="field-input" value={modal.form.status} onChange={e => setModal(m => ({ ...m, form:{ ...m.form, status:e.target.value } }))}>
                    {Object.entries(STATUS).map(([k, mm]) => <option key={k} value={k}>{mm.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Output indicator</label>
                <textarea className="field-input" rows={2} value={modal.form.indicator}
                  onChange={e => setModal(m => ({ ...m, form:{ ...m.form, indicator:e.target.value } }))} />
              </div>
              <div style={{ display:'flex', gap:'0.75rem' }}>
                <div style={{ flex:1 }}>
                  <label className="field-label">Budget (VUV)</label>
                  <input className="field-input" type="number" min="0" value={modal.form.budget_vuv}
                    onChange={e => setModal(m => ({ ...m, form:{ ...m.form, budget_vuv:e.target.value } }))} />
                </div>
                <div style={{ flex:1 }}>
                  <label className="field-label">2030 target (0–1)</label>
                  <input className="field-input" type="number" min="0" max="1" step="0.1" value={modal.form.target_2030}
                    onChange={e => setModal(m => ({ ...m, form:{ ...m.form, target_2030:e.target.value } }))} />
                </div>
              </div>
              <div>
                <label className="field-label">Progress note</label>
                <input className="field-input" value={modal.form.progress}
                  onChange={e => setModal(m => ({ ...m, form:{ ...m.form, progress:e.target.value } }))} />
              </div>
              <div>
                <label className="field-label">Risk</label>
                <input className="field-input" value={modal.form.risk}
                  onChange={e => setModal(m => ({ ...m, form:{ ...m.form, risk:e.target.value } }))} />
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.5rem', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary" style={{ padding:'0.5rem 1rem', borderRadius:8, cursor:'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary" style={{ padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700 }}>
                {saving ? 'Saving…' : modal.editingId ? 'Save changes' : 'Add activity'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
