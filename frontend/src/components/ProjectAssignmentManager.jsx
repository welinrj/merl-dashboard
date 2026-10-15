import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { dbErrorMessage } from '../lib/dbError';
import AssignProjectsModal from './AssignProjectsModal';

export default function ProjectAssignmentManager() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    supabase.rpc('list_assignable_users').then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { setError(dbErrorMessage(error)); return; }
      setUsers((data || []).filter(user => user.role === 'project_manager'));
    });
    return () => { alive = false; };
  }, []);
  const user = users.find(user => user.id === selected);
  return <section className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
    <h2 style={{ fontSize: '1rem', margin: '0 0 .6rem' }}>{t('roleWorkflow.assignments')}</h2>
    {error ? <p role="alert">{error}</p> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'end' }}>
      <label style={{ flex: '1 1 220px', minWidth: 0 }}>{t('roleWorkflow.manager')}
        <select className="field-input" value={selected} disabled={loading} onChange={e => setSelected(e.target.value)}>
          <option value="">{loading ? t('common.loading') : t('roleWorkflow.chooseManager')}</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-secondary" disabled={!user} onClick={() => setOpen(true)}>{t('roleWorkflow.manageAssignments')}</button>
    </div>}
    {open && user && <AssignProjectsModal user={user} onClose={() => setOpen(false)} />}
  </section>;
}
