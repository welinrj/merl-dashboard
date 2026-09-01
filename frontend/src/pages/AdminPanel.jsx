import { useState, useEffect, useCallback, Fragment } from 'react';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import { dbErrorMessage } from '../lib/dbError';
import ChangePasswordModal from '../components/ui/ChangePasswordModal';
import { useTranslation } from 'react-i18next';
import { fmtDateTime } from '../lib/locale';
import { localised, i18nCols } from '../lib/contentLocale';

// The four official user types. `id` is the DB enum value (merl.user_role).
// Data Entry / Project Officer was retired in migration 0041 — it is neither
// offered here nor accepted by admin_create_user.
const DB_ROLES = [
  { id: 'system_admin',       label: 'adm.roleAdmin',                 color: 'bg-red-100 text-red-700' },
  { id: 'docc_me_officer',    label: 'adm.roleMeo',                     color: 'bg-blue-100 text-blue-700' },
  { id: 'project_manager',    label: 'adm.rolePm', color: 'bg-green-100 text-green-700' },
  { id: 'viewer',             label: 'adm.roleViewer',                   color: 'bg-gray-100 text-gray-700' },
];

// ── Constants ─────────────────────────────────────────────────────────────────
// App-side role codes (UserRole in types.ts), same four official roles.
const ROLES = [
  { id: 'ROLE_ADMIN',        label: 'adm.roleAdmin',                 color: 'bg-red-100 text-red-700' },
  { id: 'ROLE_DOCC_MEO',     label: 'adm.roleMeo',                     color: 'bg-blue-100 text-blue-700' },
  { id: 'ROLE_PROJ_MANAGER', label: 'adm.rolePm', color: 'bg-green-100 text-green-700' },
  { id: 'ROLE_VIEWER',       label: 'adm.roleViewer',                   color: 'bg-gray-100 text-gray-700' },
];

