// =============================================================================
// ReviewApproval.jsx — DoCC M&E Officer Review & Approval workspace (spec §19-21).
// Portfolio-wide queue of reporting-period submissions with Review / Return /
// Approve / Reopen actions. Reads public.v_reporting_periods (+ v_projects for
// codes) and drives the SECURITY DEFINER workflow RPCs, which enforce that only
// the DoCC M&E Officer (or System Admin) may act.
// =============================================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, RotateCcw, Eye, Unlock, AlertTriangle, X, FileText } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import { confirmDialog, promptDialog } from '../lib/confirm';
import { dbErrorMessage } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import StatTile from '../components/ui/StatTile';
import { useTranslation } from 'react-i18next';

// Read-only modules summarised in the review drawer so the officer can see what
// they are approving before they act. Period-scoped modules are matched on the
// period label; risks & issues are project-scoped.
const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('en-VU'));
const REVIEW_SECTIONS = [
  { key: 'indicator_progress', label: 'merl.modIndicatorProgress', form: 'Form 4', view: 'v_indicator_progress', periodScoped: true,
    line: (r) => `${r.indicator_code || '—'} · cumulative ${fmtNum(r.cumulative_actual)}${r.achievement_pct != null ? ` · ${Math.round(r.achievement_pct)}%` : ''}` },
  { key: 'financial_progress', label: 'merl.modFinancialProgress', form: 'Form 6', view: 'v_financial_progress', periodScoped: true,
    line: (r) => `Cumulative exp. ${fmtNum(r.cumulative_expenditure)}${r.utilisation_pct != null ? ` · ${Math.round(r.utilisation_pct)}% utilised` : ''}` },
  { key: 'beneficiaries', label: 'merl.modBeneficiaries', form: 'Form 8', view: 'v_beneficiaries', periodScoped: true,
    line: (r) => `${r.location || 'All'} · direct ${fmtNum(r.total_direct)} (F ${fmtNum(r.female)} / M ${fmtNum(r.male)} / PWD ${fmtNum(r.persons_with_disability)})` },
  { key: 'learning_updates', label: 'merl.modLearning', form: 'Form 10', view: 'v_learning_updates', periodScoped: true,
    line: (r) => (r.key_achievements || r.major_results || r.lessons_learned || 'Recorded').slice(0, 120) },
  { key: 'evidence', label: 'merl.modEvidence', form: 'Form 12', view: 'v_evidence', periodScoped: true,
    line: (r) => `${r.title || '—'}${r.verification_status ? ` · ${r.verification_status}` : ''}` },
  { key: 'risks_issues', label: 'merl.modRisks', form: 'Form 9', view: 'v_risks_issues', periodScoped: false,
    line: (r) => `${r.code || ''} ${(r.description || '').slice(0, 80)}${r.risk_rating ? ` · ${r.risk_rating}` : ''}`.trim() },
];

const REVIEWER_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-VU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const isOverdue = r => r.period_end && r.submission_status !== 'approved' && new Date(r.period_end) < new Date();

