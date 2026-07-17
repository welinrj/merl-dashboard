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
import { ArrowLeft, GaugeCircle, Building2, CalendarDays, Wallet, ShieldCheck, X, Plus, ChevronDown, ChevronRight, Loader2, Coins, Banknote, TrendingUp, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];

// A small, professional accent palette (teal-forward, matching the portal).
const ACCENTS = {
  teal:  { c: '#0e6e6e', bg: '#e3f0ef' },
  ocean: { c: '#2a6f97', bg: '#e4eef4' },
  gold:  { c: '#b9791a', bg: '#f7ecd6' },
  plum:  { c: '#7c5a8c', bg: '#efe8f3' },
  green: { c: '#1a8c4e', bg: '#dff0e6' },
  red:   { c: '#b3402f', bg: '#f6ded8' },
};
const HILITE_ACCENTS = [ACCENTS.green, ACCENTS.ocean, ACCENTS.gold, ACCENTS.plum];
const riskAccent = (r) => {
  const s = String(r || '').toLowerCase();
  if (s.includes('high')) return ACCENTS.red;
  if (s.includes('medium') || s.includes('moderate') || s.includes('substantial')) return ACCENTS.gold;
  return ACCENTS.green;
};

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

const barColor = (pct) => pct >= 100 ? '#1a8c4e' : pct >= 70 ? '#0e6e6e' : pct >= 40 ? '#e0a12a' : '#c86a3a';

