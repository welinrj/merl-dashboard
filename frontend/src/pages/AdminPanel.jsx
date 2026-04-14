import { useState } from 'react';
import { SYSTEM_USERS, AUDIT_LOG, PROJECTS } from '../mockData';

const ROLES = {
  ROLE_ADMIN:        { label: 'Administrator',     color: 'bg-red-100 text-red-700' },
  ROLE_DOCC_SENIOR:  { label: 'DoCC Senior',       color: 'bg-purple-100 text-purple-700' },
  ROLE_DOCC_MEO:     { label: 'DoCC M&E Officer',  color: 'bg-blue-100 text-blue-700' },
  ROLE_PROJ_MANAGER: { label: 'Project Manager',   color: 'bg-amber-100 text-amber-700' },
  ROLE_PROJ_STAFF:   { label: 'Project Staff',     color: 'bg-gray-100 text-gray-600' },
};

function TabButton({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${active ? 'bg-green-700 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-400'}`}>
      {label}
    </button>
  );
}

function UsersTab({ currentUser }) {
  const [users, setUsers] = useState(SYSTEM_USERS);
  const [newUser, setNewUser] = useState({ name:'', email:'', role:'ROLE_PROJ_STAFF', project:'' });
  const [showForm, setShowForm] = useState(false);

  const addUser = () => {
    if (!newUser.name || !newUser.email) return;
    setUsers(prev => [...prev, { ...newUser, id: prev.length + 1, active: true, last_login: null }]);
    setNewUser({ name:'', email:'', role:'ROLE_PROJ_STAFF', project:'' });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{users.length} users</span>
        <button onClick={() => setShowForm(!showForm)}
          className="text-sm font-semibold text-white bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg transition">
          + Add User
        </button>
      </div>

      {showForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">New User</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newUser.name} onChange={e => setNewUser(p=>({...p, name:e.target.value}))}
              placeholder="Full name" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <input value={newUser.email} onChange={e => setNewUser(p=>({...p, email:e.target.value}))}
              placeholder="Email" type="email" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <select value={newUser.role} onChange={e => setNewUser(p=>({...p, role:e.target.value}))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
              {Object.entries(ROLES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={newUser.project} onChange={e => setNewUser(p=>({...p, project:e.target.value}))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">No project</option>
              {PROJECTS.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={addUser} className="bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-green-800 transition">Create</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-green-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Email</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Role</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Project</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => {
              const role = ROLES[u.role];
              return (
                <tr key={u.id} className="hover:bg-green-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${role?.color || 'bg-gray-100 text-gray-600'}`}>
                      {role?.label || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{u.project || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-green-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Time</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">User</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Action</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">Resource</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {AUDIT_LOG.map(entry => (
            <tr key={entry.id} className="hover:bg-green-50/50">
              <td className="px-4 py-3 text-xs text-gray-400">{new Date(entry.timestamp).toLocaleString()}</td>
              <td className="px-4 py-3 font-medium text-gray-700">{entry.user}</td>
              <td className="px-4 py-3 text-gray-600">{entry.action}</td>
              <td className="px-4 py-3 text-xs text-gray-400 font-mono">{entry.resource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemTab() {
  const services = [
    { name: 'Supabase PostgreSQL 15', status: 'healthy', detail: 'Primary DB + PostGIS' },
    { name: 'Supabase Auth (GoTrue)', status: 'healthy', detail: 'RBAC / JWT' },
    { name: 'Supabase Storage',       status: 'healthy', detail: 'File uploads' },
    { name: 'Edge Functions (Deno)',   status: 'healthy', detail: '7 functions deployed' },
    { name: 'React Frontend',         status: 'healthy', detail: 'v18 + Vite · GitHub Pages' },
    { name: 'Supabase Realtime',      status: 'healthy', detail: 'WebSocket subscriptions' },
  ];
  return (
    <div className="space-y-6">
      {/* Service health */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">Service Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map(s => (
            <div key={s.name} className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-gray-700">{s.name}</div>
                <div className="text-xs text-gray-400">{s.detail}</div>
              </div>
              <span className="ml-auto text-xs font-semibold text-green-600">Healthy</span>
            </div>
          ))}
        </div>
      </div>

      {/* RLS status */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">Row Level Security (RLS)</h3>
        <div className="bg-white border border-green-100 rounded-xl overflow-hidden">
          {['users','projects','project_memberships','indicators','indicator_updates','datasets','dataset_rows','geo_datasets','media_files','form_submissions','reports','audit_logs'].map(table => (
            <div key={table} className="flex justify-between items-center px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-green-50/50">
              <span className="font-mono text-sm text-gray-700">{table}</span>
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">RLS Enabled</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel({ user }) {
  const [tab, setTab] = useState('users');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">User management, audit log, and system configuration</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabButton label="👥 Users"        active={tab==='users'}  onClick={() => setTab('users')} />
        <TabButton label="📋 Audit Log"    active={tab==='audit'}  onClick={() => setTab('audit')} />
        <TabButton label="⚙️ System"       active={tab==='system'} onClick={() => setTab('system')} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        {tab === 'users'  && <UsersTab currentUser={user} />}
        {tab === 'audit'  && <AuditTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}
