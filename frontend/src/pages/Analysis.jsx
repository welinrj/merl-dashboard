import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS } from '../mockData';
import 'leaflet/dist/leaflet.css';

const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;

// Quarterly trend data across all projects
const QUARTER_DATA = ['Q1 2025','Q2 2025','Q3 2025','Q4 2025','Q1 2026'].map((q, qi) => {
  const obj = { q };
  PROJECTS.forEach(p => {
    const d = p.quarterly[qi];
    if (d) obj[p.category] = d.actual;
  });
  return obj;
});

const PROJECT_COLORS = {
  'CC-ADAPT':  '#3b82f6',
  'CC-MITIG':  '#10b981',
  'CC-RESIL':  '#f59e0b',
  'CC-POLICY': '#8b5cf6',
  'CC-CAPBLD': '#ec4899',
  'CC-CROSS':  '#6366f1',
};

function BudgetChart() {
  const data = PROJECTS.map(p => ({
    name: p.category,
    Budget: Math.round(p.budget_vuv / 1e6),
    Spent:  Math.round(p.spent_vuv  / 1e6),
    color:  p.category_color,
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Budget vs Expenditure by Category (VUV M)</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => `VUV ${v}M`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Budget" fill="#d1fae5" radius={[4,4,0,0]} />
          <Bar dataKey="Spent"  fill="#10b981" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart() {
  const categories = Object.keys(PROJECT_COLORS);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Quarterly Output Delivery Trend</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={QUARTER_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
          <XAxis dataKey="q" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map(cat => (
            <Line key={cat} type="monotone" dataKey={cat} stroke={PROJECT_COLORS[cat]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function IndicatorProgress() {
  const [filter, setFilter] = useState('All');
  const cats = ['All', ...Object.keys(PROJECT_COLORS)];
  const visible = filter === 'All' ? ALL_INDICATORS : ALL_INDICATORS.filter(i => i.category === filter);

  const TRAFFIC_COLOR = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-800">Indicator Progress Analysis</h2>
        <div className="flex gap-1 flex-wrap">
          {cats.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`text-xs px-2 py-1 rounded-md border transition font-medium ${filter === c ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
              {c === 'All' ? 'All' : c.replace('CC-', '')}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {visible.map(ind => {
          const p = pct(ind.current, ind.target);
          return (
            <div key={ind.id}>
              <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                <span className="font-medium truncate max-w-xs">{ind.name}</span>
                <span className="ml-2 font-bold text-gray-700">{ind.current}/{ind.target} ({p}%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: TRAFFIC_COLOR[ind.traffic] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GISMap() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Project Locations — Vanuatu</h2>
      <div className="rounded-xl overflow-hidden" style={{ height: 380 }}>
        <MapContainer
          center={[-15.376706, 166.959158]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {PROJECTS.map(p => (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={12}
              pathOptions={{ color: p.category_color, fillColor: p.category_color, fillOpacity: 0.7, weight: 2 }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: p.category_color }}>{p.category}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Budget: VUV {(p.budget_vuv/1e6).toFixed(0)}M</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Lead: {p.lead_agency}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Provinces: {p.provinces.join(', ')}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {PROJECTS.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full" style={{ background: p.category_color }} />
            {p.category}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analysis({ user }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analysis &amp; GIS</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cross-project trends, budget analysis, and geographic visualisation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart />
        <BudgetChart />
      </div>

      <IndicatorProgress />
      <GISMap />
    </div>
  );
}