export default function ReviewApproval({ user }) {
  const { t } = useTranslation();
  const canReview = !!user && REVIEWER_ROLES.includes(user.role);
  const [rows, setRows] = useState([]);
  const [projById, setProjById] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('queue'); // queue | all | approved
  const [busy, setBusy] = useState(null);
  const [detail, setDetail] = useState(null); // reporting-period row open in the review drawer

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
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(okMsg);
    setDetail(null);
    load();
  };

  const doReview = r => act('review_reporting_period', { p_id: r.id, p_decision: 'review', p_comments: null }, t('merl.markedUnderReview'));
  const doReturn = async r => {
    const c = await promptDialog({ title:t('merl.returnForCorrection'), label:t('merl.whatNeedsCorrection'), required:true, multiline:true,
      message:t('merl.pmWillSee') });
    if (c == null || !c.trim()) return;
    act('review_reporting_period', { p_id: r.id, p_decision: 'return', p_comments: c.trim() }, t('merl.returnedToast'));
  };
  const doApprove = async r => {
    const ok = await confirmDialog({
      title: t('merl.approveConfirm'),
      message: t('merl.approveConfirmBody'),
      confirmLabel: t('merl.approve'),
    });
    if (!ok) return;
    act('review_reporting_period', { p_id: r.id, p_decision: 'approve', p_comments: r.review_comments ?? null }, t('merl.approvedLockedToast'));
  };
  const doReopen = async r => {
    const reason = await promptDialog({ title:t('merl.reopenPeriod'), label:t('merl.reopenReason'), required:true, multiline:true,
      message:t('merl.reopenConfirmBody') });
    if (reason == null || !reason.trim()) return;
    act('reopen_reporting_period', { p_id: r.id, p_reason: reason.trim() }, t('merl.periodReopenedToast'));
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1200 }}>
      <PageHeader
        title={t('merl.reviewTitle')}
        subtitle={t('merl.reviewSubtitle')}
      />

      {!canReview && (
        <div className="card" style={{ padding: '0.7rem 0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-2)' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} aria-hidden="true" /> {t('merl.reviewRestricted')}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid-kpi" style={{ marginBottom: '1rem' }}>
        <StatTile label={t('merl.awaitingReview')} value={kpi.submitted} />
        <StatTile label={t('merl.underReview')} value={kpi.reviewed} />
        <StatTile label={t('merl.returned')} value={kpi.returned} status={kpi.returned ? 'amber' : 'green'} />
        <StatTile label={t('merl.approved')} value={kpi.approved} />
        <StatTile label={t('merl.overdue')} value={kpi.overdue} status={kpi.overdue ? 'red' : 'green'} />
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
                {isOverdue(r) && <StatusBadge tone="danger" label={t('merl.overdue')} />}
                {r.reopened_at && <span title={r.reopen_reason || ''} style={{ marginLeft: 6 }}><StatusBadge tone="info" label={t('merl.reopened')} /></span>}
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
              <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                {r.submission_status !== 'draft' && (
                  <button onClick={() => setDetail(r)} style={rowBtnGhost}><FileText size={13} /> {t('merl.view')}</button>
                )}
                {canReview && ['submitted', 'reviewed'].includes(r.submission_status) && (
                  <>
                    {r.submission_status === 'submitted' && (
                      <button disabled={busy === r.id} onClick={() => doReview(r)} style={{ ...rowBtnSecondary, ...(busy === r.id ? disabledBtn : null) }}><Eye size={13} /> {t('merl.review')}</button>
                    )}
                    <button disabled={busy === r.id} onClick={() => doReturn(r)} style={{ ...rowBtnWarning, ...(busy === r.id ? disabledBtn : null) }}><RotateCcw size={13} /> {t('merl.returnLbl')}</button>
                    <button disabled={busy === r.id} onClick={() => doApprove(r)} style={{ ...rowBtnPrimary, ...(busy === r.id ? disabledBtn : null) }}><CheckCircle2 size={13} /> {t('merl.approve')}</button>
                  </>
                )}
                {canReview && r.submission_status === 'approved' && (
                  <button disabled={busy === r.id} onClick={() => doReopen(r)} style={{ ...rowBtnSecondary, ...(busy === r.id ? disabledBtn : null) }}><Unlock size={13} /> {t('merl.reopen')}</button>
                )}
                {(!canReview && r.submission_status === 'draft') && <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
              </span>
            ) },
        ]}
      />

      {detail && (
        <SubmissionDrawer
          row={detail}
          project={projById[detail.project_id]}
          canReview={canReview}
          busy={busy === detail.id}
          onClose={() => setDetail(null)}
          onReview={() => doReview(detail)}
          onReturn={() => doReturn(detail)}
          onApprove={() => doApprove(detail)}
          onReopen={() => doReopen(detail)}
        />
      )}
    </div>
  );
}

