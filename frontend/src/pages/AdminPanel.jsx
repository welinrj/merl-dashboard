import { useState } from 'react';
import { Users, ClipboardList, Server, Plus, CheckCircle, XCircle, UserCog } from 'lucide-react';
import { SYSTEM_USERS, AUDIT_LOG, PROJECTS } from '../mockData';

const ROLE_STYLE = {
  ROLE_ADMIN:        { label:'Administrator',    bg:'#fee2e2', color:'#991b1b' },
  ROLE_DOCC_SENIOR:  { label:'DoCC Senior',      bg:'#ede9fe', color:'#5b21b6' },
  ROLE_DOCC_MEO:     { label:'M&E Officer',      bg:'#dbeafe', color:'#1e40af' },
  ROLE_PROJ_MANAGER: { label:'Project Manager',  bg:'#fef3c7', color:'#92400e' },
  ROLE_PROJ_STAFF:   { label:'Project Staff',    bg:'#f3f4f6', color:'#374151' },
};

const DB_TABLES = [
  'users','projects','project_categories','project_memberships',
  'rbm_results_chains','indicators','indicator_updates',
  'datasets','dataset_rows','geo_datasets','media_files',
  'form_submissions','reports','audit_logs',
];

const SERVICES = [
  { name:'Supabase PostgreSQL 15 + PostGIS', status:'healthy', detail:'Primary database · RLS enabled' },
  { name:'Supabase Auth (GoTrue)',           status:'healthy', detail:'JWT authentication · 5 roles' },
  { name:'Supabase Storage',                status:'healthy', detail:'S3-compatible file storage' },
  { name:'Supabase Realtime',               status:'healthy', detail:'WebSocket subscriptions' },
  { name:'Edge Functions (Deno)',            status:'healthy', detail:'6 functions deployed' },
  { name:'React Frontend',                  status:'healthy', detail:'v18 · Vite · GitHub Pages' },
];

function TabButton({ label, icon: Icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:'0.5rem',
      padding:'0.5rem 1rem', borderRadius:7, border:'1.5px solid',
      fontSize:'0.8125rem', fontWeight:600, cursor:'pointer',
      transition:'all 0.15s',
      background: active ? 'var(--green-800)' : 'var(--white)',
      color: active ? '#fff' : 'var(--text-2)',
      borderColor: active ? 'var(--green-800)' : 'var(--border)',
    }}>
      <Icon size={14}/> {label}
    </button>
  );
}

