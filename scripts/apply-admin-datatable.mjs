import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

// Narrow, asserted source transformation: preserve existing forms, RPCs,
// confirmation dialogs, role gates and system status. Never modify the DB.
const path = 'frontend/src/pages/AdminPanel.jsx';
let source = readFileSync(path, 'utf8');
function replaceOnce(source, start, end, replacement, label) {
  const a = source.indexOf(start);
  if (a < 0 || source.indexOf(start, a + start.length) >= 0) throw new Error(`Expected one ${label} start`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Missing ${label} end`);
  return source.slice(0, a) + replacement + source.slice(b);
}
function section(source, name, next, transform) {
  const a = source.indexOf(name), b = source.indexOf(next, a);
  if (a < 0 || b < 0) throw new Error(`Missing section ${name}`);
  return source.slice(0,a) + transform(source.slice(a,b)) + source.slice(b);
}
source = source.replace("import { localised, i18nCols } from '../lib/contentLocale';", "import { localised, i18nCols } from '../lib/contentLocale';\nimport AdminDataTable from '../components/ui/AdminDataTable';");
if (!source.includes("import AdminDataTable from '../components/ui/AdminDataTable';")) throw new Error('Import insertion failed');
source = section(source, 'function UsersTab() {', '// ── Projects Tab', part => {
  part = replaceOnce(part, '      {loading ? (\n        <div className="text-sm text-gray-400 py-6">', '      {cred && (', `      <AdminDataTable title={t('adm.users')} rows={users} loading={loading} selection
        searchPlaceholder={t('adm.searchUsers') === 'adm.searchUsers' ? 'Search users…' : t('adm.searchUsers')}
        empty={t('adm.noUsers')} onRefresh={load}
        filters={[{key:'role',label:t('adm.role'),options:DB_ROLES.map(r=>({value:r.id,label:t(r.label)}))},{key:'active',label:t('adm.status'),value:u=>String(u.active),options:[{value:'true',label:'Active'},{value:'false',label:'Inactive'}]}]}
        columns={[
          {key:'full_name',label:t('adm.name'),required:true,render:u=><span className="font-semibold text-gray-800">{u.full_name}</span>},
          {key:'email',label:t('adm.email'),render:u=><span className="text-gray-500">{u.email}</span>},
          {key:'role',label:t('adm.role'),render:u=>{const role=DB_ROLES.find(r=>r.id===u.role);return <span className={\`text-xs px-2 py-1 rounded font-semibold \${role?.color||'bg-gray-100 text-gray-600'}\`}>{role?t(role.label):u.role}</span>;}},
          {key:'organisation',label:t('adm.organisation')},
          {key:'active',label:t('adm.status'),value:u=>u.active?1:0,render:u=><span className={\`text-xs font-medium \${u.active?'text-green-700':'text-gray-500'}\`}>● {u.active?'Active':'Inactive'}</span>},
        ]}
        rowActions={u=>[
          {label:t('pw.setPassword'),disabled:busy||!u.has_login,onClick:()=>setPasswordFor(u)},
          {label:t('adm.resetPassword'),disabled:busy||!u.has_login,onClick:()=>resetPassword(u)},
          {label:u.active?'Deactivate':'Activate',disabled:busy,onClick:()=>toggleActive(u)},
          ...(u.role==='project_manager'?[{label:t('adm.assignProjects'),disabled:busy,onClick:()=>setAssignFor(u)}]:[]),
          {label:t('adm.deleteLbl'),danger:true,disabled:busy,onClick:()=>removeUser(u)},
        ]}
      />

`, 'users table');
  return part;
});
source = section(source, 'function ProjectsTab() {', '// ── Audit Log Tab', part => {
  part = replaceOnce(part, '      {/* Projects table */}', '      {/* Delete confirmation */}', `      {/* Projects table */}
      <AdminDataTable title={t('adm.projects')} rows={projects} loading={loading} selection
        searchPlaceholder="Search projects…" empty={t('adm.noProjectsAdd')} onRefresh={load}
        filters={[{key:'status',label:t('adm.status'),options:STATUS_OPTIONS.map(s=>({value:s,label:s.charAt(0).toUpperCase()+s.slice(1)}))},{key:'category',label:t('adm.category'),options:CATEGORIES.map(c=>({value:c.id,label:t(c.label)}))}]}
        columns={[
          {key:'name',label:t('adm.projectName'),required:true,render:p=><span className="font-semibold text-gray-800">{p.name}</span>},
          {key:'code',label:t('adm.code'),render:p=><span className="font-mono text-xs">{p.code}</span>},
          {key:'category',label:t('adm.category'),render:p=><span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{p.category}</span>},
          {key:'lead_agency',label:t('adm.leadAgency')},
          {key:'budget_vuv',label:t('adm.budgetVuv'),value:p=>p.budget_vuv==null?null:Number(p.budget_vuv),align:'right',render:p=>p.budget_vuv==null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(p.budget_vuv)},
          {key:'provinces',label:t('adm.provinces')},
          {key:'status',label:t('adm.status'),render:p=><span className={\`text-xs px-2 py-1 rounded font-semibold \${p.status==='active'?'bg-green-100 text-green-700':p.status==='completed'?'bg-blue-100 text-blue-700':'bg-red-100 text-red-700'}\`}>{p.status}</span>},
        ]}
        rowActions={p=>[
          {label:t('adm.edit'),disabled:busy,onClick:()=>openEdit(p)},
          {label:t('adm.deleteLbl'),danger:true,disabled:busy,onClick:()=>setConfirmDel(p)},
        ]}
      />

`, 'projects table');
  return part;
});
source = section(source, 'function AuditTab() {', '// ── System Tab', part => {
  part = replaceOnce(part, '      <div className="flex flex-wrap items-end justify-between gap-3">', '      {err &&', `      <h2 className="text-base font-bold text-gray-800">{t('adm.auditLog')}</h2>

`, 'audit toolbar');
  part = replaceOnce(part, '      <div className="overflow-x-auto rounded-lg border border-gray-100">', '    </div>\n  );\n}', `      <AdminDataTable title={t('adm.auditLog')} rows={rows} loading={loading}
        searchPlaceholder={t('adm.searchAudit')} empty={t('adm.noAuditEntries')} onRefresh={load}
        pagination={{page,pageSize:PAGE_SIZE,total,onPageChange:setPage,search,onSearchChange:value=>{setPage(0);setSearch(value);}}}
        filters={[{key:'action',label:t('adm.action'),selected:action,onChange:value=>{setPage(0);setAction(value);},options:[{value:'INSERT',label:t('adm.insert')},{value:'UPDATE',label:t('adm.update')},{value:'DELETE',label:t('adm.deleteLbl')}]}]}
        columns={[
          {key:'changed_at',label:t('adm.when'),sortable:false,render:r=>fmt(r.changed_at)},
          {key:'actor_name',label:t('adm.user'),sortable:false,render:r=>r.actor_name||t('adm.systemActor')},
          {key:'action',label:t('adm.action'),sortable:false,render:r=><span className={\`px-2 py-1 rounded text-xs font-semibold \${ACTION_STYLE[r.action]||'bg-gray-100 text-gray-600'}\`}>{r.action}</span>},
          {key:'table_name',label:t('adm.table'),sortable:false,value:r=>\`\${r.schema_name}.\${r.table_name}\`,render:r=><span className="font-mono text-xs">{r.schema_name}.{r.table_name}</span>},
          {key:'record_id',label:t('adm.record'),sortable:false,render:r=><span className="font-mono text-xs">{r.record_id?String(r.record_id).slice(0,8):'—'}</span>},
        ]}
        rowActions={r=>[{label:expanded===r.id?'Hide':'Details',onClick:()=>setExpanded(expanded===r.id?null:r.id)}]}
        isExpanded={r=>expanded===r.id}
        expandedRow={r=><div className="grid gap-3 sm:grid-cols-2 p-2"><div><div className="text-xs font-semibold text-gray-500 mb-1">{t('adm.before')}</div><pre className="text-xs bg-gray-50 border rounded-lg p-2 overflow-x-auto max-h-56">{r.old_values?JSON.stringify(r.old_values,null,2):'—'}</pre></div><div><div className="text-xs font-semibold text-gray-500 mb-1">{t('adm.after')}</div><pre className="text-xs bg-gray-50 border rounded-lg p-2 overflow-x-auto max-h-56">{r.new_values?JSON.stringify(r.new_values,null,2):'—'}</pre></div></div>}
      />
`, 'audit table and footer');
  return part;
});
writeFileSync(path, source);
console.log('Integrated administration data tables without replacing CRUD or permissions.');
