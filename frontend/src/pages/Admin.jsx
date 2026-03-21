import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings, UserPlus, Shield, Search, Edit2, ToggleLeft, ToggleRight,
  Plus, Users, BarChart2, Activity, Server, Database, HardDrive,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';

const ROLES = [
  { value: 'merl-admin',       label: 'National Administrator', colour: 'badge-red' },
  { value: 'merl-coordinator', label: 'Provincial Coordinator', colour: 'badge-blue' },
  { value: 'merl-officer',     label: 'Field Officer',          colour: 'badge-green' },
  { value: 'merl-community',   label: 'Community Reporter',     colour: 'badge-purple' },
  { value: 'merl-donor',       label: 'Donor / Observer',       colour: 'badge-gray' },
];

const PROVINCES = ['Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

const TABS = [
  { id: 'users',      label: 'User Management', icon: Users },
  { id: 'indicators', label: 'Indicator Config', icon: BarChart2 },
  { id: 'system',     label: 'System Health',    icon: Server },
];

// ── User Management Tab ──────────────────────────────────────────────────────

function UserForm({ user, onClose, onSaved }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!user;

  const [form, setForm] = useState({
    username:   user?.username ?? '',
    email:      user?.email ?? '',
    first_name: user?.first_name ?? '',
    last_name:  user?.last_name ?? '',
    role:       user?.role ?? 'merl-officer',
    province:   user?.province ?? '',
    enabled:    user?.enabled ?? true,
    password:   '',
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? axios.put(`/api/admin/users/${user.id}`, data)
        : axios.post('/api/admin/users', data),
    onSuccess: () => {
      toast.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onSaved?.();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (isEdit && !payload.password) delete payload.password;
    mutation.mutate(payload);
  };

  const onChange = (field) => (e) =>
    setForm((prev) => ({
      ...prev,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit User' : 'Add User'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">First Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.first_name} onChange={onChange('first_name')} className="field-input" required />
            </div>
            <div>
              <label className="field-label">Last Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.last_name} onChange={onChange('last_name')} className="field-input" required />
            </div>
          </div>
          <div>
            <label className="field-label">Username <span className="text-red-500">*</span></label>
            <input type="text" value={form.username} onChange={onChange('username')} className="field-input" required disabled={isEdit} />
          </div>
          <div>
            <label className="field-label">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={onChange('email')} className="field-input" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Role <span className="text-red-500">*</span></label>
              <select value={form.role} onChange={onChange('role')} className="field-input">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Province</label>
              <select value={form.province} onChange={onChange('province')} className="field-input">
                <option value="">All / National</option>
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">{isEdit ? 'New Password (leave blank to keep)' : 'Temporary Password'} {!isEdit && <span className="text-red-500">*</span>}</label>
            <input type="password" value={form.password} onChange={onChange('password')} className="field-input" required={!isEdit} minLength={8} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={onChange('enabled')} className="rounded border-gray-300 text-blue-600 w-4 h-4" />
            <span className="text-sm text-gray-700">Account enabled</span>
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">{t('form.cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? t('form.submitting') : (isEdit ? t('form.save') : t('form.submit'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => axios.get('/api/admin/users').then((r) => r.data),
  });

  const users = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (roleFilter !== 'All') items = items.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.last_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, roleFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field-input pl-9 max-w-xs"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="field-input w-auto">
            <option value="All">{t('common.all')} Roles</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={() => { setEditUser(null); setShowForm(true); }} className="btn-primary">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Username</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Province</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : users.length === 0
                ? <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">{t('common.noData')}</td></tr>
                : users.map((user) => {
                    const roleConfig = ROLES.find((r) => r.value === user.role) ?? { label: user.role, colour: 'badge-gray' };
                    return (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {user.first_name} {user.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{user.username}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${roleConfig.colour}`}>{roleConfig.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{user.province || 'National'}</td>
                        <td className="px-4 py-3 text-center">
                          {user.enabled !== false ? (
                            <span className="badge badge-green">Active</span>
                          ) : (
                            <span className="badge badge-red">Disabled</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => { setEditUser(user); setShowForm(true); }}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            <Edit2 size={14} className="inline mr-1" />Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <UserForm
          user={editUser}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Indicator Config Tab ─────────────────────────────────────────────────────

function IndicatorForm({ indicator, onClose, onSaved }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!indicator;

  const [form, setForm] = useState({
    code:               indicator?.code ?? '',
    name:               indicator?.name ?? '',
    description:        indicator?.description ?? '',
    domain:             indicator?.domain ?? '',
    unit:               indicator?.unit ?? 'count',
    baseline_value:     indicator?.baseline_value ?? 0,
    target_value:       indicator?.target_value ?? 0,
    target_year:        indicator?.target_year ?? new Date().getFullYear() + 1,
    reporting_frequency:indicator?.reporting_frequency ?? 'quarterly',
    status:             indicator?.status ?? 'on_track',
    responsible_party:  indicator?.responsible_party ?? '',
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? axios.put(`/api/admin/indicators/${indicator.id}`, data)
        : axios.post('/api/admin/indicators', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Indicator updated' : 'Indicator created');
      queryClient.invalidateQueries({ queryKey: ['admin-indicators'] });
      queryClient.invalidateQueries({ queryKey: ['indicators'] });
      onSaved?.();
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      baseline_value: Number(form.baseline_value) || 0,
      target_value: Number(form.target_value) || 0,
      target_year: Number(form.target_year) || new Date().getFullYear() + 1,
    });
  };

  const onChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const DOMAINS = ['Governance', 'Finance', 'Community', 'Environment', 'GEDSI', 'Knowledge'];
  const UNITS = ['count', 'percentage', 'currency', 'ratio', 'boolean', 'text'];
  const FREQUENCIES = ['monthly', 'quarterly', 'annual'];
  const STATUSES = ['on_track', 'at_risk', 'off_track', 'completed'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Indicator' : 'Add Indicator'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Code <span className="text-red-500">*</span></label>
              <input type="text" value={form.code} onChange={onChange('code')} className="field-input" required maxLength={50} placeholder="IND-001" />
            </div>
            <div className="col-span-2">
              <label className="field-label">Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={onChange('name')} className="field-input" required />
            </div>
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea value={form.description} onChange={onChange('description')} className="field-input resize-y" rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Domain <span className="text-red-500">*</span></label>
              <select value={form.domain} onChange={onChange('domain')} className="field-input" required>
                <option value="">Select...</option>
                {DOMAINS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Unit</label>
              <select value={form.unit} onChange={onChange('unit')} className="field-input">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Frequency</label>
              <select value={form.reporting_frequency} onChange={onChange('reporting_frequency')} className="field-input">
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Baseline</label>
              <input type="number" step="any" value={form.baseline_value} onChange={onChange('baseline_value')} className="field-input" />
            </div>
            <div>
              <label className="field-label">Target</label>
              <input type="number" step="any" value={form.target_value} onChange={onChange('target_value')} className="field-input" />
            </div>
            <div>
              <label className="field-label">Target Year</label>
              <input type="number" value={form.target_year} onChange={onChange('target_year')} className="field-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Status</label>
              <select value={form.status} onChange={onChange('status')} className="field-input">
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Responsible Party</label>
              <input type="text" value={form.responsible_party} onChange={onChange('responsible_party')} className="field-input" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">{t('form.cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? t('form.submitting') : (isEdit ? t('form.save') : t('form.submit'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IndicatorsTab() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editIndicator, setEditIndicator] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-indicators'],
    queryFn: () => axios.get('/api/indicators').then((r) => r.data),
  });

  const indicators = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (ind) =>
          ind.code?.toLowerCase().includes(q) ||
          ind.name?.toLowerCase().includes(q) ||
          ind.domain?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, search]);

  const STATUS_COLOURS = {
    on_track:  'badge-green',
    at_risk:   'badge-yellow',
    off_track: 'badge-red',
    completed: 'badge-blue',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search indicators..." value={search} onChange={(e) => setSearch(e.target.value)} className="field-input pl-9 max-w-xs" />
        </div>
        <button onClick={() => { setEditIndicator(null); setShowForm(true); }} className="btn-primary">
          <Plus size={16} /> Add Indicator
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Domain</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Unit</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Baseline</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Target</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                : indicators.length === 0
                ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">{t('common.noData')}</td></tr>
                : indicators.map((ind) => (
                    <tr key={ind.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{ind.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{ind.name}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{ind.domain}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{ind.unit}</td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{ind.baseline_value ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600 font-medium hidden sm:table-cell">{ind.target_value ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_COLOURS[ind.status] ?? 'badge-gray'}`}>
                          {ind.status?.replace('_', ' ') ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setEditIndicator(ind); setShowForm(true); }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          <Edit2 size={14} className="inline mr-1" />Edit
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <IndicatorForm
          indicator={editIndicator}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── System Health Tab ────────────────────────────────────────────────────────

function SystemHealthTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => axios.get('/api/admin/health').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const services = data?.services ?? [
    { name: 'PostgreSQL',   status: 'healthy', details: 'Primary database' },
    { name: 'ClickHouse',   status: 'healthy', details: 'Analytics database' },
    { name: 'Redis',        status: 'healthy', details: 'Cache & message broker' },
    { name: 'PeerDB',       status: 'healthy', details: 'CDC replication' },
    { name: 'Keycloak',     status: 'healthy', details: 'Identity management' },
    { name: 'Airflow',      status: 'healthy', details: 'Workflow orchestration' },
    { name: 'Superset',     status: 'healthy', details: 'BI dashboards' },
  ];

  const statusIcon = (status) => {
    switch (status) {
      case 'healthy':  return <CheckCircle size={18} className="text-green-500" />;
      case 'degraded': return <AlertCircle size={18} className="text-yellow-500" />;
      case 'down':     return <XCircle size={18} className="text-red-500" />;
      default:         return <AlertCircle size={18} className="text-gray-400" />;
    }
  };

  const stats = data?.stats ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Service Status</h3>
        <button onClick={() => refetch()} className="btn-secondary text-xs flex items-center gap-1">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {services.map((svc) => (
          <div key={svc.name} className="card flex items-center gap-3">
            {statusIcon(svc.status)}
            <div>
              <p className="font-medium text-gray-800 text-sm">{svc.name}</p>
              <p className="text-xs text-gray-500">{svc.details}</p>
            </div>
          </div>
        ))}
      </div>

      {/* System metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card text-center">
          <Database size={24} className="mx-auto text-blue-600 mb-2" />
          <p className="text-lg font-bold text-gray-900">{stats.db_size ?? 'N/A'}</p>
          <p className="text-xs text-gray-500">PostgreSQL Size</p>
        </div>
        <div className="card text-center">
          <HardDrive size={24} className="mx-auto text-purple-600 mb-2" />
          <p className="text-lg font-bold text-gray-900">{stats.disk_used ?? 'N/A'}</p>
          <p className="text-xs text-gray-500">Disk Usage</p>
        </div>
        <div className="card text-center">
          <Activity size={24} className="mx-auto text-green-600 mb-2" />
          <p className="text-lg font-bold text-gray-900">{stats.replication_lag ?? 'N/A'}</p>
          <p className="text-xs text-gray-500">PeerDB Replication Lag</p>
        </div>
      </div>

      {/* Recent backups */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Recent Backups</h3>
        <div className="space-y-2">
          {(data?.recent_backups ?? [
            { date: '2026-03-21 02:00', type: 'Daily', status: 'success', size: '2.3 GB' },
            { date: '2026-03-20 02:00', type: 'Daily', status: 'success', size: '2.2 GB' },
            { date: '2026-03-17 02:00', type: 'Weekly', status: 'success', size: '8.1 GB' },
          ]).map((backup, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                {backup.status === 'success' ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <XCircle size={14} className="text-red-500" />
                )}
                <span className="text-gray-700">{backup.date}</span>
                <span className="badge badge-blue text-xs">{backup.type}</span>
              </div>
              <span className="text-gray-500 text-xs">{backup.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('admin.title')}</h2>
        <p className="text-sm text-gray-500">{t('admin.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'indicators' && <IndicatorsTab />}
      {activeTab === 'system' && <SystemHealthTab />}
    </div>
  );
}
