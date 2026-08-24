// =============================================================================
// NotificationBell.jsx — header notifications (spec §58).
// A lightweight, role-aware notification centre driven by the reporting
// workflow: reports awaiting review (DoCC M&E Officer / Admin), periods returned
// for correction and overdue reporting (Project Manager / Data Entry). Reads the
// RLS-scoped public.v_reporting_periods view, so each user sees only their remit.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// One icon: the bell that opens the panel.
import { Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';

const REVIEWER = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];
const EDITOR = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER', 'ROLE_DATA_ENTRY'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function NotificationBell({ user }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [projById, setProjById] = useState({});

  const load = useCallback(async () => {
    const [rp, pj] = await Promise.all([
      supabase.from('v_reporting_periods').select('id, project_id, period_label, period_end, submission_status, review_comments'),
      supabase.from('v_projects').select('id, code'),
    ]);
    setRows(rp.data ?? []);
    const m = {};
    (pj.data ?? []).forEach((p) => { m[p.id] = p.code; });
    setProjById(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  const role = user?.role;
  const isReviewer = REVIEWER.includes(role);
  const isEditor = EDITOR.includes(role);

  const items = useMemo(() => {
    const out = [];
    const code = (id) => projById[id] || 'Project';
    if (isReviewer) {
      rows.filter((r) => ['submitted', 'reviewed'].includes(r.submission_status)).forEach((r) => out.push({
        id: `rev-${r.id}`, accent: '#2563eb',
        title: `${code(r.project_id)} · ${r.period_label}`, note: 'Awaiting your review', to: '/review',
      }));
    }
    if (isEditor) {
      rows.filter((r) => r.submission_status === 'returned').forEach((r) => out.push({
        id: `ret-${r.id}`, accent: '#d97706',
        title: `${code(r.project_id)} · ${r.period_label}`, note: r.review_comments ? `Returned: ${r.review_comments}` : 'Returned for correction', to: '/merl-reporting',
      }));
      const t = todayIso();
      rows.filter((r) => r.submission_status !== 'approved' && r.period_end && r.period_end.slice(0, 10) < t).forEach((r) => out.push({
        id: `od-${r.id}`, accent: '#b3402f',
        title: `${code(r.project_id)} · ${r.period_label}`, note: 'Reporting period overdue', to: '/merl-reporting',
      }));
    }
    return out.slice(0, 20);
  }, [rows, projById, isReviewer, isEditor]);

  const count = items.length;

  return (
    <div style={{ position: 'relative' }}>
      <button className="dsh-bell" title="Notifications" aria-label={`Notifications${count ? ` (${count})` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} aria-hidden="true" />
        {count > 0 && <span className="dsh-bell-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 320, maxWidth: '90vw',
            background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>
              Notifications{count > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {count}</span>}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {count === 0 ? (
                <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>
                  No unread notifications.
                </div>
              ) : items.map((it) => (
                <button key={it.id} onClick={() => { setOpen(false); nav(it.to); }}
                  style={{ width: '100%', display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0.9rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: '0.32rem', background: it.accent }} />
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
