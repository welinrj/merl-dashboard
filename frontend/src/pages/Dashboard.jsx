import { useEffect, useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';
import { supabase } from '../supabaseClient';
import { FolderKanban, Target, Wallet, AlertTriangle, ArrowRight, ArrowUpRight } from 'lucide-react';

/* ── helpers ────────────────────────────────────────────────────────────── */
const pct  = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmtM = n => (n / 1e6).toFixed(1) + 'M';

const TRAFFIC_LABEL = { green: 'On Track', amber: 'At Risk', red: 'Off Track' };
const TRAFFIC_DOT   = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
const TRAFFIC_CHIP  = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-700',
};
const TRAFFIC_BAR = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };

const DOMAIN_META = {
  governance: { label: 'Governance', short: 'GOV' },
  financial:  { label: 'Financial',  short: 'FIN' },
  community:  { label: 'Community',  short: 'COM' },
  events:     { label: 'L&D Events', short: 'EVT' },
  learning:   { label: 'Learning',   short: 'LRN' },
};

// Traffic light from progress toward target (handles decreasing targets).
function trafficFor(baseline, current, target) {
  const b = Number(baseline ?? 0), t = Number(target ?? 0);
  const c = current == null ? b : Number(current);
  if (t === b) return 'green';
  const p = (c - b) / (t - b);
  if (p >= 0.7) return 'green';
  if (p >= 0.35) return 'amber';
  return 'red';
}