const CATEGORIES = [
  { id: 'CC-ADAPT',  label: 'adm.catAdaptation',    color: '#10b981' },
  { id: 'CC-RESIL',  label: 'adm.catResilience',  color: '#3b82f6' },
  { id: 'CC-MITIG',  label: 'adm.catMitigation',    color: '#f59e0b' },
  { id: 'CC-POLICY', label: 'adm.catPolicy',   color: '#8b5cf6' },
  { id: 'CC-CAPBLD', label: 'adm.catCapacity',     color: '#ec4899' },
  { id: 'CC-CROSS',  label: 'adm.catCrossCutting',         color: '#6366f1' },
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

// ── Project-assignment modal ─────────────────────────────────────────────────
// Assign/unassign projects to a Project Manager. Every other role is
// portfolio-wide (System Admin / DoCC M&E Officer / Viewer) and needs no
// assignment — they see all.
function AssignProjectsModal({ user, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [projects, setProjects] = useState([]);
  const [assigned, setAssigned] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(null);
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [pj, as] = await Promise.all([
      localised(() => supabase.from('v_projects').select(i18nCols('id, code, name')).order('code')),
      supabase.from('v_user_project_assignments').select('project_id, is_active').eq('user_id', user.id),
    ]);
    setProjects(pj.data || []);
    setAssigned(new Set((as.data || []).filter(a => a.is_active).map(a => a.project_id)));
    setLoading(false);
  }, [user.id, lang]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (projectId, isOn) => {
    setBusy(projectId); setErr('');
    const { error } = isOn
      ? await supabase.rpc('unassign_user_project', { p_user_id: user.id, p_project_id: projectId })
      : await supabase.rpc('assign_user_project', { p_user_id: user.id, p_project_id: projectId, p_assignment_type: 'manager' });
    setBusy(null);
    if (error) { setErr(dbErrorMessage(error)); return; }
    setAssigned(prev => { const n = new Set(prev); if (isOn) n.delete(projectId); else n.add(projectId); return n; });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mt-12" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{t('adm.assignedProjects')}</h3>
        <p className="text-sm text-gray-500 mt-1">
          <span className="font-medium text-gray-700">{user.full_name}</span> can access only the projects checked below.
        </p>
        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">{t('adm.loading')}</div>
          ) : projects.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">{t('adm.noProjects')}</div>
          ) : projects.map(p => {
            const on = assigned.has(p.id);
            return (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={on} disabled={busy === p.id}
                  onChange={() => toggle(p.id, on)} className="accent-green-600 w-4 h-4" />
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{p.code}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.name}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between items-center">
          <span className="text-xs text-gray-400">{assigned.size} project{assigned.size === 1 ? '' : 's'} assigned</span>
          <button onClick={onClose} className="bg-green-700 text-white text-sm font-semibold rounded-lg px-5 py-2 hover:bg-green-800">{t('adm.done')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const { t } = useTranslation();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ email: '', full_name: '', role: 'project_manager', organisation: '' });
  const [busy, setBusy]         = useState(false);
  const [cred, setCred]         = useState(null);
  const [assignFor, setAssignFor] = useState(null); // user whose project assignments are open
  // Whose password the administrator is setting. Distinct from the reset
  // above: that generates a temporary one to pass on, this chooses it.
  const [passwordFor, setPasswordFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('v_admin_users').select('*').order('full_name');
    if (error) setErr(dbErrorMessage(error)); else { setUsers(data || []); setErr(''); }
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
    if (error) { setErr(dbErrorMessage(error)); return; }
    setCred({ email: form.email.trim().toLowerCase(), password: data });
    setForm({ email: '', full_name: '', role: 'project_manager', organisation: '' });
    setShowForm(false);
    load();
  };

  const resetPassword = async (u) => {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('admin_reset_password', { p_id: u.id });
    setBusy(false);
    if (error) { setErr(dbErrorMessage(error)); return; }
    setCred({ email: u.email, password: data });
  };

  const toggleActive = async (u) => {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('admin_set_active', { p_id: u.id, p_active: !u.active });
    setBusy(false);
    if (error) setErr(dbErrorMessage(error)); else load();
  };

  const removeUser = async (u) => {
    if (!(await confirmDialog({ title:t('adm.deleteUser'), message:t('adm.deleteUserConfirm', { name: u.full_name }), confirmLabel:t('adm.deleteLbl') }))) return;
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('admin_delete_user', { p_id: u.id });
    setBusy(false);
    if (error) setErr(dbErrorMessage(error)); else load();
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
          <h3 className="text-sm font-bold text-green-800">{t('adm.newUser')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder={t('adm.fullName')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email"
              placeholder={t('adm.emailAddress')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full">
              {DB_ROLES.map(r => <option key={r.id} value={r.id}>{t(r.label)}</option>)}
            </select>
            <input value={form.organisation} onChange={e => setForm({ ...form, organisation: e.target.value })}
              placeholder={t('adm.organisationOptional')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={addUser} disabled={busy}
              className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 disabled:opacity-60">
              {busy ? 'Creating…' : 'Create user'}
            </button>
            <button onClick={() => { setShowForm(false); setErr(''); }}
              className="text-sm text-gray-600 px-4 py-1.5 rounded-lg hover:bg-gray-100">{t('adm.cancel')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-6">{t('adm.loadingUsers')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold uppercase">
                <th className="pb-2 pr-4">{t('adm.name')}</th>
                <th className="pb-2 pr-4">{t('adm.email')}</th>
                <th className="pb-2 pr-4">{t('adm.role')}</th>
                <th className="pb-2 pr-4">{t('adm.organisation')}</th>
                <th className="pb-2 pr-4">{t('adm.status')}</th>
                <th className="pb-2 text-right">{t('adm.actions')}</th>
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
                        {role ? t(role.label) : u.role}
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
                      <button onClick={() => setPasswordFor(u)} disabled={busy || !u.has_login}
                        className="text-xs font-semibold text-green-700 hover:underline disabled:text-gray-300 disabled:no-underline mr-3">
                        {t('pw.setPassword')}
                      </button>
                      <button onClick={() => resetPassword(u)} disabled={busy || !u.has_login}
                        className="text-xs font-semibold text-gray-600 hover:underline disabled:text-gray-300 disabled:no-underline mr-3">
                        {t('adm.resetPassword')}
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={busy}
                        className="text-xs font-semibold text-gray-600 hover:underline mr-3">
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                      {u.role === 'project_manager' && (
                        <button onClick={() => setAssignFor(u)} disabled={busy}
                          className="text-xs font-semibold text-blue-600 hover:underline mr-3">
                          {t('adm.assignProjects')}
                        </button>
                      )}
                      <button onClick={() => removeUser(u)} disabled={busy}
                        className="text-xs font-semibold text-red-600 hover:underline">
                        {t('adm.deleteLbl')}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-sm text-gray-400">{t('adm.noUsers')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {cred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCred(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">{t('adm.tempPassword')}</h3>
            <p className="text-sm text-gray-500 mt-1">
              Shown once. Share it securely with the user — they should change it after signing in.
              Passwords are stored as one-way hashes and can never be viewed again.
            </p>
            <div className="mt-4 space-y-1">
              <div className="text-xs font-semibold text-gray-400 uppercase">{t('adm.email')}</div>
              <div className="font-mono text-sm text-gray-800 break-all">{cred.email}</div>
              <div className="text-xs font-semibold text-gray-400 uppercase pt-3">{t('adm.tempPassword')}</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-gray-100 border border-gray-200 rounded px-2 py-1 flex-1 break-all">{cred.password}</code>
                <button onClick={() => navigator.clipboard?.writeText(cred.password)}
                  className="text-xs font-semibold text-green-700 hover:underline">{t('adm.copy')}</button>
              </div>
            </div>
            <button onClick={() => setCred(null)}
              className="mt-5 w-full bg-green-700 text-white text-sm font-semibold rounded-lg py-2 hover:bg-green-800">
              {t('adm.done')}
            </button>
          </div>
        </div>
      )}

      {assignFor && (
        <AssignProjectsModal user={assignFor} onClose={() => setAssignFor(null)} />
      )}

      {passwordFor && (
        <ChangePasswordModal adminFor={passwordFor} onClose={() => setPasswordFor(null)} onDone={load} />
      )}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab() {
  const { t } = useTranslation();
  const EMPTY_FORM = {
    name: '', code: '', category: 'CC-ADAPT', lead_agency: '',
    description: '', start_date: '', end_date: '',
    budget_vuv: '', status: 'active', provinces: [],
  };
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');       // page-level load error
  const [form, setForm]         = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError]       = useState('');       // form-level error
  const [busy, setBusy]         = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // project pending delete

  const catColor = cat => CATEGORIES.find(c => c.id === cat)?.color || '#6b7280';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data, error: e } = await supabase.from('v_projects').select('*').order('code');
    if (e) setErr(dbErrorMessage(e));
    else setProjects(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleProvince = prov =>
    setForm(f => ({
      ...f,
      provinces: f.provinces.includes(prov)
        ? f.provinces.filter(p => p !== prov)
        : [...f.provinces, prov],
    }));

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setError(''); setShowForm(true); };

  const openEdit = p => {
    setEditingId(p.id);
    setForm({
      name: p.name || '', code: p.code || '', category: p.category || 'CC-ADAPT',
      lead_agency: p.lead_agency || '', description: p.description || '',
      start_date: p.start_date || '', end_date: p.end_date || '',
      budget_vuv: p.budget_vuv != null ? String(Math.round(Number(p.budget_vuv))) : '',
      status: p.status || 'active', provinces: p.provinces || [],
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setError(''); };

  const save = async () => {
    if (!form.name.trim()) { setError(t('adm.projectNameRequired')); return; }
    if (!editingId && !form.code.trim()) { setError(t('adm.projectCodeRequired')); return; }
    setBusy(true); setError('');

    const common = {
      p_name:        form.name.trim(),
      p_category:    form.category,
      p_lead_agency: form.lead_agency.trim() || null,
      p_description: form.description.trim() || null,
      p_start_date:  form.start_date || null,
      p_end_date:    form.end_date || null,
      p_budget_vuv:  form.budget_vuv ? Number(form.budget_vuv) : 0,
      p_status:      form.status,
      p_provinces:   form.provinces,
    };

    const resp = editingId
      ? await supabase.rpc('admin_update_project', { p_id: editingId, ...common })
      : await supabase.rpc('admin_create_project', { p_code: form.code.trim().toUpperCase(), ...common });

    setBusy(false);
    if (resp.error) { setError(dbErrorMessage(resp.error)); return; }
    closeForm();
    load();
  };

  const doDelete = async p => {
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_delete_project', { p_id: p.id });
    setBusy(false);
    setConfirmDel(null);
    if (e) { setErr(dbErrorMessage(e)); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold text-gray-800">
          {t('adm.projectsCount', { count: projects.length })}{loading && <span className="ml-2 text-xs font-normal text-gray-400">{t('adm.loadingShort')}</span>}
        </h2>
        <button
          onClick={openAdd}
          className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 transition"
        >
          + Add Project
        </button>
      </div>

      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {showForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-green-800">{editingId ? 'Edit Project' : 'New Project'}</h3>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Project name — full width */}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">{t('adm.projectNameReq')}</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t('adm.phProjectName')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Code — immutable once created */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Project Code{editingId ? '' : ' *'}
              </label>
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder={t('adm.phProjectCode')}
                readOnly={!!editingId}
                title={editingId ? 'Project code cannot be changed' : undefined}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono ${
                  editingId ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('adm.category')}</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{t(c.label)} ({c.id})</option>
                ))}
              </select>
            </div>

            {/* Lead Agency */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('adm.leadAgency')}</label>
              <input
                value={form.lead_agency}
                onChange={e => setForm({ ...form, lead_agency: e.target.value })}
                placeholder={t('adm.phLeadAgency')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('adm.status')}</label>
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
              <label className="text-xs text-gray-500 block mb-1">{t('adm.startDate')}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('adm.endDate')}</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Budget */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('adm.totalBudgetVuv')}</label>
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
              <label className="text-xs text-gray-500 block mb-1">{t('adm.description')}</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={t('adm.descriptionPh')}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Province toggles — full width */}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">{t('adm.provinces')}</label>
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

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={busy}
              className="text-sm bg-green-700 text-white px-5 py-2 rounded-lg hover:bg-green-800 font-semibold disabled:opacity-60"
            >
              {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Save Project'}
            </button>
            <button
              onClick={closeForm}
              className="text-sm text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100"
            >
              {t('adm.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Projects table */}
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-semibold uppercase">
            <th className="pb-2 pr-4">{t('adm.projectName')}</th>
            <th className="pb-2 pr-4">{t('adm.code')}</th>
            <th className="pb-2 pr-4">{t('adm.category')}</th>
            <th className="pb-2 pr-4">{t('adm.leadAgency')}</th>
            <th className="pb-2 pr-4">{t('adm.budgetVuv')}</th>
            <th className="pb-2 pr-4">{t('adm.provinces')}</th>
            <th className="pb-2 pr-4">{t('adm.status')}</th>
            <th className="pb-2 text-right">{t('adm.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {!loading && projects.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-sm text-gray-400">{t('adm.noProjectsAdd')}</td></tr>
          )}
          {projects.map(p => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="py-2.5 pr-4 font-medium text-gray-800">{p.name}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{p.code}</td>
              <td className="py-2.5 pr-4">
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white font-semibold"
                  style={{ background: catColor(p.category) }}
                >
                  {p.category}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-gray-500">{p.lead_agency || '—'}</td>
              <td className="py-2.5 pr-4 text-gray-500">
                {p.budget_vuv ? `${(p.budget_vuv / 1e6).toFixed(1)}M` : '—'}
              </td>
              <td className="py-2.5 pr-4 text-gray-400 text-xs">{p.provinces?.join(', ') || '—'}</td>
              <td className="py-2.5 pr-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                  p.status === 'active'    ? 'bg-green-100 text-green-700' :
                  p.status === 'completed' ? 'bg-blue-100 text-blue-700'  :
                                             'bg-red-100 text-red-700'
                }`}>
                  {p.status}
                </span>
              </td>
              <td className="py-2.5 text-right whitespace-nowrap">
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs font-semibold text-green-700 hover:text-green-900 px-2 py-1 rounded hover:bg-green-50"
                >
                  {t('adm.edit')}
                </button>
                <button
                  onClick={() => setConfirmDel(p)}
                  className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                >
                  {t('adm.deleteLbl')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Delete confirmation */}
      {confirmDel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setConfirmDel(null)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">{t('adm.deleteProject')}</h3>
            <p className="text-sm text-gray-600 mt-2">
              {t('adm.permanentlyDeletes')} <span className="font-semibold">{confirmDel.name}</span>{' '}
              (<span className="font-mono text-xs">{confirmDel.code}</span>). This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDel(null)}
                disabled={busy}
                className="text-sm text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                {t('adm.cancel')}
              </button>
              <button
                onClick={() => doDelete(confirmDel)}
                disabled={busy}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────
const ACTION_STYLE = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};
const PAGE_SIZE = 25;

function AuditTab() {
  const { t } = useTranslation();
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [action, setAction]   = useState('');
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(0);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data, error } = await supabase.rpc('admin_audit_log', {
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
      p_table: null,
      p_action: action || null,
      p_search: search || null,
    });
    if (error) { setErr(dbErrorMessage(error)); setRows([]); setTotal(0); }
    else {
      setRows(data ?? []);
      setTotal(data?.[0]?.total_count ?? 0);
    }
    setLoading(false);
  }, [page, action, search]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmt = fmtDateTime;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold text-gray-800">{t('adm.auditLog')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={action}
            onChange={e => { setPage(0); setAction(e.target.value); }}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            <option value="">{t('adm.allActions')}</option>
            <option value="INSERT">{t('adm.insert')}</option>
            <option value="UPDATE">{t('adm.update')}</option>
            <option value="DELETE">{t('adm.deleteLbl')}</option>
          </select>
          <input
            value={search}
            onChange={e => { setPage(0); setSearch(e.target.value); }}
            placeholder={t('adm.searchAudit')}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white min-w-[180px]"
          />
          <button onClick={load} className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100">
            {t('adm.refresh')}
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-3 py-2">{t('adm.when')}</th>
              <th className="text-left font-semibold px-3 py-2">{t('adm.user')}</th>
              <th className="text-left font-semibold px-3 py-2">{t('adm.action')}</th>
              <th className="text-left font-semibold px-3 py-2">{t('adm.table')}</th>
              <th className="text-left font-semibold px-3 py-2">{t('adm.record')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">{t('adm.loading')}</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">{t('adm.noAuditEntries')}</td></tr>
            )}
            {!loading && rows.map(r => (
              <Fragment key={r.id}>
                <tr className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmt(r.changed_at)}</td>
                  <td className="px-3 py-2 text-gray-800">{r.actor_name || <span className="text-gray-400">{t('adm.systemActor')}</span>}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_STYLE[r.action] || 'bg-gray-100 text-gray-600'}`}>{r.action}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.schema_name}.{r.table_name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.record_id ? String(r.record_id).slice(0, 8) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-xs text-green-700 font-semibold hover:underline"
                    >
                      {expanded === r.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-gray-50 border-t border-gray-100">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{t('adm.before')}</div>
                          <pre className="text-xs bg-white border border-gray-100 rounded-lg p-2 overflow-x-auto max-h-56">{r.old_values ? JSON.stringify(r.old_values, null, 2) : '—'}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{t('adm.after')}</div>
                          <pre className="text-xs bg-white border border-gray-100 rounded-lg p-2 overflow-x-auto max-h-56">{r.new_values ? JSON.stringify(r.new_values, null, 2) : '—'}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} event{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
          >{t('adm.previous')}</button>
          <span>Page {page + 1} of {pages}</span>
          <button
            onClick={() => setPage(p => (p + 1 < pages ? p + 1 : p))}
            disabled={page + 1 >= pages}
            className="px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
          >{t('adm.next')}</button>
        </div>
      </div>
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────────────────────────
function SystemTab() {
  const { t } = useTranslation();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data, error } = await supabase.rpc('system_status');
    if (error) setErr(dbErrorMessage(error));
    else setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = fmtDateTime;
  const rlsTables = status?.rls_tables ?? [];
  const rlsCovered = rlsTables.filter(t => t.rls_enabled).length;

  if (loading) return <div className="px-4 py-10 text-center text-gray-400 text-sm">{t('adm.loadingSystem')}</div>;
  if (err) return <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">{t('adm.system')}</h2>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 bg-white border border-gray-100 rounded-lg px-4 py-3">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-gray-900">{status?.audit_row_count ?? 0}</span>
            <span className="text-xs text-gray-400">Audit events · last {fmt(status?.last_audit_at)}</span>
          </span>
          <span className="text-gray-200" aria-hidden="true">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-gray-800">{fmt(status?.analytics_computed_at)}</span>
            <span className="text-xs text-gray-400">{t('adm.analyticsCache')}</span>
          </span>
          <span className="text-gray-200" aria-hidden="true">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-gray-900">{rlsCovered}/{rlsTables.length}</span>
            <span className="text-xs text-gray-400">{t('adm.rlsTables')}</span>
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">{t('adm.rowLevelSecurity')}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {rlsTables.map(t => (
            <div key={t.table} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.rls_enabled ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-600 font-mono truncate">{t.table}</span>
              {!t.rls_enabled && <span className="ml-auto text-[10px] text-red-600 font-semibold">{t('adm.off')}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AdminPanel (default export) ───────────────────────────────────────────────
// Each tab is self-contained and loads its own data from Supabase.
export default function AdminPanel({ user }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('users');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('adm.adminPanel')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t('adm.adminSub')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        <TabButton label={t('adm.users')}     active={tab === 'users'}    onClick={() => setTab('users')} />
        <TabButton label={t('adm.projects')}  active={tab === 'projects'} onClick={() => setTab('projects')} />
        <TabButton label={t('adm.auditLog')} active={tab === 'audit'}    onClick={() => setTab('audit')} />
        <TabButton label={t('adm.system')}    active={tab === 'system'}   onClick={() => setTab('system')} />
      </div>

      {tab === 'users'    && <UsersTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'audit'    && <AuditTab />}
      {tab === 'system'   && <SystemTab />}
    </div>
  );
}
