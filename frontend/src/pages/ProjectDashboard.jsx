// Per-project KPI dashboard. Renders a project's profile (basic data, key
// dates, finance, ratings, highlights and Development Objective Progress
// indicators) from merl.project_profiles. Each registered project gets its own
// page at /project/:code, so new projects appear automatically once a profile
// is added.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, GaugeCircle, Building2, CalendarDays, Wallet, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';

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

function StatusBadge({ s }) {
  const m = STATUS[s] || STATUS.not_started;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: m.bg, color: m.txt, borderRadius: 9999, padding: '0.12rem 0.5rem', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.col }} />{m.label}
    </span>
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

export default function ProjectDashboard() {
  const { code } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('v_project_profiles').select('*').eq('code', (code || '').toUpperCase()).maybeSingle();
      if (cancelled) return;
      setProfile(error ? null : data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

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
        </div>
        {indicators.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>No indicators recorded.</div>
        ) : (
          <div style={{ overflowX: 'auto' }} className="scrollbar-thin">
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th style={{ textAlign: 'center' }}>Baseline</th>
                  <th style={{ textAlign: 'center' }}>Mid-term target</th>
                  <th style={{ textAlign: 'center' }}>End target</th>
                  <th>Current level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map((it, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 300 }}>
                      {it.code && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-3)' }}>{it.code}</div>}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-1)', fontWeight: 500 }}>{it.description}</div>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.baseline ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.midterm ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{it.end ?? '—'}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-2)', maxWidth: 280 }}>{it.current ?? '—'}</td>
                    <td><StatusBadge s={it.status} /></td>
                  </tr>
                ))}
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
      </div>
    </div>
  );
}