function qLabel(dateStr) {
  const d = new Date(dateStr);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/* ── live data (v_indicator_status / v_domain_budget / v_indicator_trends) ── */
function normaliseLive(indicatorRows, budgetRows) {
  const indicators = indicatorRows.map(r => {
    const meta = DOMAIN_META[r.domain] ?? { label: r.domain };
    const current = r.current_value == null ? Number(r.baseline_value ?? 0) : Number(r.current_value);
    return {
      id: r.id, code: r.code, name: r.name,
      baseline: Number(r.baseline_value ?? 0),
      current,
      target: Number(r.target_value ?? 0),
      traffic: trafficFor(r.baseline_value, r.current_value, r.target_value),
      category: meta.label,
    };
  });
  const green = indicators.filter(i => i.traffic === 'green').length;
  const amber = indicators.filter(i => i.traffic === 'amber').length;
  const red   = indicators.filter(i => i.traffic === 'red').length;
  const summary = {
    total_indicators: indicators.length,
    indicators_green: green,
    indicators_amber: amber,
    indicators_red:   red,
    total_budget_vuv: budgetRows.reduce((s, b) => s + Number(b.budget_vuv ?? 0), 0),
    total_spent_vuv:  budgetRows.reduce((s, b) => s + Number(b.spent_vuv ?? 0), 0),
    active_projects:  budgetRows.filter(b => Number(b.activities_active ?? 0) > 0).length,
    total_projects:   budgetRows.length,
  };
  return { indicators, summary };
}

function normaliseMock() {
  const indicators = ALL_INDICATORS.map(ind => {
    const proj = PROJECTS.find(pr => pr.code === ind.project_code);
    return { ...ind, category: proj?.name?.split(' ')[1] ?? '—' };
  });
  return { indicators, summary: DASHBOARD_SUMMARY };
}

// Demo trend series shown when live trends are unavailable (offline preview).
const MOCK_TREND = [
  { period: 'Q1 2025', pct: 18 }, { period: 'Q2 2025', pct: 26 },
  { period: 'Q3 2025', pct: 34 }, { period: 'Q4 2025', pct: 41 },
  { period: 'Q1 2026', pct: 49 }, { period: 'Q2 2026', pct: 57 },
];

/* ── small pieces ───────────────────────────────────────────────────────── */
function KpiCell({ label, value, chip, chipTone = 'indigo', icon: Icon, last }) {
  const tones = {
    indigo:  'bg-green-50 text-green-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    red:     'bg-red-50 text-red-700',
  };
  return (
    <div className={`p-5 border-b xl:border-b-0 border-gray-200 ${last ? '' : 'sm:border-r'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {Icon && <Icon size={16} className="text-gray-300" />}
      </div>
      <div className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">{value}</div>
      {chip && (
        <span className={`inline-flex items-center gap-1 mt-3 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${tones[chipTone]}`}>
          {chip}
        </span>
      )}
    </div>
  );
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 mb-0.5">{label}</div>
      <div className="text-gray-500">
        Achievement: <span className="font-semibold text-gray-900">{payload[0].value}%</span>
      </div>
    </div>
  );
};

/* ══ Dashboard (Efferd dashboard-1 style: welcome header + KPI stats +
      area chart + records table in a bordered three-column grid) ═══════════ */
export default function Dashboard({ user }) {
  const [live, setLive]     = useState(null);
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ind, bud, trd] = await Promise.all([
        supabase.from('v_indicator_status').select('*').order('code'),
        supabase.from('v_domain_budget').select('*').order('domain'),
        supabase.from('v_indicator_trends')
          .select('value,target_value,reporting_period,verified')
          .eq('verified', true).order('reporting_period'),
      ]);
      if (cancelled || ind.error || bud.error || !ind.data?.length) return;
      setLive(normaliseLive(ind.data, bud.data ?? []));
      if (!trd.error && trd.data?.length) setTrends(trd.data);
    })();
    return () => { cancelled = true; };
  }, []);

  const { indicators, summary: S } = live ?? normaliseMock();
  const spentPct  = pct(S.total_spent_vuv, S.total_budget_vuv);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const trendData = useMemo(() => {
    if (!trends) return MOCK_TREND;
    const byPeriod = {};
    for (const t of trends) {
      const tgt = Number(t.target_value);
      if (!tgt) continue;
      (byPeriod[t.reporting_period] ??= { sum: 0, n: 0 });
      byPeriod[t.reporting_period].sum += Math.min(100, Math.max(0, (Number(t.value) / tgt) * 100));
      byPeriod[t.reporting_period].n += 1;
    }
    const rows = Object.keys(byPeriod).sort().map(k => ({
      period: qLabel(k),
      pct: Math.round(byPeriod[k].sum / byPeriod[k].n),
    }));
    return rows.length >= 2 ? rows : MOCK_TREND;
  }, [trends]);

  const statusRows = [
    { key: 'green', count: S.indicators_green },
    { key: 'amber', count: S.indicators_amber },
    { key: 'red',   count: S.indicators_red },
  ];

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page-pad max-w-[1400px] animate-fade-up">

      {/* ── Welcome header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back, {firstName}!</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vanuatu Loss &amp; Damage Fund · MERL overview · {live ? 'Live data' : 'Sample data (offline)'}
          </p>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          {today}
        </span>
      </div>

      {/* ── Bordered grid ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        {/* KPI stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 xl:border-b border-gray-200">
          <KpiCell
            label="Active Components" value={S.active_projects} icon={FolderKanban}
            chip={<><ArrowUpRight size={11} /> of {S.total_projects} total</>} chipTone="indigo"
          />
          <KpiCell
            label="Total Indicators" value={S.total_indicators} icon={Target}
            chip={`${S.indicators_green} on track`} chipTone="emerald"
          />
          <KpiCell
            label="Budget (VUV)" value={fmtM(S.total_budget_vuv)} icon={Wallet}
            chip={`${spentPct}% utilised`} chipTone="amber"
          />
          <KpiCell
            label="At Risk / Off Track" value={S.indicators_amber + S.indicators_red} icon={AlertTriangle}
            chip={`${S.indicators_amber} at risk · ${S.indicators_red} off track`}
            chipTone={S.indicators_red > 0 ? 'red' : 'amber'} last
          />
        </div>

        {/* Chart + status column */}
        <div className="grid lg:grid-cols-3 border-b border-gray-200">
          <div className="lg:col-span-2 p-5 border-b lg:border-b-0 lg:border-r border-gray-200">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Indicator Achievement</h2>
              <p className="text-xs text-gray-500 mt-0.5">Average progress toward targets across verified reports (%)</p>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="achv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#4f46e5" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="pct" stroke="#4f46e5" strokeWidth={2}
                  fill="url(#achv)" dot={{ r: 2.5, fill: '#4f46e5' }} activeDot={{ r: 4.5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-5 flex flex-col">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Indicator Status</h2>
            <div className="space-y-3">
              {statusRows.map(({ key, count }) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className={`w-2 h-2 rounded-full ${TRAFFIC_DOT[key]}`} />
                      {TRAFFIC_LABEL[key]}
                    </span>
                    <span className="font-semibold text-gray-900 tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${TRAFFIC_BAR[key]}`}
                      style={{ width: `${pct(count, S.total_indicators)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span className="font-semibold text-gray-900 text-sm">Budget Utilisation</span>
                <span className="font-semibold text-gray-900 tabular-nums">{spentPct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${spentPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-gray-400 mt-1.5 tabular-nums">
                <span>VUV {fmtM(S.total_spent_vuv)} spent</span>
                <span>VUV {fmtM(S.total_budget_vuv)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent indicators table */}
        <div>
          <div className="flex items-center justify-between p-5 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">All Indicators</h2>
              <p className="text-xs text-gray-500 mt-0.5">{indicators.length} indicators across {S.total_projects} programme components</p>
            </div>
            <NavLink to="/analysis" className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900">
              View Analysis <ArrowRight size={13} />
            </NavLink>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 font-semibold uppercase tracking-wide border-y border-gray-100 bg-gray-50/60">
                  <th className="py-2.5 px-5">Indicator</th>
                  <th className="py-2.5 pr-4">Domain</th>
                  <th className="py-2.5 pr-4 text-right">Baseline</th>
                  <th className="py-2.5 pr-4 text-right">Current</th>
                  <th className="py-2.5 pr-4 text-right">Target</th>
                  <th className="py-2.5 pr-4 text-right">Progress</th>
                  <th className="py-2.5 pr-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {indicators.map(ind => {
                  const p = pct(ind.current, ind.target);
                  return (
                    <tr key={ind.id} className="hover:bg-gray-50/70">
                      <td className="py-3 px-5">
                        <div className="font-medium text-gray-800">{ind.name}</div>
                        <div className="font-mono text-[11px] text-gray-400">{ind.code}</div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{ind.category}</td>
                      <td className="py-3 pr-4 text-right text-gray-400 tabular-nums">{ind.baseline}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-900 tabular-nums">{ind.current}</td>
                      <td className="py-3 pr-4 text-right text-gray-400 tabular-nums">{ind.target}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${TRAFFIC_BAR[ind.traffic]}`} style={{ width: `${p}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{p}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${TRAFFIC_CHIP[ind.traffic]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${TRAFFIC_DOT[ind.traffic]}`} />
                          {TRAFFIC_LABEL[ind.traffic]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