// Read-only review drawer: loads the reported records for a period across all
// modules so the officer can see what they are approving before acting.
function SubmissionDrawer({ row, project, canReview, busy, onClose, onReview, onReturn, onApprove, onReopen }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    Promise.all(REVIEW_SECTIONS.map(async (s) => {
      let q = supabase.from(s.view).select('*').eq('project_id', row.project_id);
      if (s.periodScoped) q = q.eq('reporting_period', row.period_label);
      const { data: rows } = await q;
      return [s.key, rows ?? []];
    })).then((entries) => { if (alive) setData(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [row.project_id, row.period_label]);

  const status = row.submission_status;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('merl.periodDetail')}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)' }} />
      <div style={{ position: 'relative', width: 'min(560px, 100%)', maxWidth: '100%', height: '100%', background: 'var(--surface-1, var(--white))',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700 }}>{project?.code ?? '—'}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>{project?.name ?? ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{row.period_label}</span>
              <StatusBadge status={status} />
            </div>
          </div>
          <button onClick={onClose} aria-label={t('ui.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Meta */}
        <div style={{ padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.75rem' }}>
          <span>{t('merl.submittedBy')} <strong style={{ color: 'var(--text-1)' }}>{row.reporting_officer_name ?? '—'}</strong></span>
          <span>{t('merl.submittedOn')} <strong style={{ color: 'var(--text-1)' }}>{fmtDate(row.submitted_at)}</strong></span>
          {row.period_start && <span>{t('merl.periodLbl')} <strong style={{ color: 'var(--text-1)' }}>{fmtDate(row.period_start)} – {fmtDate(row.period_end)}</strong></span>}
          {row.reopened_at && <span style={{ color: '#8a6416' }}>Reopened: {fmtDate(row.reopened_at)}</span>}
        </div>

        {status === 'returned' && row.review_comments && (
          <div style={{ margin: '0.75rem 1.1rem 0', padding: '0.6rem 0.8rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: '0.78rem', color: '#8a6416' }}>
            <strong>{t('merl.returnedForCorrection')}</strong> {row.review_comments}
          </div>
        )}

        {/* Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {data == null ? (
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('merl.loadingReported')}</p>
          ) : REVIEW_SECTIONS.map((s) => {
            const rows = data[s.key] || [];
            return (
              <div key={s.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--text-1)' }}>{t(s.label)}</strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{s.form}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: rows.length ? 'var(--green-700)' : 'var(--text-3)' }}>
                    {rows.length} record{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', fontStyle: 'italic', paddingLeft: '0.1rem' }}>{t('merl.noDataReported')}</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {rows.slice(0, 8).map((r) => (
                      <li key={r.id} style={{ fontSize: '0.78rem', color: 'var(--text-2)', padding: '0.35rem 0.55rem', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 7 }}>
                        {s.line(r)}
                      </li>
                    ))}
                    {rows.length > 8 && <li style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>+ {rows.length - 8} more…</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {canReview && ['submitted', 'reviewed', 'approved'].includes(status) && (
          <div style={{ padding: '0.8rem 1.1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['submitted', 'reviewed'].includes(status) && (
              <>
                {status === 'submitted' && <button disabled={busy} onClick={onReview} style={{ ...rowBtnSecondary, ...(busy ? disabledBtn : null) }}><Eye size={14} /> {t('merl.markUnderReview')}</button>}
                <button disabled={busy} onClick={onReturn} style={{ ...rowBtnWarning, ...(busy ? disabledBtn : null) }}><RotateCcw size={14} /> {t('merl.returnLbl')}</button>
                <button disabled={busy} onClick={onApprove} style={{ ...rowBtnPrimary, ...(busy ? disabledBtn : null) }}><CheckCircle2 size={14} /> {t('merl.approveLock')}</button>
              </>
            )}
            {status === 'approved' && <button disabled={busy} onClick={onReopen} style={{ ...rowBtnSecondary, ...(busy ? disabledBtn : null) }}><Unlock size={14} /> {t('merl.reopen')}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact row/drawer action buttons — one primary per row (Approve), the
// rest secondary (outlined) or tertiary (plain text), so actions don't all
// carry the same visual weight (spec §12).
const rowBtnBase = {
  display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem',
  borderRadius: 'var(--radius-control)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
};
// Inline style objects cannot express :disabled, so a button that is disabled
// mid-request kept rendering at full strength — the officer got no sign their
// click had registered. Spread this wherever `disabled` is set.
const disabledBtn = { opacity: 0.45, cursor: 'not-allowed' };
const rowBtnPrimary = { ...rowBtnBase, border: 'none', background: 'var(--green-600)', color: '#fff' };
const rowBtnSecondary = { ...rowBtnBase, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--text-2)' };
const rowBtnWarning = { ...rowBtnBase, border: '1px solid var(--border)', background: 'var(--white)', color: '#8a6416' };
const rowBtnGhost = { ...rowBtnBase, border: 'none', background: 'none', padding: '0.3rem 0.3rem', color: 'var(--green-700)' };