function ProgressBar({ pct }) {
  if (pct == null) return <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>—</span>;
  const fill = Math.max(2, Math.min(pct, 100));
  const col = barColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 120 }}>
      <div style={{ flex: 1, minWidth: 60, height: 8, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${fill}%`, height: '100%', background: col, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: col, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{pct}%</span>
    </div>
  );
}

// Circular progress ring for the headline progress figure.
function ProgressRing({ pct, label, sub }) {
  const size = 96, stroke = 9, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(pct ?? 0, 100));
  const col = barColor(pct ?? 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', background: 'var(--white)', border: '1px solid var(--border)', borderLeft: '3px solid ' + col, borderRadius: 12, padding: '0.9rem 1.1rem', boxShadow: 'var(--shadow-sm)' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', fill: 'var(--text-1)' }}>{pct == null ? '—' : `${pct}%`}</text>
      </svg>
      <div>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', marginTop: '0.15rem', maxWidth: 150 }}>{sub}</div>}
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub, accent = ACCENTS.teal }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderLeft: '3px solid ' + accent.c, borderRadius: 12, padding: '0.85rem 1rem', minWidth: 170, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        {Icon && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: accent.bg, color: accent.c }}><Icon size={15} /></span>}
        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  );
}

function InfoGrid({ icon: Icon, title, entries, accent = ACCENTS.teal }) {
  const rows = Object.entries(entries || {}).filter(([, v]) => v != null && v !== '');
  if (!rows.length) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.7rem 1.1rem', borderBottom: '1px solid var(--border)', background: accent.bg }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: 'var(--white)', color: accent.c }}><Icon size={14} /></span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{title}</span>
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

      {/* Gradient header banner */}
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: '1.25rem', boxShadow: 'var(--shadow-md)', background: 'linear-gradient(135deg, var(--green-900) 0%, var(--green-700) 55%, var(--green-600) 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'radial-gradient(circle at 88% 12%, #ffffff 0, transparent 42%), radial-gradient(circle at 12% 92%, var(--gold-400) 0, transparent 45%)' }} />
        <div style={{ position: 'relative', padding: '1.5rem 1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <GaugeCircle size={22} style={{ color: 'var(--gold-400)' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', margin: 0, lineHeight: 1.15 }}>
              {profile.name}
            </h1>
            {profile.acronym && (
              <span style={{ background: 'var(--gold-500)', color: 'var(--ink)', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.03em', borderRadius: 9999, padding: '0.2rem 0.7rem' }}>{profile.acronym}</span>
            )}
          </div>
          {d.official_title && d.official_title !== profile.name && (
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.72)', marginBottom: '0.5rem' }}>{d.official_title}</div>
          )}
          {d.objective && (
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.55, margin: '0 0 0.5rem', maxWidth: 900 }}>{d.objective}</p>
          )}
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
            {d.source_document && <>Source: {d.source_document}</>}{d.period && <> · {d.period}</>}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'stretch' }}>
        {avgProgress != null && <ProgressRing pct={avgProgress} label="Avg progress to end target" sub={`${measurable.length} measured indicators`} />}
        {fin.gef_grant != null && <KpiTile icon={Wallet} accent={ACCENTS.teal} label="GEF Grant" value={fmtUSD(fin.gef_grant)} />}
        {fin.cofinancing != null && <KpiTile icon={Coins} accent={ACCENTS.ocean} label="Co-financing" value={fmtUSD(fin.cofinancing)} />}
        {fin.disbursement != null && <KpiTile icon={Banknote} accent={ACCENTS.gold} label="Disbursement" value={fmtUSD(fin.disbursement)} sub={fin.as_of ? `as of ${fin.as_of}` : undefined} />}
        {fin.delivery_vs_approved_pct != null && <KpiTile icon={TrendingUp} accent={ACCENTS.plum} label="Delivery (of budget)" value={`${fin.delivery_vs_approved_pct}%`} sub={fin.delivery_vs_expected_pct != null ? `${fin.delivery_vs_expected_pct}% of expected` : undefined} />}
        {d.ratings?.['Overall risk rating'] && <KpiTile icon={ShieldCheck} accent={riskAccent(d.ratings['Overall risk rating'])} label="Risk rating" value={d.ratings['Overall risk rating']} />}
        {Object.entries(d.highlights || {}).map(([k, v], i) => <KpiTile key={k} icon={Sparkles} accent={HILITE_ACCENTS[i % HILITE_ACCENTS.length]} label={k} value={v} />)}
      </div>

      {/* Development Objective Progress table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--border)', background: ACCENTS.teal.bg }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: 'var(--white)', color: ACCENTS.teal.c }}><TrendingUp size={14} /></span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-1)' }}>Development Objective Progress</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-2)', marginLeft: '0.25rem' }}>measured against the end-of-project target</span>
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
                      <tr style={i % 2 ? { background: 'var(--green-50, #eaf4f3)' } : undefined}>
                        <td style={{ textAlign: 'center' }}>
                          {(hist.length > 0 || it.remarks) && (
                            <button onClick={() => setExpanded(e => ({ ...e, [i]: !open }))} title="History & remarks"
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
                      {open && (hist.length > 0 || it.remarks) && (
                        <tr>
                          <td></td>
                          <td colSpan={canEdit ? 8 : 7} style={{ background: 'var(--green-50, #f3f7f4)' }}>
                            {hist.length > 0 && (
                              <>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0.2rem 0 0.4rem' }}>Reported levels over time</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.3rem' }}>
                                  {hist.map((h, hi) => (
                                    <div key={hi} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', padding: '0.4rem 0.6rem', minWidth: 120 }}>
                                      <div style={{ fontSize: '0.64rem', color: 'var(--text-3)' }}>{h.period}{hi === hist.length - 1 ? ' · current' : ''}</div>
                                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--green-700, #155e34)' }}>{fmtNum(h.value)}{it.unit === '%' ? '%' : ''}</div>
                                      {h.note && <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', maxWidth: 220 }}>{h.note}</div>}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            {it.remarks && (
                              <div style={{ marginTop: hist.length > 0 ? '0.6rem' : '0.2rem', paddingBottom: '0.3rem' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.3rem' }}>Remarks / reference</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.55, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.55rem 0.7rem', maxWidth: 780 }}>{it.remarks}</div>
                              </div>
                            )}
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
        <InfoGrid icon={Building2} title="Basic data" accent={ACCENTS.ocean} entries={d.basic} />
        <InfoGrid icon={CalendarDays} title="Key dates" accent={ACCENTS.plum} entries={d.dates} />
        <InfoGrid icon={ShieldCheck} title="Ratings" accent={ACCENTS.green} entries={d.ratings} />
        <InfoGrid icon={Wallet} title="Finance" accent={ACCENTS.gold} entries={{
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
  const [remarks, setRemarks] = useState(it.remarks || '');
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
      target.remarks = remarks.trim() || null;
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
          <div>
            <label className="field-label">Remarks / reference</label>
            <textarea className="field-input" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Progress comments and what remains to be done" disabled={saving} />
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
