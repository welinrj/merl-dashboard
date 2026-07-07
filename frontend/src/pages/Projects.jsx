import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const fmtM = n => (Number(n || 0) / 1e6).toFixed(1) + 'M';

const DOMAIN_META = {
  governance: { label: 'Governance', short: 'GOV', color: '#009543' },
  financial:  { label: 'Financial',  short: 'FIN', color: '#c99700' },
  community:  { label: 'Community',  short: 'COM', color: '#2563eb' },
  events:     { label: 'L&D Events', short: 'EVT', color: '#d21034' },
  learning:   { label: 'Learning',   short: 'LRN', color: '#7c3aed' },
};

const STATUS_CHIP = {
  completed:   'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-800',
  planned:     'bg-gray-100 text-gray-600',
  delayed:     'bg-red-100 text-red-700',
};
const STATUS_LABEL = { completed: 'Completed', in_progress: 'In progress', planned: 'Planned', delayed: 'Delayed' };

const MILESTONE_DOT = {
  completed: 'bg-green-500', in_progress: 'bg-yellow-400', pending: 'bg-gray-300', overdue: 'bg-red-500',
};
const TRAFFIC = { green: '#009543', amber: '#c99700', red: '#d21034' };

function trafficFor(baseline, current, target) {
  const b = Number(baseline ?? 0), t = Number(target ?? 0);
  const c = current == null ? b : Number(current);
  if (t === b) return 'green';
  const p = (c - b) / (t - b);
  if (p >= 0.7) return 'green';
  if (p >= 0.35) return 'amber';
  return 'red';
}

function Bar({ value, total, color }) {
  const p = pct(value, total);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color || '#009543' }} />
    </div>
  );
}

function ActivityCard({ a, milestones, indicators }) {
  const [open, setOpen] = useState(false);
  const meta = DOMAIN_META[a.domain] ?? { label: a.domain, short: a.domain, color: '#64748b' };
  const budgetPct = pct(a.spent_vuv, a.budget_vuv);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
      <div className="h-1.5" style={{ background: meta.color }} />
      <div className="p-5">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: meta.color }}>{meta.short}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[a.status] || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABEL[a.status] || a.status}
              </span>
              <span className="text-xs text-gray-400">Phase {a.phase}</span>
            </div>
            <h3 className="font-bold text-gray-800 text-base leading-tight">{a.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{a.code}</p>
          </div>
          <button onClick={() => setOpen(!open)}
            className="flex-shrink-0 text-xs text-green-700 border border-green-200 rounded-lg px-3 py-1 hover:bg-green-50 transition">
            {open ? 'Less' : 'Details'}
          </button>
        </div>

        <p className="text-sm text-gray-500 line-clamp-2 mb-4">{a.description}</p>

        <div className="space-y-1 mb-4">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Budget utilisation</span>
            <span className="font-semibold text-gray-700">{budgetPct}%</span>
          </div>
          <Bar value={a.spent_vuv} total={a.budget_vuv} color={meta.color} />
          <div className="flex justify-between text-xs text-gray-400">
            <span>VUV {fmtM(a.spent_vuv)} spent</span>
            <span>VUV {fmtM(a.budget_vuv)} total</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Milestones</span>
          <span className="font-semibold text-gray-600">{a.milestone_done}/{a.milestone_total} complete</span>
        </div>

        {open && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-gray-400 block">Lead officer</span><span className="font-medium text-gray-700">{a.lead_officer || '—'}</span></div>
              <div><span className="text-xs text-gray-400 block">Domain</span><span className="font-medium text-gray-700">{meta.label}</span></div>
              <div><span className="text-xs text-gray-400 block">Start date</span><span className="font-medium text-gray-700">{a.start_date || '—'}</span></div>
              <div><span className="text-xs text-gray-400 block">End date</span><span className="font-medium text-gray-700">{a.end_date || '—'}</span></div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Milestones</h4>
              {milestones.length === 0 ? (
                <div className="text-xs text-gray-400">No milestones recorded.</div>
              ) : (
                <div className="space-y-1.5">
                  {milestones.map(m => (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${MILESTONE_DOT[m.status] || 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-600 flex-1">{m.milestone_name}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{m.completed_date || m.due_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {indicators.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">{meta.label} indicators</h4>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-50">
                    {indicators.map(ind => (
                      <tr key={ind.code}>
                        <td className="py-1.5 pr-3 font-medium text-gray-700">
                          <span className="font-mono text-gray-400 mr-1.5">{ind.code}</span>{ind.name}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-bold text-gray-700">{ind.current}/{ind.target}</td>
                        <td className="py-1.5 w-4"><span className="w-2 h-2 rounded-full inline-block" style={{ background: TRAFFIC[ind.traffic] }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Projects() {
  const [activities, setActivities] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [acts, ms, inds] = await Promise.all([
        supabase.from('v_activities').select('*').order('code'),
        supabase.from('v_activity_milestones').select('*').order('due_date'),
        supabase.from('v_indicator_status').select('code,name,domain,baseline_value,target_value,current_value').order('code'),
      ]);
      if (cancelled) return;
      if (acts.error) { setError(acts.error.message); return; }
      setActivities(acts.data ?? []);
      setMilestones(ms.data ?? []);
      setIndicators((inds.data ?? []).map(s => ({
        code: s.code, name: s.name, domain: s.domain,
        current: s.current_value == null ? Number(s.baseline_value ?? 0) : Number(s.current_value),
        target: Number(s.target_value ?? 0),
        traffic: trafficFor(s.baseline_value, s.current_value, s.target_value),
      })));
    })();
    return () => { cancelled = true; };
  }, []);

  const milestonesByActivity = useMemo(() => {
    const map = {};
    for (const m of milestones) (map[m.activity_id] ??= []).push(m);
    return map;
  }, [milestones]);

  const indicatorsByDomain = useMemo(() => {
    const map = {};
    for (const i of indicators) (map[i.domain] ??= []).push(i);
    return map;
  }, [indicators]);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-sm font-bold text-red-700">Could not load components</div>
          <div className="text-sm text-gray-600 mt-1">{error}</div>
        </div>
      </div>
    );
  }
  if (!activities) return <div className="p-6 text-sm text-gray-400">Loading components…</div>;

  const domains = [...new Set(activities.map(a => a.domain))];
  const tabs = ['All', ...domains];
  const visible = filter === 'All' ? activities : activities.filter(a => a.domain === filter);
  const totalBudget = visible.reduce((s, a) => s + Number(a.budget_vuv || 0), 0);
  const totalSpent = visible.reduce((s, a) => s + Number(a.spent_vuv || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">L&amp;D Fund Programme Components</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Vanuatu Loss &amp; Damage Fund — {activities.length} work-plan {activities.length === 1 ? 'activity' : 'activities'} monitored under this MERL system
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              filter === t ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
            {t === 'All' ? 'All' : (DOMAIN_META[t]?.label ?? t)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Components shown', value: visible.length },
          { label: 'Total budget', value: 'VUV ' + fmtM(totalBudget) },
          { label: 'Total spent', value: 'VUV ' + fmtM(totalSpent) },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-green-100 px-4 py-3">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className="text-xl font-bold text-gray-800">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visible.map(a => (
          <ActivityCard key={a.id} a={a}
            milestones={milestonesByActivity[a.id] ?? []}
            indicators={indicatorsByDomain[a.domain] ?? []} />
        ))}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No components match the selected filter.</div>
      )}
    </div>
  );
}
