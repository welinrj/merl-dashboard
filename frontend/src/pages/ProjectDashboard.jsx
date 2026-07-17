// Per-project KPI dashboard. Renders a project's profile (basic data, key
// dates, finance, ratings, highlights and Development Objective Progress
// indicators) from merl.project_profiles. Indicators carry numeric baseline /
// mid-term / end-of-project targets plus a history of reported levels, so the
// dashboard measures progress toward the end-of-project target and keeps the
// trajectory even after the source document is deleted. Editors can record a
// new measurement, which is appended to the indicator history and re-measured.
import { useEffect, useState, useCallback, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, GaugeCircle, Building2, CalendarDays, Wallet, ShieldCheck, X, Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];

const STATUS = {
  exceeded:    { label: 'Exceeded',    col: '#1a8c4e', bg: '#dcece2', txt: '#155e34' },
  on_track:    { label: 'On track',    col: '#1a8c4e', bg: '#dcece2', txt: '#155e34' },
  in_progress: { label: 'In progress', col: '#d99a2b', bg: '#f7ead0', txt: '#8a6416' },
  delayed:     { label: 'Delayed',     col: '#b3402f', bg: '#f6ded8', txt: '#8a2e21' },
  not_started: { label: 'Not started', col: '#9a9186', bg: '#ece9e3', txt: '#5b5349' },
};

const fmtUSD = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return 'USD ' + v.toLocaleString('en-US');
};
const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—');

// Latest reported numeric level for an indicator.
const currentVal = (it) => {
  const h = Array.isArray(it.history) ? it.history : [];
  if (h.length) return Number(h[h.length - 1].value);
  return it.current_val != null ? Number(it.current_val) : null;
};
// Progress toward the end-of-project target (%), or null if not measurable.
const progressPct = (it) => {
  const cur = currentVal(it);
  const end = it.end_val != null ? Number(it.end_val) : null;
  if (cur == null || !end) return null;
  return Math.round((cur / end) * 100);
};

function StatusBadge({ s }) {
  const m = STATUS[s] || STATUS.not_started;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: m.bg, color: m.txt, borderRadius: 9999, padding: '0.12rem 0.5rem', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.col }} />{m.label}
    </span>
  );
}

