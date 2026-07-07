import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import { supabase } from '../supabaseClient';

/* ── theme ─────────────────────────────────────────────────────────────── */
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const TRAFFIC = { green: '#009543', amber: '#c97b00', red: '#d21034' };
const TRAFFIC_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' };

const DOMAIN_META = {
  governance: { label: 'Governance', short: 'GOV', color: '#009543' },
  financial:  { label: 'Financial',  short: 'FIN', color: '#c99700' },
  community:  { label: 'Community',  short: 'COM', color: '#2563eb' },
  events:     { label: 'L&D Events', short: 'EVT', color: '#d21034' },
  learning:   { label: 'Learning',   short: 'LRN', color: '#7c3aed' },
};
const DOMAINS = Object.keys(DOMAIN_META);

const EVENT_COLORS = {
  cyclone: '#d21034', flood: '#2563eb', drought: '#c99700',
  sea_level_rise: '#0891b2', acidification: '#7c3aed', other: '#64748b',
};
const EVENT_LABEL = {
  cyclone: 'Cyclone', flood: 'Flood', drought: 'Drought',
  sea_level_rise: 'Sea-level rise', acidification: 'Acidification', other: 'Other',
};

function qLabel(dateStr) {
  const d = new Date(dateStr);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}
function trafficFor(baseline, current, target) {
  const b = Number(baseline ?? 0), t = Number(target ?? 0);
  const c = current == null ? b : Number(current);
  if (t === b) return 'green';
  const p = (c - b) / (t - b);
  if (p >= 0.7) return 'green';
  if (p >= 0.35) return 'amber';
  return 'red';
}

