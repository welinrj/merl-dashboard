import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';

const fmtVUV = n => `VUV ${new Intl.NumberFormat().format(n ?? 0)}`;
const pct    = (a, b) => b ? Math.round((a / b) * 100) : 0;

const TRAFFIC = {
  green: { bg: 'bg-green-100', text: 'text-green-700', dot: '#22c55e', label: '≥80% On Track' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#f59e0b', label: '50–79% At Risk' },
  red:   { bg: 'bg-red-100',   text: 'text-red-700',   dot: '#ef4444', label: '<50% Off Track' },
};

function KpiCard({ label, value, sub, color = 'green' }) {
  const colors = { green:'from-green-600 to-emerald-500', blue:'from-blue-600 to-blue-400', amber:'from-amber-500 to-amber-400', violet:'from-violet-600 to-violet-400' };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5 flex flex-col gap-2">
      <div className={`text-xs font-semibold uppercase tracking-wider bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>{label}</div>
      <div className="text-3xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function TrafficDot({ status }) {
  const t = TRAFFIC[status] || TRAFFIC.amber;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
    <span className="w-2 h-2 rounded-full inline-block" style={{ background: t.dot }} />
    {status === 'green' ? 'On Track' : status === 'amber' ? 'At Risk' : 'Off Track'}
  </span>;
}

export default function Dashboard({ user }) {
  const S = DASHBOARD_SUMMARY;
  const spentPct = pct(S.total_spent_vuv, S.total_budget_vuv);

  const budgetData = PROJECTS.map(p => ({
    name: p.code.split('-')[1],
    Budget: Math.round(p.budget_vuv / 1e6),
    Spent:  Math.round(p.spent_vuv  / 1e6),
  }));

  const pieSrc = [
    { name: 'On Track', value: S.indicators_green, color: '#22c55e' },
    { name: 'At Risk',  value: S.indicators_amber, color: '#f59e0b' },
    { name: 'Off Track',value: S.indicators_red,   color: '#ef4444' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">DoCC M&amp;E Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Department of Climate Change · Vanuatu · April 2026</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Projects" value={S.active_projects} sub={`of ${S.total_projects} total`} color="green" />
        <KpiCard label="Total Indicators" value={S.total_indicators} sub={`${S.indicators_green} on track`} color="blue" />
        <KpiCard label="Budget (VUV M)" value={(S.total_budget_vuv/1e6).toFixed(0)+'M'} sub={`${spentPct}% spent`} color="amber" />
        <KpiCard label="Datasets Uploaded" value={S.total_datasets} sub="processed records" color="violet" />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-green-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Budget vs Spent by Project (VUV M)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetData} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `VUV ${v}M`} />
              <Bar dataKey="Budget" fill="#d1fae5" radius={[4,4,0,0]} />
              <Bar dataKey="Spent"  fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Indicator traffic lights donut */}
        <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-2">Indicator Status</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieSrc} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                {pieSrc.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {pieSrc.map(e => (
              <div key={e.name} className="flex justify-between text-xs text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: e.color }} />{e.name}</span>
                <span className="font-semibold">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator table */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">All Indicators — Latest Status</h2>
          <NavLink to="/projects" className="text-sm text-emerald-600 hover:underline">View Projects →</NavLink>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 text-xs text-gray-400 font-semibold pr-4">Code</th>
                <th className="pb-2 text-xs text-gray-400 font-semibold pr-4">Indicator</th>
                <th className="pb-2 text-xs text-gray-400 font-semibold pr-4">Project</th>
                <th className="pb-2 text-xs text-gray-400 font-semibold pr-4 text-right">Progress</th>
                <th className="pb-2 text-xs text-gray-400 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ALL_INDICATORS.map(ind => {
                const progress = pct(ind.current, ind.target);
                return (
                  <tr key={ind.id} className="hover:bg-green-50/50">
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-400">{ind.code}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-700 max-w-xs truncate">{ind.name}</td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: ind.category_color }}>
                        {ind.category}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-gray-500">{ind.current}/{ind.target}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: TRAFFIC[ind.traffic]?.dot }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8">{progress}%</span>
                      </div>
                    </td>
                    <td className="py-2.5"><TrafficDot status={ind.traffic} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
