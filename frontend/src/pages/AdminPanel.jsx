import { useState, useEffect, useCallback } from 'react';
import { AUDIT_LOG } from '../mockData';
import { supabase } from '../supabaseClient';

const DB_ROLES = [
  { id: 'administrator',       label: 'System Administrator', color: 'bg-red-100 text-red-700' },
  { id: 'docc_senior_officer', label: 'DoCC Senior Officer',  color: 'bg-purple-100 text-purple-700' },
  { id: 'docc_me_officer',     label: 'DoCC M&E Officer',     color: 'bg-blue-100 text-blue-700' },
  { id: 'project_manager',     label: 'Project Manager',      color: 'bg-green-100 text-green-700' },
  { id: 'field_staff',         label: 'Field Staff',          color: 'bg-gray-100 text-gray-700' },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES = [
  { id: 'ROLE_ADMIN',        label: 'System Administrator', color: 'bg-red-100 text-red-700' },
  { id: 'ROLE_DOCC_SENIOR',  label: 'DoCC Senior Officer',  color: 'bg-purple-100 text-purple-700' },
  { id: 'ROLE_DOCC_MEO',     label: 'DoCC M&E Officer',     color: 'bg-blue-100 text-blue-700' },
  { id: 'ROLE_PROJ_MANAGER', label: 'Project Manager',      color: 'bg-green-100 text-green-700' },
  { id: 'ROLE_FIELD_STAFF',   label: 'Field Staff',        color: 'bg-gray-100 text-gray-700' },
];

const CATEGORIES = [
  { id: 'CC-ADAPT',  label: 'Climate Adaptation',    color: '#10b981' },
  { id: 'CC-RESIL',  label: 'Community Resilience',  color: '#3b82f6' },
  { id: 'CC-MITIG',  label: 'Climate Mitigation',    color: '#f59e0b' },
  { id: 'CC-POLICY', label: 'Policy & Governance',   color: '#8b5cf6' },
  { id: 'CC-CAPBLD', label: 'Capacity Building',     color: '#ec4899' },
  { id: 'CC-CROSS',  label: 'Cross-Cutting',         color: '#6366f1' },
];

const PROVINCES = ['Shefa', 'Sanma', 'Penama', 'Malampa', 'Torba', 'Tafea'];

const STATUS_OPTIONS = ['active', 'completed', 'suspended'];

// ── Shared sub-components ─────────────────────────────────────────────────────
function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
        active ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ email: '', full_name: '', role: 'field_staff', organisation: '' });
  const [busy, setBusy]         = useState(false);
  const [cred, setCred]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('v_admin_users').select('*').order('full_name');
    if (error) setErr(error.message); else { setUsers(data || []); setErr(''); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addUser = async () => {
    if (!form.email.trim() || !form.full_name.trim()) { setErr('Full name and email are required.'); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_email: form.email.trim(), p_full_name: form.full_name.trim(),
      p_role: form.role, p_organisation: form.organisation.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setCred({ email: form.email.trim().toLowerCase(), password: data });
    setForm({ email: '', full_name: '', role: 'field_staff', organisation: '' });
    setShowForm(false);
    load();
  };

  const resetPassword = async (u) => {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('admin_reset_password', { p_id: u.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setCred({ email: u.email, password: data });
  };

  const toggleActive = async (u) => {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('admin_set_active', { p_id: u.id, p_active: !u.active });
    setBusy(false);
    if (error) setErr(error.message); else load();
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Permanently delete ${u.full_name}?\n\nThis cannot be undone. To preserve the audit trail, use Deactivate instead.`)) return;
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('admin_delete_user', { p_id: u.id });
    setBusy(false);
    if (error) setErr(error.message); else load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-gray-800">System Users ({users.length})</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 transition">
          + Add User
        </button>
      </div>

      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

      {showForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-green-800">New User</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="Full name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email"
              placeholder="Email address" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full">
              {DB_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <input value={form.organisation} onChange={e => setForm({ ...form, organisation: e.target.value })}
              placeholder="Organisation (optional)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={addUser} disabled={busy}
              className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 disabled:opacity-60">
              {busy ? 'Creating…' : 'Create user'}
            </button>
            <button onClick={() => { setShowForm(false); setErr(''); }}
              className="text-sm text-gray-600 px-4 py-1.5 rounded-lg hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading users…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold uppercase">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Organisation</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const role = DB_ROLES.find(r => r.id === u.role);
                return (
                  <tr key={u.id} className="hover:bg-gray-50 align-middle">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{u.full_name}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${role?.color || 'bg-gray-100 text-gray-600'}`}>
                        {role?.label || u.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{u.organisation || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700' : 'text-gray-400'}`}>
                        <span className={`w-2 h-2 rounded-full inline-block ${u.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => resetPassword(u)} disabled={busy || !u.has_login}
                        className="text-xs font-semibold text-green-700 hover:underline disabled:text-gray-300 disabled:no-underline mr-3">
                        Reset password
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={busy}
                        className="text-xs font-semibold text-gray-600 hover:underline mr-3">
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => removeUser(u)} disabled={busy}
                        className="text-xs font-semibold text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-sm text-gray-400">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCred(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Temporary password</h3>
            <p className="text-sm text-gray-500 mt-1">
              Shown once. Share it securely with the user — they should change it after signing in.
              Passwords are stored as one-way hashes and can never be viewed again.
            </p>
            <div className="mt-4 space-y-1">
              <div className="text-xs font-semibold text-gray-400 uppercase">Email</div>
              <div className="font-mono text-sm text-gray-800 break-all">{cred.email}</div>
              <div className="text-xs font-semibold text-gray-400 uppercase pt-3">Temporary password</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-gray-100 border border-gray-200 rounded px-2 py-1 flex-1 break-all">{cred.password}</code>
                <button onClick={() => navigator.clipboard?.writeText(cred.password)}
                  className="text-xs font-semibold text-green-700 hover:underline">Copy</button>
              </div>
            </div>
            <button onClick={() => setCred(null)}
              className="mt-5 w-full bg-green-700 text-white text-sm font-semibold rounded-lg py-2 hover:bg-green-800">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ projects, setProjects }) {
  const EMPTY_FORM = {
    name: '', code: '', category: 'CC-ADAPT', lead_agency: '',
    description: '', start_date: '', end_date: '',
    budget_vuv: '', status: 'active', provinces: [],
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const toggleProvince = prov =>
    setForm(f => ({
      ...f,
      provinces: f.provinces.includes(prov)
        ? f.provinces.filter(p => p !== prov)
        : [...f.provinces, prov],
    }));

  const addProject = () => {
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    if (!form.code.trim())  { setError('Project code is required.'); return; }
    if (projects.some(p => p.code === form.code.trim())) {
      setError(`Code "${form.code.trim()}" already exists.`); return;
    }
    setError('');

    const cat = CATEGORIES.find(c => c.id === form.category);
    const maxId  = Math.max(...projects.map(p => p.id), 0);
    const maxInd = Math.max(...projects.flatMap(p => p.indicators.map(i => i.id)), 0);
    const endYear = form.end_date ? new Date(form.end_date).getFullYear() : 2027;

    const newProject = {
      id:             maxId + 1,
      code:           form.code.trim().toUpperCase(),
      category:       form.category,
      category_color: cat?.color || '#6b7280',
      name:           form.name.trim(),
      description:    form.description.trim() || 'Description to be added.',
      status:         form.status,
      start_date:     form.start_date || new Date().toISOString().slice(0, 10),
      end_date:       form.end_date || '',
      budget_vuv:     parseInt(form.budget_vuv) || 0,
      spent_vuv:      0,
      lead_agency:    form.lead_agency.trim() || 'DoCC',
      provinces:      form.provinces.length ? form.provinces : ['Shefa'],
      latitude:       -17.733,
      longitude:      168.322,
      rbm: {
        goal: 'To be defined',
        outcomes: [{ id: `OUT-${form.code}-1`, text: 'To be defined', outputs: [] }],
      },
      indicators: [
        {
          id:          maxInd + 1,
          code:        `${form.code.trim().toUpperCase()}-IND-001`,
          name:        'Key indicator (to be defined)',
          unit:        'count',
          baseline:    0,
          target:      100,
          current:     0,
          target_year: endYear,
          freq:        'Quarterly',
          traffic:     'amber',
        },
      ],
      quarterly: [],
    };

    setProjects(prev => [...prev, newProject]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-gray-800">Projects ({projects.length})</h2>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 transition"
        >
          + Add Project
        </button>
      </div>

      {showForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-green-800">New Project</h3>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Project name — full width */}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Project Name *</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Vanuatu Coastal Resilience Programme"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Code */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Project Code *</label>
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. VCRP-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label} ({c.id})</option>
                ))}
              </select>
            </div>

            {/* Lead Agency */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Lead Agency</label>
              <input
                value={form.lead_agency}
                onChange={e => setForm({ ...form, lead_agency: e.target.value })}
                placeholder="e.g. DoCC / MALFFB"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Budget */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Total Budget (VUV)</label>
              <input
                type="number"
                value={form.budget_vuv}
                onChange={e => setForm({ ...form, budget_vuv: e.target.value })}
                placeholder="e.g. 50000000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Description — full width */}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief project description..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Province toggles — full width */}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Provinces</label>
              <div className="flex flex-wrap gap-2">
                {PROVINCES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleProvince(p)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      form.provinces.includes(p)
                        ? 'bg-green-700 text-white border-green-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 italic">
            A placeholder indicator (IND-001) will be created automatically. You can edit indicators after saving.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={addProject}
              className="text-sm bg-green-700 text-white px-5 py-2 rounded-lg hover:bg-green-800 font-semibold"
            >
              Save Project
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(''); }}
              className="text-sm text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Projects table */}
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold uppercase">
            <th className="pb-2 pr-4">Project Name</th>
            <th className="pb-2 pr-4">Code</th>
            <th className="pb-2 pr-4">Category</th>
            <th className="pb-2 pr-4">Lead Agency</th>
            <th className="pb-2 pr-4">Budget (VUV)</th>
            <th className="pb-2 pr-4">Provinces</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {projects.map(p => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="py-2.5 pr-4 font-medium text-gray-800">{p.name}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{p.code}</td>
              <td className="py-2.5 pr-4">
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white font-semibold"
                  style={{ background: p.category_color }}
                >
                  {p.category}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-gray-500">{p.lead_agency}</td>
              <td className="py-2.5 pr-4 text-gray-500">
                {p.budget_vuv ? `${(p.budget_vuv / 1e6).toFixed(1)}M` : '—'}
              </td>
              <td className="py-2.5 pr-4 text-gray-400 text-xs">{p.provinces?.join(', ') || '—'}</td>
              <td className="py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                  p.status === 'active'    ? 'bg-green-100 text-green-700' :
                  p.status === 'completed' ? 'bg-blue-100 text-blue-700'  :
                                             'bg-red-100 text-red-700'
                }`}>
                  {p.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────
function AuditTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">Audit Log</h2>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold uppercase">
            <th className="pb-2 pr-4">Timestamp</th>
            <th className="pb-2 pr-4">User</th>
            <th className="pb-2 pr-4">Action</th>
            <th className="pb-2">Resource</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {AUDIT_LOG.map(entry => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="py-2.5 pr-4 text-xs text-gray-400 whitespace-nowrap">
                {new Date(entry.timestamp).toLocaleString()}
              </td>
              <td className="py-2.5 pr-4 font-medium text-gray-700">{entry.user}</td>
              <td className="py-2.5 pr-4 text-gray-600">{entry.action}</td>
              <td className="py-2.5 text-gray-500">{entry.resource}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────────────────────────
function SystemTab() {
  const services = [
    'Supabase PostgreSQL',
    'Supabase Auth',
    'Supabase Storage',
    'Supabase Edge Functions',
    'React Frontend (Vercel / GitHub Pages)',
    'Realtime / WebSocket',
  ];

  const rls_tables = [
    'projects', 'indicators', 'datasets', 'events', 'users',
    'audit_logs', 'reports', 'activities', 'rbm_results_chains',
    'community_engagements', 'file_uploads', 'system_config',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Service Health</h2>
        <div className="grid grid-cols-2 gap-3">
          {services.map(s => (
            <div key={s} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">{s}</span>
              <span className="ml-auto text-xs text-green-600 font-semibold">Healthy</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Row Level Security (RLS)</h2>
        <div className="grid grid-cols-3 gap-2">
          {rls_tables.map(t => (
            <div key={t} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-xs text-gray-600 font-mono">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AdminPanel (default export) ───────────────────────────────────────────────
// `projects` and `setProjects` are passed down from App.jsx shared state.
export default function AdminPanel({ user, projects, setProjects }) {
  const [tab, setTab] = useState('users');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          System administration — users, projects, audit log, and system health
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        <TabButton label="Users"     active={tab === 'users'}    onClick={() => setTab('users')} />
        <TabButton label="Projects"  active={tab === 'projects'} onClick={() => setTab('projects')} />
        <TabButton label="Audit Log" active={tab === 'audit'}    onClick={() => setTab('audit')} />
        <TabButton label="System"    active={tab === 'system'}   onClick={() => setTab('system')} />
      </div>

      {tab === 'users'    && <UsersTab projects={projects} />}
      {tab === 'projects' && <ProjectsTab projects={projects} setProjects={setProjects} />}
      {tab === 'audit'    && <AuditTab />}
      {tab === 'system'   && <SystemTab />}
    </div>
  );
}