const ChartTooltip = ({ active, payload, label, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.875rem', boxShadow: 'var(--shadow-md)', fontSize: '0.8125rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.3rem' }}>{label}</div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-3)', marginBottom: '0.15rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || p.fill }} />
          {p.name}: <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
};

const fmtM = n => `${(Number(n || 0) / 1e6).toFixed(1)}M`;

export default function Analysis() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [trends, budget, status, events, engage] = await Promise.all([
        supabase.from('v_indicator_trends').select('code,name,domain,value,target_value,reporting_period,verified').eq('verified', true).order('reporting_period'),
        supabase.from('v_domain_budget').select('domain,budget_vuv,spent_vuv'),
        supabase.from('v_indicator_status').select('code,name,domain,baseline_value,target_value,current_value').order('code'),
        supabase.from('v_ld_events').select('event_name,event_type,onset_type,lat,lng,economic_loss_vuv,provinces_affected'),
        supabase.from('v_engagement_stats').select('*'),
      ]);
      if (cancelled) return;
      const firstErr = trends.error || budget.error || status.error || events.error || engage.error;
      if (firstErr) { setError(firstErr.message); return; }
      setData({
        trends: trends.data ?? [],
        budget: budget.data ?? [],
        status: status.data ?? [],
        events: events.data ?? [],
        engage: engage.data ?? [],
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const trendData = useMemo(() => {
    if (!data) return [];
    const byPeriod = {};
    for (const t of data.trends) {
      const tgt = Number(t.target_value);
      if (!tgt) continue;
      (byPeriod[t.reporting_period] ??= {});
      (byPeriod[t.reporting_period][t.domain] ??= { sum: 0, n: 0 });
      const v = Math.min(100, Math.max(0, (Number(t.value) / tgt) * 100));
      byPeriod[t.reporting_period][t.domain].sum += v;
      byPeriod[t.reporting_period][t.domain].n += 1;
    }
    return Object.keys(byPeriod).sort().map(k => {
      const row = { period: qLabel(k) };
      for (const d of DOMAINS) {
        const c = byPeriod[k][d];
        row[d] = c ? Math.round(c.sum / c.n) : null;
      }
      return row;
    });
  }, [data]);

  const budgetData = useMemo(() =>
    (data?.budget ?? []).map(b => ({
      name: DOMAIN_META[b.domain]?.short ?? b.domain,
      Budget: Math.round(Number(b.budget_vuv || 0) / 1e6),
      Spent: Math.round(Number(b.spent_vuv || 0) / 1e6),
    })), [data]);

  const indicators = useMemo(() =>
    (data?.status ?? []).map(s => {
      const current = s.current_value == null ? Number(s.baseline_value ?? 0) : Number(s.current_value);
      return {
        code: s.code, name: s.name, domain: s.domain,
        current, target: Number(s.target_value ?? 0),
        traffic: trafficFor(s.baseline_value, s.current_value, s.target_value),
      };
    }), [data]);

  const engageData = useMemo(() =>
    (data?.engage ?? []).map(e => ({
      name: e.province,
      Female: Number(e.female_participants || 0),
      Male: Number(e.male_participants || 0),
    })), [data]);

  const visibleInds = domainFilter === 'All' ? indicators : indicators.filter(i => i.domain === domainFilter);
  const domainTabs = ['All', ...DOMAINS];

  if (error) {
    return (
      <div style={{ padding: '2rem 2.5rem' }}>
        <div className="card" style={{ borderLeft: '3px solid var(--red-600)' }}>
          <div className="section-label" style={{ color: 'var(--red-600)' }}>Could not load analysis data</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: '2rem 2.5rem', color: 'var(--text-3)' }}>Loading analysis…</div>;
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1400 }} className="animate-fade-up">
      <div style={{ marginBottom: '1.75rem' }}>
        <div className="section-label" style={{ marginBottom: '0.375rem' }}>Analytics</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
          Analysis &amp; GIS
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
          Live cross-domain trend analysis, budget visualisation, GEDSI reach, and loss &amp; damage event mapping.
        </p>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Indicator Achievement by Domain (% of target)</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix="%" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {DOMAINS.map(d => (
                <Line key={d} type="monotone" dataKey={d} name={DOMAIN_META[d].label}
                  stroke={DOMAIN_META[d].color} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Budget vs Expenditure by Domain (VUV M)</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={budgetData} barGap={4} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix="M" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Budget" fill="var(--green-200)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Spent" fill="var(--green-600)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Indicator progress */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div className="section-label" style={{ marginBottom: '0.25rem' }}>Indicator Progress</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {visibleInds.length} indicator{visibleInds.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {domainTabs.map(c => (
              <button key={c} onClick={() => setDomainFilter(c)} style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, border: '1.5px solid',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
                background: domainFilter === c ? 'var(--green-800)' : 'var(--white)',
                color: domainFilter === c ? '#fff' : 'var(--text-2)',
                borderColor: domainFilter === c ? 'var(--green-800)' : 'var(--border)',
                transition: 'all 0.12s',
              }}>{c === 'All' ? 'All' : DOMAIN_META[c].short}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {visibleInds.map(ind => {
            const p = pct(ind.current, ind.target);
            return (
              <div key={ind.code} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-1)', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: '0.6875rem', marginRight: '0.4rem' }}>{ind.code}</span>
                    {ind.name}
                  </div>
                  <div style={{ height: 5, background: 'var(--cream)', borderRadius: 9999, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${p}%`, height: '100%', background: TRAFFIC[ind.traffic], borderRadius: 9999 }} />
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                  {ind.current}/{ind.target}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, color: TRAFFIC[ind.traffic], minWidth: 36, textAlign: 'right' }}>
                  {p}%
                </div>
              </div>
            );
          })}
          {visibleInds.length === 0 && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>No indicators in this domain yet.</div>
          )}
        </div>
      </div>

      {/* GEDSI engagement by province */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-label" style={{ marginBottom: '1rem' }}>Community Engagement by Province — Gender Disaggregation (GEDSI)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={engageData} barGap={2} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Female" stackId="a" fill="var(--red-500)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Male" stackId="a" fill="var(--green-600)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* GIS Map — L&D events */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: '0.25rem' }}>Geographic Distribution</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-1)' }}>
            Documented Loss &amp; Damage Events — Vanuatu
          </div>
        </div>
        <div style={{ height: 440 }}>
          <MapContainer center={[-16.5, 167.9]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {data.events.map((e, i) => {
              const color = EVENT_COLORS[e.event_type] ?? EVENT_COLORS.other;
              const loss = Number(e.economic_loss_vuv || 0);
              const radius = 8 + Math.min(16, Math.log10(Math.max(loss, 1)) * 1.6);
              return (
                <CircleMarker key={i} center={[e.lat, e.lng]} radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.65, weight: 2 }}>
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-ui)', minWidth: 200, padding: '0.25rem' }}>
                      <div style={{ fontWeight: 700, color, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
                        {EVENT_LABEL[e.event_type] ?? e.event_type} · {e.onset_type === 'slow_onset' ? 'Slow onset' : 'Extreme'}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.375rem', fontSize: '0.875rem', lineHeight: 1.3 }}>{e.event_name}</div>
                      {loss > 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Economic loss: VUV {fmtM(loss)}</div>}
                      {e.provinces_affected?.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{e.provinces_affected.join(', ')}</div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <div style={{ padding: '0.875rem 1.5rem', background: 'var(--cream)', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {Object.keys(EVENT_LABEL).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: EVENT_COLORS[k] }} />
              {EVENT_LABEL[k]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
