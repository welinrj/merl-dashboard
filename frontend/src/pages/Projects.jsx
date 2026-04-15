import { useState } from 'react';
// NOTE: `projects` is now passed as a prop from App.jsx (shared state).
// Remove the old `import { PROJECTS } from '../mockData';` line.

const pct = (a, b) => b ? Math.min(100, Math.round((a / b) * 100)) : 0;

const STATUS_CHIP = {
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  suspended: 'bg-red-100 text-red-700',
};

const TRAFFIC_COLOR = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

function ProgressBar({ value, total, color }) {
  const p = pct(value, total);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color || '#10b981' }} />
    </div>
  );
}

function RBMSection({ rbm }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900">
        <span>{open ? '▾' : '▸'}</span> Results Chain (RBM)
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-3 border-l-2 border-emerald-200">
          <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Goal</div>
          <div className="text-sm text-gray-700 mb-2">{rbm.goal}</div>
          {rbm.outcomes.map(out => (
            <div key={out.id} className="space-y-2">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Outcome</div>
              <div className="text-sm font-medium text-gray-700">{out.text}</div>
              {out.outputs.map(op => (
                <div key={op.id} className="pl-3 border-l border-gray-200 space-y-1.5">
                  <div className="text-xs text-gray-400 uppercase font-bold">Output</div>
                  <div className="text-sm text-gray-600">{op.text}</div>
                  {op.activities.map(act => (
                    <div key={act.id} className="pl-3 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${act.status === 'completed' ? 'bg-green-500' : act.status === 'in_progress' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-600 flex-1">{act.text}</span>
                      <span className="text-xs font-semibold text-gray-500">{act.pct}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }) {
  const [expanded, setExpanded] = useState(false);
  const budgetPct = pct(project.spent_vuv, project.budget_vuv);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
      {/* Color bar */}
      <div className="h-1.5" style={{ background: project.category_color }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: project.category_color }}>
                {project.category}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CHIP[project.status] || 'bg-gray-100 text-gray-600'}`}>
                {project.status}
              </span>
            </div>
            <h3 className="font-bold text-gray-800 text-base leading-tight">{project.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{project.code}</p>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-xs text-emerald-600 border border-emerald-200 rounded-lg px-3 py-1 hover:bg-emerald-50 transition">
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>

        <p className="text-sm text-gray-500 line-clamp-2 mb-4">{project.description}</p>

        {/* Budget */}
        <div className="space-y-1 mb-4">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Budget utilisation</span>
            <span className="font-semibold text-gray-700">{budgetPct}%</span>
          </div>
          <ProgressBar value={project.spent_vuv} total={project.budget_vuv} color={project.category_color} />
          <div className="flex justify-between text-xs text-gray-400">
            <span>VUV {(project.spent_vuv / 1e6).toFixed(1)}M spent</span>
            <span>VUV {(project.budget_vuv / 1e6).toFixed(1)}M total</span>
          </div>
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-3 gap-2">
          {project.indicators.map(ind => {
            const p = pct(ind.current, ind.target);
            return (
              <div key={ind.id} className="bg-gray-50 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 truncate">{ind.code.split('-').slice(-1)[0]}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: TRAFFIC_COLOR[ind.traffic] }} />
                </div>
                <div className="text-sm font-bold text-gray-700">{p}%</div>
                <div className="text-xs text-gray-400 truncate">{ind.name}</div>
              </div>
            );
          })}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-gray-400 block">Lead Agency</span>
                <span className="font-medium text-gray-700">{project.lead_agency}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Provinces</span>
                <span className="font-medium text-gray-700">{project.provinces.join(', ')}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Start Date</span>
                <span className="font-medium text-gray-700">{project.start_date}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">End Date</span>
                <span className="font-medium text-gray-700">{project.end_date}</span>
              </div>
            </div>

            {/* Full indicators table */}
            <div>
              <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Indicators Detail</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-1 text-gray-400 font-semibold pr-3">Indicator</th>
                    <th className="pb-1 text-gray-400 font-semibold pr-3 text-right">Baseline</th>
                    <th className="pb-1 text-gray-400 font-semibold pr-3 text-right">Current</th>
                    <th className="pb-1 text-gray-400 font-semibold pr-3 text-right">Target</th>
                    <th className="pb-1 text-gray-400 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {project.indicators.map(ind => (
                    <tr key={ind.id}>
                      <td className="py-1.5 pr-3 font-medium text-gray-700">{ind.name}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{ind.baseline}</td>
                      <td className="py-1.5 pr-3 text-right font-bold text-gray-700">{ind.current}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{ind.target}</td>
                      <td className="py-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: TRAFFIC_COLOR[ind.traffic] }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <RBMSection rbm={project.rbm} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// `projects` and `setProjects` are passed down from App.jsx via shared state.
export default function Projects({ user, projects }) {
  const [filter, setFilter] = useState('All');
  const categories = ['All', ...new Set(projects.map(p => p.category))];
  const visible = filter === 'All' ? projects : projects.filter(p => p.category === filter);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">L&amp;D Fund Programme Components</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Vanuatu Loss &amp; Damage Fund — {projects.length} programme component{projects.length !== 1 ? 's' : ''} monitored under this MERL system
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${filter === cat ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Projects shown', value: visible.length },
          { label: 'Total budget', value: 'VUV ' + Math.round(visible.reduce((s, p) => s + p.budget_vuv, 0) / 1e6) + 'M' },
          { label: 'Total spent',   value: 'VUV ' + Math.round(visible.reduce((s, p) => s + p.spent_vuv,  0) / 1e6) + 'M' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-green-100 px-4 py-3">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className="text-xl font-bold text-gray-800">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visible.map(p => <ProjectCard key={p.id} project={p} />)}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No projects match the selected filter.
        </div>
      )}
    </div>
  );
}