function UsersTab({ currentUser }) {
  const [users, setUsers] = useState(SYSTEM_USERS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', role:'ROLE_PROJ_STAFF', project:'' });

  const addUser = () => {
    if (!form.name || !form.email) return;
    setUsers(prev => [...prev, { ...form, id:prev.length+1, active:true, last_login:null }]);
    setForm({ name:'', email:'', role:'ROLE_PROJ_STAFF', project:'' });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)' }}>System Users</div>
          <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:2 }}>{users.length} registered users</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"
          style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', fontSize:'0.8125rem' }}>
          <Plus size={14}/> Add User
        </button>
      </div>

      {showForm && (
        <div style={{ background:'var(--green-50)', border:'1px solid var(--green-100)', borderRadius:10, padding:'1.25rem', marginBottom:'1.25rem' }} className="animate-fade">
          <div style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-1)', marginBottom:'1rem' }}>New User</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            <div><label className="field-label">Full Name</label>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="field-input" placeholder="e.g. Alice Natapei"/></div>
            <div><label className="field-label">Email</label>
              <input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} className="field-input" type="email" placeholder="email@docc.gov.vu"/></div>
            <div><label className="field-label">Role</label>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className="field-input">
                {Object.entries(ROLE_STYLE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label className="field-label">Project (optional)</label>
              <select value={form.project} onChange={e=>setForm(p=>({...p,project:e.target.value}))} className="field-input">
                <option value="">No project assigned</option>
                {PROJECTS.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
              </select></div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', marginTop:'1rem' }}>
            <button onClick={addUser} className="btn-primary" style={{ fontSize:'0.8125rem', padding:'0.5rem 1rem' }}>Create User</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.5rem 1rem' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="data-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Role</th>
            <th>Project</th><th>Last Login</th><th>Status</th>
          </tr></thead>
          <tbody>
            {users.map(u => {
              const R = ROLE_STYLE[u.role] || ROLE_STYLE.ROLE_PROJ_STAFF;
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%', flexShrink:0,
                        background:'linear-gradient(135deg, var(--green-600), var(--green-500))',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'#fff', fontSize:'0.6875rem', fontWeight:700,
                      }}>
                        {u.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <span style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)' }}>{u.email}</td>
                  <td>
                    <span style={{ background:R.bg, color:R.color, borderRadius:4, padding:'0.125rem 0.5rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.03em' }}>
                      {R.label}
                    </span>
                  </td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)' }}>{u.project || '—'}</td>
                  <td style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background: u.active?'#d1fae5':'#f3f4f6', color:u.active?'#065f46':'#6b7280', borderRadius:9999, padding:'0.1rem 0.625rem', fontSize:'0.6875rem', fontWeight:700, textTransform:'uppercase' }}>
                      {u.active ? <CheckCircle size={10}/> : <XCircle size={10}/>}
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
    <div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)', marginBottom:'1.25rem' }}>
        Audit Log
      </div>
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="data-table">
          <thead><tr>
            <th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th>
          </tr></thead>
          <tbody>
            {AUDIT_LOG.map(e => (
              <tr key={e.id}>
                <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)', whiteSpace:'nowrap' }}>
                  {new Date(e.timestamp).toLocaleString()}
                </td>
                <td style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{e.user}</td>
                <td>
                  <span style={{ background:'var(--green-50)', color:'var(--green-700)', border:'1px solid var(--green-100)', borderRadius:4, padding:'0.1rem 0.5rem', fontSize:'0.75rem', fontWeight:500 }}>
                    {e.action}
                  </span>
                </td>
                <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)' }}>{e.resource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SystemTab() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      {/* Service health */}
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)', marginBottom:'1rem' }}>
          Service Health
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0.75rem' }}>
          {SERVICES.map(s => (
            <div key={s.name} style={{ display:'flex', alignItems:'center', gap:'0.875rem', background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'0.875rem 1rem', boxShadow:'var(--shadow-sm)' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#1a8c4e', boxShadow:'0 0 0 3px rgba(26,140,78,0.2)', flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-1)' }}>{s.name}</div>
                <div style={{ fontSize:'0.6875rem', color:'var(--text-3)' }}>{s.detail}</div>
              </div>
              <span style={{ marginLeft:'auto', background:'#d1fae5', color:'#065f46', borderRadius:9999, padding:'0.1rem 0.625rem', fontSize:'0.625rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                Healthy
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* RLS status */}
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)', marginBottom:'1rem' }}>
          Row Level Security — Database Tables
        </div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {DB_TABLES.map((t, i) => (
            <div key={t} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'0.625rem 1.25rem',
              borderBottom: i < DB_TABLES.length-1 ? '1px solid var(--border)' : 'none',
              background: i%2===0 ? 'var(--white)' : 'var(--green-50)',
            }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.8125rem', color:'var(--text-1)' }}>{t}</span>
              <span style={{ display:'flex', alignItems:'center', gap:'0.3rem', background:'#d1fae5', color:'#065f46', borderRadius:9999, padding:'0.1rem 0.625rem', fontSize:'0.625rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                <CheckCircle size={10}/> RLS Enabled
              </span>
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
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>System Administration</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          Admin Panel
        </h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          User management, audit log, and system configuration.
        </p>
      </div>

      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.5rem' }}>
        <TabButton label="Users"      icon={Users}         active={tab==='users'}  onClick={()=>setTab('users')}/>
        <TabButton label="Audit Log"  icon={ClipboardList} active={tab==='audit'}  onClick={()=>setTab('audit')}/>
        <TabButton label="System"     icon={Server}        active={tab==='system'} onClick={()=>setTab('system')}/>
      </div>

      {tab==='users'  && <UsersTab currentUser={user}/>}
      {tab==='audit'  && <AuditTab/>}
      {tab==='system' && <SystemTab/>}
    </div>
  );
}
