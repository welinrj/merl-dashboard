// =============================================================================
// ReviewApproval.jsx — DoCC M&E Officer Review & Approval workspace (spec §19-21).
// Portfolio-wide queue of reporting-period submissions with Review / Return /
// Approve / Reopen actions. Reads public.v_reporting_periods (+ v_projects for
// codes) and drives the SECURITY DEFINER workflow RPCs, which enforce that only
// the DoCC M&E Officer (or System Admin) may act.
// =============================================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { ClipboardCheck, CheckCircle2, RotateCcw, Eye, Unlock, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { confirmDialog, promptDialog } from '../lib/confirm';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';

const REVIEWER_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-VU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const isOverdue = r => r.period_end && r.submission_status !== 'approved' && new Date(r.period_end) < new Date();

function Kpi({ label, value, col, Icon }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${col}18`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-1)' }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function ReviewApproval({ user }) {
  const canReview = !!user && REVIEWER_ROLES.includes(user.role);
  const [rows, setRows] = useState([]);
  const [projById, setProjById] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('queue'); // queue | all | approved
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rp, pj] = await Promise.all([
      supabase.from('v_reporting_periods').select('*'),
      supabase.from('v_projects').select('id, code, name'),
    ]);
    setRows(rp.error ? [] : (rp.data ?? []));
    const map = {};
    (pj.data ?? []).forEach(p => { map[p.id] = p; });
    setProjById(map);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const kpi = useMemo(() => {
    const k = { submitted: 0, reviewed: 0, returned: 0, approved: 0, overdue: 0, reopened: 0 };
    rows.forEach(r => {
      if (k[r.submission_status] !== undefined) k[r.submission_status] += 1;
      if (isOverdue(r)) k.overdue += 1;
      if (r.reopened_at) k.reopened += 1;
    });
    return k;
  }, [rows]);

  const visible = useMemo(() => {
    const base = filter === 'approved'
      ? rows.filter(r => r.submission_status === 'approved')
      : filter === 'all'
        ? rows
        : rows.filter(r => ['submitted', 'reviewed', 'returned'].includes(r.submission_status));
    // Actionable first, then by submitted/updated date desc.
    const rank = { submitted: 0, reviewed: 1, returned: 2, draft: 3, approved: 4 };
    return [...base].sort((a, b) =>
      (rank[a.submission_status] - rank[b.submission_status]) ||
      ((b.submitted_at ?? b.created_at ?? '') > (a.submitted_at ?? a.created_at ?? '') ? 1 : -1));
  }, [rows, filter]);

  const act = async (rpc, params, okMsg) => {
    setBusy(params.p_id);
    const { error } = await supabase.rpc(rpc, params);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(okMsg);
    load();
  };

  const doReview = r => act('review_reporting_period', { p_id: r.id, p_decision: 'review', p_comments: null }, 'Marked under review');
  const doReturn = async r => {
    const c = await promptDialog({ title:'Return for correction', label:'What needs correction?', required:true, multiline:true,
      message:'The Project Manager will see this comment on the returned submission.' });
    if (c == null || !c.trim()) return;
    act('review_reporting_period', { p_id: r.id, p_decision: 'return', p_comments: c.trim() }, 'Returned for correction');
  };
  const doApprove = async r => {
    const ok = await confirmDialog({
      title: 'Approve this reporting period?',
      message: 'Approved information becomes the official project data used by dashboards and generated reports, and the period is locked. Continue?',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    act('review_reporting_period', { p_id: r.id, p_decision: 'approve', p_comments: r.review_comments ?? null }, 'Approved and locked');
  };
  const doReopen = async r => {
    const reason = await promptDialog({ title:'Reopen reporting period', label:'Reason for reopening', required:true, multiline:true,
      message:'This approved period will return to draft for correction. The reason is recorded in the audit trail.' });
    if (reason == null || !reason.trim()) return;
    act('reopen_reporting_period', { p_id: r.id, p_reason: reason.trim() }, 'Reporting period reopened');
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1200 }}>
      <PageHeader
        icon={ClipboardCheck}
        title="Review & Approval"
        subtitle="Reporting-period submissions across the portfolio. The DoCC M&E Officer reviews, returns for correction, and approves."
      />

      {!canReview && (
        <div className="card" style={{ padding: '0.7rem 0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-2)' }}>
          <AlertTriangle size={16} /> Review and approval are restricted to the DoCC M&amp;E Officer.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid-kpi" style={{ marginBottom: '1rem' }}>
        <Kpi label="Awaiting Review" value={kpi.submitted} col="#2563eb" Icon={Eye} />
        <Kpi label="Under Review"    value={kpi.reviewed}  col="#7c3aed" Icon={ClipboardCheck} />
        <Kpi label="Returned"        value={kpi.returned}  col="#d97706" Icon={RotateCcw} />
        <Kpi label="Approved"        value={kpi.approved}  col="#16a34a" Icon={CheckCircle2} />
        <Kpi label="Overdue"         value={kpi.overdue}   col="#b3402f" Icon={Clock} />
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[['queue', 'Review queue'], ['approved', 'Approved'], ['all', 'All periods']].map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding: '0.35rem 0.8rem', borderRadius: 9999, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${filter === k ? 'var(--green-600)' : 'var(--border)'}`,
              background: filter === k ? 'var(--green-50)' : 'var(--white)', color: filter === k ? 'var(--green-700)' : 'var(--text-2)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Queue */}
      <DataTable
        rows={visible}
        keyField="id"
        loading={loading}
        minWidth={880}
        searchPlaceholder="Search project, period or submitter…"
        searchable={(r) => {
          const p = projById[r.project_id];
          return `${p?.code || ''} ${p?.name || ''} ${r.period_label || ''} ${r.reporting_officer_name || ''}`;
        }}
        empty={{
          icon: CheckCircle2,
          title: filter === 'queue' ? 'No reports awaiting review' : 'No reporting periods',
          description: filter === 'queue'
            ? "You're up to date — nothing needs your review right now."
            : 'Reporting periods will appear here once projects begin reporting.',
        }}
        columns={[
          { key: 'project', header: 'Project', sortable: true,
            sortValue: (r) => projById[r.project_id]?.code || '',
            render: (r) => {
              const p = projById[r.project_id];
              return (
                <>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.8125rem' }}>{p?.code ?? '—'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? ''}</div>
                </>
              );
            } },
          { key: 'period_label', header: 'Reporting Period', sortable: true,
            render: (r) => (
              <span style={{ fontSize: '0.8rem' }}>
                {r.period_label}
                {isOverdue(r) && <StatusBadge tone="danger" label="Overdue" />}
                {r.reopened_at && <span title={r.reopen_reason || ''} style={{ marginLeft: 6 }}><StatusBadge tone="info" label="Reopened" /></span>}
              </span>
            ) },
          { key: 'reporting_officer_name', header: 'Submitted By', sortable: true,
            render: (r) => <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{r.reporting_officer_name ?? '—'}</span> },
          { key: 'submitted_at', header: 'Submitted', sortable: true,
            render: (r) => <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(r.submitted_at)}</span> },
          { key: 'submission_status', header: 'Status', sortable: true,
            render: (r) => (
              <>
                <StatusBadge status={r.submission_status} />
                {r.submission_status === 'returned' && r.review_comments && (
                  <div style={{ fontSize: '0.68rem', color: '#8a6416', marginTop: 3, maxWidth: 220 }}>“{r.review_comments}”</div>
                )}
              </>
            ) },
          { key: '_actions', header: 'Actions', align: 'right',
            render: (r) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                {canReview && ['submitted', 'reviewed'].includes(r.submission_status) && (
                  <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {r.submission_status === 'submitted' && (
                      <button disabled={busy === r.id} onClick={() => doReview(r)} style={qbtn('#7c3aed')}><Eye size={13} /> Review</button>
                    )}
                    <button disabled={busy === r.id} onClick={() => doReturn(r)} style={qbtn('#d97706')}><RotateCcw size={13} /> Return</button>
                    <button disabled={busy === r.id} onClick={() => doApprove(r)} style={qbtn('#16a34a')}><CheckCircle2 size={13} /> Approve</button>
                  </span>
                )}
                {canReview && r.submission_status === 'approved' && (
                  <button disabled={busy === r.id} onClick={() => doReopen(r)} style={qbtn('#7c3aed')}><Unlock size={13} /> Reopen</button>
                )}
                {(!canReview || ['draft'].includes(r.submission_status)) && <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
              </span>
            ) },
        ]}
      />
    </div>
  );
}

const qbtn = col => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.55rem', borderRadius: 8,
  border: 'none', background: col, color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
});
