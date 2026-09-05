// =============================================================================
// NotificationBell.jsx — role-aware reporting notifications.
// Reads the RLS-scoped reporting views and presents only actionable workflow
// events. Status colour is semantic; the panel itself uses the same restrained
// geometry as the rest of the application.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from './ui/icons';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';

const REVIEWER = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];
const EDITOR = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function NotificationBell({ user }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [projById, setProjById] = useState({});

  const load = useCallback(async () => {
    const [rp, pj] = await Promise.all([
      localised(() => supabase.from('v_reporting_periods').select(i18nCols('id, project_id, period_label, period_end, submission_status, review_comments'))),
      localised(() => supabase.from('v_projects').select(i18nCols('id, code'))),
    ]);
    setRows(rp.data ?? []);
    const m = {};
    (pj.data ?? []).forEach((p) => { m[p.id] = p.code; });
    setProjById(m);
  }, [lang]);
  useEffect(() => { load(); }, [load]);

  const role = user?.role;
  const isReviewer = REVIEWER.includes(role);
  const isEditor = EDITOR.includes(role);

  const items = useMemo(() => {
    const out = [];
    const code = (id) => projById[id] || t('notif.project');
    if (isReviewer) {
      rows.filter((r) => ['submitted', 'reviewed'].includes(r.submission_status)).forEach((r) => out.push({
        id: `rev-${r.id}`, accent: '#4d73a5',
        title: `${code(r.project_id)} · ${r.period_label}`, note: t('notif.awaiting'), to: '/review',
      }));
    }
    if (isEditor) {
      rows.filter((r) => r.submission_status === 'returned').forEach((r) => out.push({
        id: `ret-${r.id}`, accent: '#c28a20',
        title: `${code(r.project_id)} · ${r.period_label}`, note: r.review_comments ? t('notif.returnedWhy', { reason: r.review_comments }) : t('notif.returned'), to: '/merl-reporting',
      }));
      const today = todayIso();
      rows.filter((r) => r.submission_status !== 'approved' && r.period_end && r.period_end.slice(0, 10) < today).forEach((r) => out.push({
        id: `od-${r.id}`, accent: '#b3402f',
        title: `${code(r.project_id)} · ${r.period_label}`, note: t('notif.overdue'), to: '/merl-reporting',
      }));
    }
    return out.slice(0, 20);
  }, [rows, projById, isReviewer, isEditor, t]);

  const count = items.length;

  return (
    <div style={{ position: 'relative' }}>
      <button className="dsh-bell" title={t('notif.title')} aria-label={count ? t('notif.titleCount', { count }) : t('notif.title')} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} aria-hidden="true" />
        {count > 0 && <span className="dsh-bell-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 320, maxWidth: '90vw',
            background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>
              {t('notif.title')}{count > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {count}</span>}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {count === 0 ? (
                <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>
                  {t('notif.none')}
                </div>
              ) : items.map((it) => (
                <button key={it.id} onClick={() => { setOpen(false); nav(it.to); }}
                  style={{ width: '100%', display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0.9rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: '0.34rem', background: it.accent }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