function ProgressBar({ pct }) {
  if (pct == null) return <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>—</span>;
  const fill = Math.max(0, Math.min(pct, 100));
  const col = pct >= 100 ? 'var(--green-600, #1a8c4e)' : pct >= 40 ? 'var(--green-600, #1a8c4e)' : 'var(--gold-500, #d99a2b)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 120 }}>
      <div style={{ flex: 1, minWidth: 60, height: 7, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${fill}%`, height: '100%', background: col, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{pct}%</span>
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem 1rem', minWidth: 150 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--green-700, #155e34)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  );
}

function InfoGrid({ icon: Icon, title, entries }) {
  const rows = Object.entries(entries || {}).filter(([, v]) => v != null && v !== '');
  if (!rows.length) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
        <Icon size={16} style={{ color: 'var(--green-700, #155e34)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem' }}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.1rem 1.5rem', padding: '0.9rem 1.1rem' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{k}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-1)', fontWeight: 600, textAlign: 'right' }}>{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectDashboard({ user }) {
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);
  const { code } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});   // indicator idx -> history open
  const [updateFor, setUpdateFor] = useState(null); // { idx, indicator }

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('v_project_profiles').select('*').eq('code', (code || '').toUpperCase()).maybeSingle();
    setProfile(error ? null : data);
    setLoading(false);
  }, [code]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="page-pad" style={{ color: 'var(--text-3)', padding: '3rem' }}>Loading…</div>;
  }
  if (!profile) {
    return (
      <div className="page-pad" style={{ maxWidth: 700 }}>
        <Link to="/files" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--green-700, #155e34)', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}><ArrowLeft size={15} /> Project Files</Link>
        <div className="card" style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-3)', padding: '3rem 1rem' }}>
          No dashboard found for project “{code}”.
        </div>
      </div>
    );
  }

  const d = profile.data || {};
  const fin = d.finance || {};
  const indicators = Array.isArray(d.indicators) ? d.indicators : [];
  const measurable = indicators.map(progressPct).filter(p => p != null);
  const avgProgress = measurable.length ? Math.round(measurable.reduce((a, b) => a + b, 0) / measurable.length) : null;

  return (
    <div style={{ maxWidth: 1120 }} className="animate-fade-up page-pad">
      <Link to="/files" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--green-700, #155e34)', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', marginBottom: '0.9rem' }}>
        <ArrowLeft size={15} /> Project Files
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <GaugeCircle size={24} style={{ color: 'var(--green-700, #155e34)', marginTop: '0.15rem' }} />
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)', margin: 0 }}>
            {profile.name} {profile.acronym && <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>· {profile.acronym}</span>}
          </h1>
          {d.official_title && d.official_title !== profile.name && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: '0.15rem' }}>{d.official_title}</div>
          )}
        </div>
      </div>
      {d.objective && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.55, margin: '0.5rem 0 0.35rem', maxWidth: 900 }}>{d.objective}</p>
      )}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '1.25rem' }}>
        {d.source_document && <>Source: {d.source_document}</>}{d.period && <> · {d.period}</>}
      </div>

      {/* Finance + highlight KPI tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {avgProgress != null && <StatTile label="Avg progress to end target" value={`${avgProgress}%`} sub={`${measurable.length} measured indicators`} />}
        {fin.gef_grant != null && <StatTile label="GEF Grant" value={fmtUSD(fin.gef_grant)} />}
        {fin.cofinancing != null && <StatTile label="Co-financing" value={fmtUSD(fin.cofinancing)} />}
        {fin.disbursement != null && <StatTile label="Disbursement" value={fmtUSD(fin.disbursement)} sub={fin.as_of ? `as of ${fin.as_of}` : undefined} />}
        {fin.delivery_vs_approved_pct != null && <StatTile label="Delivery (of budget)" value={`${fin.delivery_vs_approved_pct}%`} sub={fin.delivery_vs_expected_pct != null ? `${fin.delivery_vs_expected_pct}% of expected` : undefined} />}
        {d.ratings?.['Overall risk rating'] && <StatTile label="Risk rating" value={d.ratings['Overall risk rating']} />}
        {Object.entries(d.highlights || {}).map(([k, v]) => <StatTile key={k} label={k} value={v} />)}
      </div>

      {/* Development Objective Progress table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>Development Objective Progress</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginLeft: '0.25rem' }}>measured against the end-of-project target</span>
        </div>
        {indicators.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>No indicators recorded.</div>
        ) : (
          <div style={{ overflowX: 'auto' }} className="scrollbar-thin">
            <table className="data-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Indicator</th>
                  <th style={{ textAlign: 'center' }}>Baseline</th>
                  <th style={{ textAlign: 'center' }}>Mid-term</th>
                  <th style={{ textAlign: 'center' }}>End target</th>
                  <th style={{ textAlign: 'center' }}>Current</th>
                  <th>Progress to end</th>
                  <th>Status</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {indicators.map((it, i) => {
                  const hist = Array.isArray(it.history) ? it.history : [];
                  const open = !!expanded[i];
                  const cur = currentVal(it);
                  return (
                    <Fragment key={i}>
                      <tr>
                        <td style={{ textAlign: 'center' }}>
                          {hist.length > 0 && (
                            <button onClick={() => setExpanded(e => ({ ...e, [i]: !open }))} title="History"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'inline-flex' }}>
                              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                          )}
                        </td>
                        <td style={{ maxWidth: 300 }}>
                          {it.code && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-3)' }}>{it.code}</div>}
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-1)', fontWeight: 500 }}>{it.description}</div>
                        </td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.baseline ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.midterm ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.end ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{cur != null ? fmtNum(cur) : '—'}{it.unit && cur != null ? '' : ''}</td>
                        <td style={{ minWidth: 140 }}><ProgressBar pct={progressPct(it)} /></td>
                        <td><StatusBadge s={it.status} /></td>
                        {canEdit && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button onClick={() => setUpdateFor({ idx: i, indicator: it })} title="Record update"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.7rem', fontWeight: 700 }}>
                              <Plus size={12} /> Update
                            </button>
                          </td>
                        )}
                      </tr>
                      {open && hist.length > 0 && (
                        <tr>
                          <td></td>
                          <td colSpan={canEdit ? 8 : 7} style={{ background: 'var(--green-50, #f3f7f4)' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0.2rem 0 0.4rem' }}>Reported levels over time</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.3rem' }}>
                              {hist.map((h, hi) => (
                                <div key={hi} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', padding: '0.4rem 0.6rem', minWidth: 120 }}>
                                  <div style={{ fontSize: '0.64rem', color: 'var(--text-3)' }}>{h.period}{hi === hist.length - 1 ? ' · current' : hi === 0 ? '' : ''}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--green-700, #155e34)' }}>{fmtNum(h.value)}{it.unit === '%' ? '%' : ''}</div>
                                  {h.note && <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', maxWidth: 220 }}>{h.note}</div>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info grids */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <InfoGrid icon={Building2} title="Basic data" entries={d.basic} />
        <InfoGrid icon={CalendarDays} title="Key dates" entries={d.dates} />
        <InfoGrid icon={ShieldCheck} title="Ratings" entries={d.ratings} />
        <InfoGrid icon={Wallet} title="Finance" entries={{
          'GEF Grant': fin.gef_grant != null ? fmtUSD(fin.gef_grant) : null,
          'Co-financing': fin.cofinancing != null ? fmtUSD(fin.cofinancing) : null,
          'PPG': fin.ppg != null ? fmtUSD(fin.ppg) : null,
          'Cumulative disbursement': fin.disbursement != null ? fmtUSD(fin.disbursement) : null,
          'Delivery vs approved budget': fin.delivery_vs_approved_pct != null ? `${fin.delivery_vs_approved_pct}%` : null,
          'Delivery vs expected': fin.delivery_vs_expected_pct != null ? `${fin.delivery_vs_expected_pct}%` : null,
        }} />
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '1rem' }}>
        Last updated {new Date(profile.updated_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
        {profile.updated_by && ` · ${profile.updated_by}`}
        {' · '}Data is stored in the portal and persists even if the source document is deleted.
      </div>

      {updateFor && (
        <RecordUpdateModal profile={profile} updateFor={updateFor} onClose={() => setUpdateFor(null)} onSaved={() => { setUpdateFor(null); load(); }} />
      )}
    </div>
  );
}

/* ── Record a new indicator measurement ──────────────────────────────────── */
function RecordUpdateModal({ profile, updateFor, onClose, onSaved }) {
  const it = updateFor.indicator;
  const [period, setPeriod] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const end = it.end_val != null ? Number(it.end_val) : null;
  const previewPct = (value !== '' && end) ? Math.round((Number(value) / end) * 100) : null;

  const save = async (e) => {
    e.preventDefault();
    if (!period.trim()) { toast.error('Enter the reporting period (e.g. 30 Jun 2027).'); return; }
    if (value === '' || Number.isNaN(Number(value))) { toast.error('Enter the current level as a number.'); return; }
    setSaving(true);
    try {
      const data = JSON.parse(JSON.stringify(profile.data || {}));
      const inds = Array.isArray(data.indicators) ? data.indicators : [];
      const target = inds[updateFor.idx];
      if (!target) { toast.error('Indicator not found.'); setSaving(false); return; }
      target.history = Array.isArray(target.history) ? target.history : [];
      target.history.push({ period: period.trim(), value: Number(value), note: note.trim() || null });
      target.current_val = Number(value);
      target.current = note.trim() || `${period.trim()}: ${Number(value).toLocaleString('en-US')}`;
      if (target.end_val) target.progress_pct = Math.round((Number(value) / Number(target.end_val)) * 100);
      const res = await supabase.rpc('upsert_project_profile', {
        p_code: profile.code, p_name: profile.name, p_acronym: profile.acronym, p_data: data,
      });
      if (res.error) { toast.error(res.error.message || 'Could not save update.'); setSaving(false); return; }
      toast.success('Update recorded.');
      onSaved();
    } catch (err) {
      toast.error('Could not save update.'); setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(18,13,10,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '3rem 1rem' }} onClick={() => !saving && onClose()}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="card" style={{ width: '100%', maxWidth: 460, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem' }}>Record update</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>{it.code ? `${it.code} — ` : ''}{it.description}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Reporting period *</label>
              <input className="field-input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. 30 Jun 2027" disabled={saving} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Current level *{it.unit ? ` (${it.unit})` : ''}</label>
              <input className="field-input" type="number" step="any" value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 12" disabled={saving} />
            </div>
          </div>
          <div>
            <label className="field-label">Note</label>
            <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Brief description of this update" disabled={saving} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', background: 'var(--green-50, #f3f7f4)', borderRadius: 8, padding: '0.55rem 0.7rem' }}>
            End-of-project target: <strong>{it.end ?? '—'}</strong>
            {previewPct != null && <> · this update = <strong>{previewPct}%</strong> of the end target</>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Save update'}
          </button>
        </div>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
