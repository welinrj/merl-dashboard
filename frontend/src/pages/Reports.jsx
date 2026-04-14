import { useState } from 'react';
import { PROJECTS, ALL_INDICATORS } from '../mockData';

const REPORT_TYPES = [
  {
    id: 'quarterly',
    icon: '📅',
    name: 'Quarterly Progress Report',
    description: 'Summarises outputs, activities, and indicator updates for the quarter against workplan targets.',
    sections: ['Executive Summary','Indicator Status','Activity Progress','Budget Utilisation','Key Issues & Risks','Next Quarter Priorities'],
  },
  {
    id: 'annual',
    icon: '📆',
    name: 'Annual Results Report',
    description: 'Comprehensive year-end review of outcomes, outputs, and contribution to Goals against the RBM framework.',
    sections: ['Year Highlights','Outcomes Assessment','Output Delivery','Indicator Dashboard','Financial Summary','Lessons Learned','Year Ahead'],
  },
  {
    id: 'midterm',
    icon: '🔍',
    name: 'Mid-Term Review',
    description: 'Independent assessment of project relevance, effectiveness, efficiency, and likelihood of impact at the midpoint.',
    sections: ['Scope & Methodology','Relevance','Effectiveness','Efficiency','Sustainability Outlook','GEDSI Analysis','Recommendations'],
  },
  {
    id: 'endline',
    icon: '✅',
    name: 'End-of-Project Evaluation',
    description: 'Final summative evaluation covering all OECD-DAC criteria, documenting results, lessons, and sustainability prospects.',
    sections: ['Introduction','Findings by DAC Criteria','Results Against Theory of Change','Beneficiary Perspectives','Value for Money','Final Recommendations'],
  },
  {
    id: 'adhoc',
    icon: '📊',
    name: 'Ad-Hoc Indicator Status',
    description: 'On-demand snapshot of one or more indicators with traffic light ratings, data sources, and notes.',
    sections: ['Selected Indicators','Traffic Light Status','Data Quality Notes','Contextual Analysis'],
  },
];

const fmtVUV = n => `VUV ${new Intl.NumberFormat().format(n ?? 0)}`;
const pct    = (a, b) => b ? Math.round((a / b) * 100) : 0;

const TRAFFIC_DOT = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };
const TRAFFIC_LABEL = { green: 'On Track', amber: 'At Risk', red: 'Off Track' };

function ReportPreview({ type, project }) {
  const proj = project ? PROJECTS.find(p => p.id === project) : null;
  const indicators = proj ? proj.indicators : ALL_INDICATORS.slice(0, 6);
  const now = new Date().toLocaleDateString('en-VU', { year:'numeric', month:'long', day:'numeric' });

  return (
    <div style={{ fontFamily: 'serif', maxHeight: 420, overflowY: 'auto', padding: 24, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      {/* Cover */}
      <div style={{ textAlign: 'center', paddingBottom: 24, borderBottom: '2px solid #065f46', marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
          Department of Climate Change · Vanuatu
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#064e3b', marginBottom: 4 }}>
          DoCC M&amp;E Monitoring Platform
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>{type.name}</div>
        {proj && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{proj.name}</div>}
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>Generated: {now} · DRAFT</div>
      </div>

      {/* Sections */}
      {type.sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {i + 1}. {sec}
          </div>
          {sec.toLowerCase().includes('indicator') && (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280' }}>Indicator</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>Baseline</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>Current</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>Target</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>%</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map(ind => (
                  <tr key={ind.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{ind.name}</td>
                    <td style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>{ind.baseline}</td>
                    <td style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 700 }}>{ind.current}</td>
                    <td style={{ textAlign: 'center', padding: '4px 8px', color: '#6b7280' }}>{ind.target}</td>
                    <td style={{ textAlign: 'center', padding: '4px 8px' }}>{pct(ind.current, ind.target)}%</td>
                    <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                      <span style={{ background: TRAFFIC_DOT[ind.traffic], color: '#fff', borderRadius: 9999, fontSize: 10, padding: '1px 6px' }}>
                        {TRAFFIC_LABEL[ind.traffic]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sec.toLowerCase().includes('budget') || sec.toLowerCase().includes('financial') ? (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280' }}>Project</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280' }}>Budget</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280' }}>Spent</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {PROJECTS.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{p.category}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', color: '#6b7280' }}>VUV {(p.budget_vuv/1e6).toFixed(0)}M</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 700 }}>VUV {(p.spent_vuv/1e6).toFixed(0)}M</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{pct(p.spent_vuv, p.budget_vuv)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !sec.toLowerCase().includes('indicator') && (
            <div style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic', paddingLeft: 8 }}>
              [Content for this section will be populated from the M&amp;E database upon report generation.]
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
        DoCC M&amp;E Monitoring Platform · Confidential · For official use only
      </div>
    </div>
  );
}

export default function Reports({ user }) {
  const [selected, setSelected] = useState(REPORT_TYPES[0]);
  const [project, setProject]   = useState('');
  const [period, setPeriod]     = useState('Q1 2026');
  const [preview, setPreview]   = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = () => {
    setGenerated(false);
    setPreview(true);
    setTimeout(() => setGenerated(true), 800);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate, preview, and export DoCC M&amp;E reports</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report type selector */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Report Type</h2>
          {REPORT_TYPES.map(rt => (
            <button key={rt.id} onClick={() => { setSelected(rt); setPreview(false); setGenerated(false); }}
              className={`w-full text-left rounded-xl p-4 border transition ${selected.id === rt.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white hover:border-emerald-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{rt.icon}</span>
                <span className="font-semibold text-gray-800 text-sm">{rt.name}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{rt.description}</p>
            </button>
          ))}
        </div>

        {/* Configuration + preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Config */}
          <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Configure Report</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project (optional)</label>
                <select value={project} onChange={e => setProject(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">All Projects</option>
                  {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Reporting Period</label>
                <select value={period} onChange={e => setPeriod(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  {['Q1 2026','Q4 2025','Q3 2025','Q2 2025','2025 Annual','2024 Annual'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Sections included</div>
              <div className="flex flex-wrap gap-2">
                {selected.sections.map(s => (
                  <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">{s}</span>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={handleGenerate}
                className="flex-1 bg-gradient-to-r from-green-700 to-emerald-500 text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition">
                {preview && !generated ? '⏳ Generating…' : '📄 Generate Preview'}
              </button>
              {generated && (
                <button
                  onClick={() => alert('Export to PDF/DOCX — coming soon in full deployment.')}
                  className="px-4 py-2 border border-emerald-400 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-50 transition">
                  ⬇ Export
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold text-gray-800">Report Preview</h2>
                {generated && <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">✅ Ready</span>}
              </div>
              {!generated ? (
                <div className="py-16 text-center">
                  <div className="text-3xl animate-bounce mb-3">⚙️</div>
                  <p className="text-sm text-gray-400">Compiling data…</p>
                </div>
              ) : (
                <ReportPreview
                  type={selected}
                  project={project ? parseInt(project) : null}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
