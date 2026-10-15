import { createPortal } from 'react-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
export default function AssignProjectsModal({ user, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const dialog = useRef(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
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
    if (pj.error || as.error) { setErr(dbErrorMessage(pj.error || as.error)); setLoading(false); return; }
    setErr('');
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

  return createPortal(
    <dialog ref={dialog} aria-label={t('adm.assignedProjects')} onCancel={onClose} className="fixed inset-0 p-4 overflow-y-auto" style={{ width: '100%', maxWidth: 'none', height: '100%', maxHeight: 'none', margin: 0, border: 0, background: 'rgba(0,0,0,.4)' }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 mt-12 mx-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{t('adm.assignedProjects')}</h3>
        <p className="text-sm text-gray-500 mt-1">
          {t('roleWorkflow.assignmentHint', { name: user.full_name })}
        </p>
        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">{t('adm.loading')}</div>
          ) : err ? (<button type="button" className="btn btn-secondary" onClick={load}>{t('ppa.retry')}</button>) : projects.length === 0 ? (
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
          <span className="text-xs text-gray-400">{t('roleWorkflow.assignedCount', { count: assigned.size })}</span>
          <button onClick={onClose} className="bg-green-700 text-white text-sm font-semibold rounded-lg px-5 py-2 hover:bg-green-800">{t('adm.done')}</button>
        </div>
      </div>
    </dialog>, document.body
  );
}

