// =============================================================================
// MerlReporting.jsx — DoCC Standardised MERL Reporting workspace.
// One project-scoped screen implementing the periodic reporting modules of the
// DoCC form: Form 11 (reporting period + submission/approval workflow) plus the
// repeatable modules Form 4 (Indicator Progress), Form 6 (Financial Progress),
// Form 8 (Beneficiaries & GEDSI), Form 9 (Risks & Issues), Form 10
// (Achievements & Learning) and Form 12 (Evidence). Every module is driven by a
// shared config + record renderer so the six forms stay consistent and reads go
// through the public.v_* views while writes go through the SECURITY DEFINER
// RPCs from migration 0029.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Send, CheckCircle2, RotateCcw, X, AlertTriangle, Info, Lock, Unlock,
} from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import { confirmDialog, promptDialog } from '../lib/confirm';
import { dbErrorMessage } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import * as OPT from '../constants/formOptions';
import {
  achievementPct, variance as calcVariance, performanceStatus, remainingBalance,
  utilisationPct, fundsAvailable, riskRating, fmtAmount, fmtPct,
} from '../lib/docc/reporting';
import { useTranslation } from 'react-i18next';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
// The DoCC M&E Officer is the official Reviewer/Approver; System Administrator
// retains an emergency override. Other roles cannot review or approve.
const APPROVER_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];

const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// ── Module definitions ───────────────────────────────────────────────────────
// type: text | number | textarea | select | date | checkbox
// options: static [{value,label}] ; dynamicOptions: 'indicators' | 'activities'
const MODULES = [
  {
    key: 'indicator_progress', label: 'merl.modIndicatorProgress', form: '4',
    view: 'v_indicator_progress', rpc: 'upsert_indicator_progress', del: 'delete_indicator_progress',
    periodScoped: true,
    fields: [
      { name: 'indicator_id', label: 'merl.indicator', type: 'select', dynamicOptions: 'indicators', required: true },
      { name: 'period_target', label: 'merl.periodTarget', type: 'number' },
      { name: 'actual_this_period', label: 'merl.actualThisPeriod', type: 'number' },
      { name: 'cumulative_actual', label: 'merl.cumulativeActual', type: 'number' },
      { name: 'previous_value', label: 'merl.previousPeriodValue', type: 'number' },
      { name: 'performance_status', label: 'merl.performanceStatus', type: 'select', options: OPT.PERFORMANCE_STATUS },
      { name: 'narrative', label: 'merl.progressNarrative', type: 'textarea' },
      { name: 'variance_reason', label: 'merl.reasonForVariance', type: 'textarea' },
      { name: 'corrective_action', label: 'merl.correctiveAction', type: 'textarea' },
      { name: 'date_reported', label: 'merl.dateReported', type: 'date' },
    ],
    columns: [
      { label: 'merl.indicator', get: (r) => r.indicator_code || '—' },
      { label: 'merl.period', get: (r) => r.reporting_period },
      { label: 'merl.cumulative', get: (r) => (r.cumulative_actual ?? '—') },
      { label: 'merl.achievement', get: (r) => fmtPct(r.achievement_pct) },
      { label: 'merl.status', get: (r) => OPT.labelOf(OPT.PERFORMANCE_STATUS, r.performance_status) },
    ],
  },
  {
    key: 'financial_progress', label: 'merl.modFinancialProgress', form: '6',
    view: 'v_financial_progress', rpc: 'upsert_financial_progress', del: 'delete_financial_progress',
    periodScoped: true,
    fields: [
      { name: 'approved_budget', label: 'merl.approvedProjectBudget', type: 'number' },
      { name: 'annual_budget', label: 'merl.annualBudget', type: 'number' },
      { name: 'period_budget', label: 'merl.budgetForPeriod', type: 'number' },
      { name: 'expenditure_period', label: 'merl.expenditureThisPeriod', type: 'number' },
      { name: 'cumulative_expenditure', label: 'merl.cumulativeExpenditure', type: 'number' },
      { name: 'funds_received', label: 'merl.fundsReceived', type: 'number' },
      { name: 'funds_committed', label: 'merl.fundsCommitted', type: 'number' },
      { name: 'narrative', label: 'merl.financialNarrative', type: 'textarea' },
    ],
    columns: [
      { label: 'merl.period', get: (r) => r.reporting_period },
      { label: 'merl.approved', get: (r) => fmtAmount(r.approved_budget) },
      { label: 'merl.cumulativeExp', get: (r) => fmtAmount(r.cumulative_expenditure) },
      { label: 'merl.balance', get: (r) => fmtAmount(r.remaining_balance) },
      { label: 'merl.utilisation', get: (r) => fmtPct(r.utilisation_pct) },
    ],
  },
  {
    key: 'beneficiaries', label: 'merl.modBeneficiaries', form: '8',
    view: 'v_beneficiaries', rpc: 'upsert_beneficiaries', del: 'delete_beneficiaries',
    periodScoped: true,
    fields: [
      { name: 'activity_id', label: 'merl.activityOptional', type: 'select', dynamicOptions: 'activities' },
      { name: 'location', label: 'merl.location', type: 'text' },
      { name: 'total_direct', label: 'merl.totalDirect', type: 'number' },
      { name: 'female', label: 'merl.female', type: 'number' },
      { name: 'male', label: 'merl.male', type: 'number' },
      { name: 'other_gender', label: 'merl.otherNotReported', type: 'number' },
      { name: 'youth', label: 'merl.youth', type: 'number' },
      { name: 'persons_with_disability', label: 'merl.pwdFull', type: 'number' },
      { name: 'indirect', label: 'merl.indirectBeneficiaries', type: 'number' },
      { name: 'other_vulnerable', label: 'merl.otherVulnerable', type: 'text' },
      { name: 'data_source', label: 'merl.dataSource', type: 'text' },
      { name: 'double_counting_check', label: 'merl.doubleCounting', type: 'checkbox' },
      { name: 'comments', label: 'merl.comments', type: 'textarea' },
    ],
    note: 'Leave a count blank if it was not collected — a blank is stored as "no data", which is different from a recorded 0.',
    // The gender split is a partition of the total; youth and disability are
    // separate axes over the same people, so each is bounded on its own.
    validate: (v) => {
      const n = (x) => (x === '' || x == null ? 0 : Number(x));
      if (v.total_direct === '' || v.total_direct == null) return null;
      const total = Number(v.total_direct);
      const split = n(v.female) + n(v.male) + n(v.other_gender);
      if (split > total) {
        return `Female, male and other add up to ${split}, more than the ${total} total direct beneficiaries.`;
      }
      if (n(v.youth) > total) return `Youth (${n(v.youth)}) cannot exceed the ${total} total direct beneficiaries.`;
      if (n(v.persons_with_disability) > total) {
        return `Persons with disabilities (${n(v.persons_with_disability)}) cannot exceed the ${total} total direct beneficiaries.`;
      }
      return null;
    },
    columns: [
      { label: 'merl.period', get: (r) => r.reporting_period },
      { label: 'merl.location', get: (r) => r.location || '—' },
      { label: 'merl.direct', get: (r) => (r.total_direct ?? '—') },
      { label: 'merl.female', get: (r) => (r.female ?? '—') },
      { label: 'merl.male', get: (r) => (r.male ?? '—') },
      { label: 'merl.pwd', get: (r) => (r.persons_with_disability ?? '—') },
    ],
  },
  {
    key: 'risks_issues', label: 'merl.modRisks', form: '9',
    view: 'v_risks_issues', rpc: 'upsert_risk_issue', del: 'delete_risk_issue',
    periodScoped: false,
    fields: [
      { name: 'type', label: 'merl.type', type: 'select', options: OPT.RISK_TYPE, required: true },
      { name: 'description', label: 'merl.description', type: 'textarea', required: true },
      { name: 'category', label: 'merl.category', type: 'select', options: OPT.RISK_CATEGORY },
      { name: 'date_identified', label: 'merl.dateIdentified', type: 'date' },
      { name: 'likelihood', label: 'merl.likelihood', type: 'select', options: OPT.LIKELIHOOD_IMPACT },
      { name: 'impact', label: 'merl.impact', type: 'select', options: OPT.LIKELIHOOD_IMPACT },
      { name: 'mitigation', label: 'merl.mitigation', type: 'textarea' },
      { name: 'responsible_person', label: 'merl.responsiblePerson', type: 'text' },
      { name: 'due_date', label: 'merl.dueDate', type: 'date' },
      { name: 'status', label: 'merl.status', type: 'select', options: OPT.RISK_STATUS },
      { name: 'latest_update', label: 'merl.latestUpdate', type: 'textarea' },
      { name: 'date_resolved', label: 'merl.dateResolved', type: 'date' },
    ],
    columns: [
      { label: 'ID', get: (r) => r.code },
      { label: 'merl.type', get: (r) => OPT.labelOf(OPT.RISK_TYPE, r.type) },
      { label: 'merl.description', get: (r) => (r.description || '').slice(0, 60) },
      { label: 'merl.rating', get: (r) => r.risk_rating || '—' },
      { label: 'merl.status', get: (r) => OPT.labelOf(OPT.RISK_STATUS, r.status) },
    ],
  },
  {
    key: 'learning_updates', label: 'merl.modLearning', form: '10',
    view: 'v_learning_updates', rpc: 'upsert_learning_update', del: 'delete_learning_update',
    periodScoped: true,
    fields: [
      { name: 'key_achievements', label: 'merl.keyAchievements', type: 'textarea' },
      { name: 'major_results', label: 'merl.majorResults', type: 'textarea' },
      { name: 'challenges', label: 'merl.challenges', type: 'textarea' },
      { name: 'lessons_learned', label: 'merl.lessonsLearned', type: 'textarea' },
      { name: 'successful_approaches', label: 'merl.successfulApproaches', type: 'textarea' },
      { name: 'what_did_not_work', label: 'merl.whatDidNotWork', type: 'textarea' },
      { name: 'corrective_actions', label: 'merl.correctiveActionsTaken', type: 'textarea' },
      { name: 'recommendations', label: 'merl.recommendations', type: 'textarea' },
      { name: 'emerging_opportunities', label: 'merl.emergingOpportunities', type: 'textarea' },
      { name: 'next_period_priorities', label: 'merl.nextPeriodPriorities', type: 'textarea' },
      { name: 'success_story', label: 'merl.successStory', type: 'textarea' },
    ],
    columns: [
      { label: 'merl.period', get: (r) => r.reporting_period },
      { label: 'merl.keyAchievements', get: (r) => (r.key_achievements || '').slice(0, 80) || '—' },
      { label: 'merl.lessons', get: (r) => (r.lessons_learned || '').slice(0, 60) || '—' },
    ],
  },
  {
    key: 'evidence', label: 'merl.modEvidence', form: '12',
    view: 'v_evidence', rpc: 'upsert_evidence', del: 'delete_evidence',
    periodScoped: true,
    fields: [
      { name: 'title', label: 'merl.documentTitle', type: 'text', required: true },
      { name: 'document_type', label: 'merl.documentType', type: 'select', options: OPT.DOCUMENT_TYPE },
      { name: 'indicator_id', label: 'merl.relatedIndicator', type: 'select', dynamicOptions: 'indicators' },
      { name: 'activity_id', label: 'merl.relatedActivity', type: 'select', dynamicOptions: 'activities' },
      { name: 'description', label: 'merl.description', type: 'textarea' },
      { name: 'document_date', label: 'merl.documentDate', type: 'date' },
      { name: 'file_url', label: 'merl.fileUrl', type: 'text' },
      { name: 'verification_status', label: 'merl.verificationStatus', type: 'select', options: OPT.VERIFICATION_STATUS },
    ],
    columns: [
      { label: 'ID', get: (r) => r.code },
      { label: 'merl.title', get: (r) => r.title },
      { label: 'merl.type', get: (r) => OPT.labelOf(OPT.DOCUMENT_TYPE, r.document_type) },
      { label: 'merl.verification', get: (r) => OPT.labelOf(OPT.VERIFICATION_STATUS, r.verification_status) },
    ],
  },
];

// ── Small presentational helpers ─────────────────────────────────────────────
const btn = (bg, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.8rem',
  fontSize: '0.8125rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer',
  color: '#fff', background: bg, ...extra,
});
// Outlined secondary/warning variants, so Return/Reopen/Cancel don't carry the
// same solid-fill weight as the one primary action in a given row (spec §12).
const btnSecondary = (extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.8rem',
  fontSize: '0.8125rem', fontWeight: 600, borderRadius: 'var(--radius-control)', cursor: 'pointer',
  color: 'var(--text-2)', background: 'var(--white)', border: '1px solid var(--border)', ...extra,
});
const btnWarning = (extra = {}) => ({ ...btnSecondary(extra), color: '#8a6416' });
const btnGhost = (extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.4rem',
  fontSize: '0.78rem', fontWeight: 600, borderRadius: 'var(--radius-control)', cursor: 'pointer',
  color: 'var(--text-2)', background: 'none', border: 'none', ...extra,
});
const STATUS_TINT = {
  draft: '#64748b', submitted: '#2563eb', returned: '#d97706', reviewed: '#7c3aed', approved: '#16a34a',
};

export default function MerlReporting({ user }) {
  const { t } = useTranslation();
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const canApprove = APPROVER_ROLES.includes(user?.role);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [indicators, setIndicators] = useState([]);
  const [activities, setActivities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  // ?module=<key> opens a specific form directly. The sidebar's
  // "Documents & Evidence" entry uses it to land on Evidence rather than on
  // Indicator Progress, which is what made it indistinguishable from the
  // "MERL Reporting" entry above it.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('module');
  const [tab, setTab] = useState(
    () => (MODULES.some((m) => m.key === requested) ? requested : MODULES[0].key));

  // Follow the URL when it changes under us (sidebar click while already here).
  useEffect(() => {
    if (requested && MODULES.some((m) => m.key === requested) && requested !== tab) {
      setTab(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  // Keep the URL honest when the officer switches module by hand, so the
  // address bar and the highlighted sidebar entry agree.
  const selectTab = (key) => {
    setTab(key);
    setSearchParams(key === MODULES[0].key ? {} : { module: key }, { replace: true });
  };
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed; {} = new; {...row} = edit
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const activeModule = useMemo(() => MODULES.find((m) => m.key === tab), [tab]);

  // ── Load projects once ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('v_projects').select('id, code, name, status').order('code')
      .then(({ data, error }) => {
        if (error) { toast.error(t('merl.couldNotLoad')); return; }
        setProjects(data ?? []);
        if (data?.length && !projectId) setProjectId(data[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load per-project context ────────────────────────────────────────────────
  const loadContext = useCallback(async (pid) => {
    if (!pid) return;
    const [ind, act, per] = await Promise.all([
      supabase.from('v_project_indicators').select('id, code, name, target_value').eq('project_id', pid).order('code'),
      supabase.from('v_project_activities').select('id, code, name').eq('project_id', pid).order('code'),
      supabase.from('v_reporting_periods').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
    ]);
    setIndicators(ind.data ?? []);
    setActivities(act.data ?? []);
    setPeriods(per.data ?? []);
    if ((per.data ?? []).length) setActivePeriod((prev) => prev || per.data[0].period_label);
  }, []);

  useEffect(() => { loadContext(projectId); }, [projectId, loadContext]);

  // ── Load records for the active module ──────────────────────────────────────
  const loadRecords = useCallback(async () => {
    if (!projectId || !activeModule) { setRecords([]); return; }
    setLoading(true);
    const { data, error } = await supabase.from(activeModule.view).select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) toast.error(`${t('merl.couldNotLoad')} — ${t(activeModule.label)}`);
    setRecords(data ?? []);
    setLoading(false);
  }, [projectId, activeModule]);

  useEffect(() => { loadRecords(); setEditing(null); }, [loadRecords]);

  // Per-section completion for the active reporting period (§40): count records
  // in each period-scoped module for this project + period.
  const [sections, setSections] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!projectId || !activePeriod) { setSections({}); return undefined; }
    let alive = true;
    const scoped = MODULES.filter((mm) => mm.periodScoped);
    Promise.all(scoped.map((mm) => supabase.from(mm.view).select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('reporting_period', activePeriod)
      .then(({ count }) => [mm.key, count || 0])))
      .then((entries) => { if (alive) setSections(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [projectId, activePeriod, refreshKey]);

  const dynamicOptions = (key) => {
    const src = key === 'indicators' ? indicators : key === 'activities' ? activities : [];
    return src.map((o) => ({ value: o.id, label: `${o.code} · ${o.name}` }));
  };

  // ── Save a module record via its upsert RPC ─────────────────────────────────
  const saveRecord = async (values) => {
    const m = activeModule;
    for (const f of m.fields) {
      if (f.required && (values[f.name] === '' || values[f.name] == null)) {
        toast.error(t('merl.fieldRequired', { field: t(f.label) })); return;
      }
    }
    // Cross-field rules the database also enforces, checked here first so the
    // officer is told which figures disagree rather than seeing a constraint.
    const problem = m.validate?.(values);
    if (problem) { toast.error(problem); return; }
    const params = { p_id: editing?.id ?? null, p_project_id: projectId };
    if (m.periodScoped) params.p_reporting_period = activePeriod || null;
    for (const f of m.fields) {
      const raw = values[f.name];
      const v = f.type === 'number' ? toNum(raw)
        : f.type === 'checkbox' ? !!raw
        : toNull(raw);
      params[`p_${f.name}`] = v;
    }
    // Client-side derived values (mirrored server-side for Form 4).
    if (m.key === 'indicator_progress') {
      const ind = indicators.find((i) => i.id === values.indicator_id);
      params.p_achievement_pct = achievementPct(values.cumulative_actual, ind?.target_value);
      params.p_variance = calcVariance(values.actual_this_period, values.period_target);
    }
    const { error } = await supabase.rpc(m.rpc, params);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(editing?.id ? t('merl.updatedToast') : t('merl.addedToast'));
    setEditing(null);
    loadRecords();
    setRefreshKey((k) => k + 1);
    if (m.periodScoped) loadContext(projectId);
  };

  const deleteRecord = async (row) => {
    if (!(await confirmDialog({ title:t('merl.deleteRecord'), message:t('merl.deleteConfirm'), confirmLabel:t('merl.deleteLbl') }))) return;
    const { error } = await supabase.rpc(activeModule.del, { p_id: row.id });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(t('merl.deleted'));
    loadRecords();
    setRefreshKey((k) => k + 1);
  };

  // ── Reporting period workflow (Form 11) ─────────────────────────────────────
  const createPeriod = async (values) => {
    if (!values.period_label) { toast.error(t('merl.periodLabelRequired')); return; }
    const { error } = await supabase.rpc('upsert_reporting_period', {
      p_id: null, p_project_id: projectId, p_period_label: values.period_label,
      p_period_type: toNull(values.period_type), p_period_start: toNull(values.period_start),
      p_period_end: toNull(values.period_end), p_reporting_officer_id: null,
    });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(t('merl.periodCreated'));
    setNewPeriodOpen(false);
    setActivePeriod(values.period_label);
    loadContext(projectId);
  };

  const periodAction = async (rpc, id, decision) => {
    let params;
    if (rpc === 'reopen_reporting_period') {
      // Reopening an approved period requires a reason (recorded in the audit trail).
      const reason = await promptDialog({ title:t('merl.reopenPeriod'), label:t('merl.reopenReason'), required:true, multiline:true,
        message:'This approved period will return to draft for correction. The reason is recorded in the audit trail.' });
      if (reason == null || !reason.trim()) return;
      params = { p_id: id, p_reason: reason.trim() };
    } else if (decision === 'return') {
      // Returning for correction requires a comment explaining what to fix.
      const comment = await promptDialog({ title:t('merl.returnForCorrection'), label:t('merl.whatNeedsCorrection'), required:true, multiline:true });
      if (comment == null || !comment.trim()) return;
      params = { p_id: id, p_decision: decision, p_comments: comment.trim() };
    } else if (decision) {
      params = { p_id: id, p_decision: decision, p_comments: null };
    } else {
      params = { p_id: id };
    }
    const { error } = await supabase.rpc(rpc, params);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(rpc === 'reopen_reporting_period' ? t('merl.periodReopenedToast') : t('merl.updatedToast'));
    loadContext(projectId);
  };

  const currentPeriodRow = periods.find((p) => p.period_label === activePeriod);

  // Period completion (§40): which period-scoped modules have at least one record
  // for the active period, and an overall completion % for the header.
  const scopedModules = useMemo(() => MODULES.filter((m) => m.periodScoped), []);
  const completion = useMemo(() => {
    const done = scopedModules.filter((m) => (sections[m.key] || 0) > 0).length;
    return { done, total: scopedModules.length, pct: scopedModules.length ? Math.round((done / scopedModules.length) * 100) : 0 };
  }, [scopedModules, sections]);

  return (
    <div className="page-pad" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .mr-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0}
        .mr-tab{padding:.45rem .8rem;border-radius:9999px;border:1px solid var(--border);background:var(--white);cursor:pointer;font-size:.8125rem;font-weight:600;color:var(--text-2)}
        .mr-tab.active{background:var(--green-600);color:#fff;border-color:var(--green-600)}
        .mr-table{width:100%;border-collapse:collapse;font-size:.85rem}
        .mr-table th,.mr-table td{padding:.55rem .6rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .mr-table th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        .mr-cards{display:none}
        .mr-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem}
        @media (max-width:640px){
          .mr-desktop-table{display:none}
          .mr-cards{display:grid;gap:.6rem}
          .mr-form-grid{grid-template-columns:1fr}
        }
        .mr-card{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.75rem}
        .mr-card-row{display:flex;justify-content:space-between;gap:.5rem;font-size:.8rem;padding:.15rem 0}
        .mr-card-row span:first-child{color:var(--text-3)}
      `}</style>

      <PageHeader
        title={t('merl.pageTitle')}
        subtitle={t('merl.pageSubtitle')}
      />

      {/* Project + period bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <label className="field-label">{t('merl.project')}</label>
          <select className="field-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label className="field-label">{t('merl.activePeriod')}</label>
          <select className="field-input" value={activePeriod} onChange={(e) => setActivePeriod(e.target.value)}>
            <option value="">{t('merl.noneOption')}</option>
            {periods.map((p) => <option key={p.id} value={p.period_label}>{p.period_label}</option>)}
          </select>
        </div>
        {canEdit && (
          <button style={btn('var(--green-700)')} onClick={() => setNewPeriodOpen((o) => !o)}>
            <Plus size={15} /> {t('merl.newPeriod')}
          </button>
        )}
      </div>

      {/* Period submission / approval status (Form 11) */}
      {currentPeriodRow && (
        <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.9rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--white)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
            {t('merl.period')} <strong>{currentPeriodRow.period_label}</strong>
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: STATUS_TINT[currentPeriodRow.submission_status] || '#64748b', padding: '0.2rem 0.55rem', borderRadius: 9999 }}>
            {OPT.labelOf(OPT.SUBMISSION_STATUS, currentPeriodRow.submission_status)}
          </span>
          {currentPeriodRow.submission_status === 'approved' && (
            <span title={t('merl.lockedTitle')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 700, color: '#155e34', background: '#dcece2', border: '1px solid #16a34a55', padding: '0.2rem 0.55rem', borderRadius: 9999 }}>
              <Lock size={12} /> {t('merl.locked')}
            </span>
          )}
          {currentPeriodRow.submission_status === 'returned' && currentPeriodRow.review_comments && (
            <span style={{ fontSize: '0.72rem', color: '#8a6416' }}>Review note: {currentPeriodRow.review_comments}</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {canEdit && ['draft', 'returned'].includes(currentPeriodRow.submission_status) && (
              <button style={btn('var(--green-600)')} onClick={() => periodAction('submit_reporting_period', currentPeriodRow.id)}>
                <Send size={14} /> {t('merl.submit')}
              </button>
            )}
            {canApprove && ['submitted', 'reviewed'].includes(currentPeriodRow.submission_status) && (
              <>
                <button style={btn('var(--green-600)')} onClick={() => periodAction('review_reporting_period', currentPeriodRow.id, 'approve')}>
                  <CheckCircle2 size={14} /> {t('merl.approve')}
                </button>
                <button style={btnWarning()} onClick={() => periodAction('review_reporting_period', currentPeriodRow.id, 'return')}>
                  <RotateCcw size={14} /> {t('merl.returnLbl')}
                </button>
              </>
            )}
            {canApprove && currentPeriodRow.submission_status === 'approved' && (
              <button style={btnSecondary()} onClick={() => periodAction('reopen_reporting_period', currentPeriodRow.id)}>
                <Unlock size={14} /> {t('merl.reopen')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Period completion overview (§40) — which sections have data for this period */}
      {currentPeriodRow && (
        <div style={{ marginTop: '0.75rem', padding: '0.8rem 0.9rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-1)' }}>{t('merl.periodCompletion')}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: '0.4rem' }}>
                {t('merl.sectionsWithData', { done: completion.done, total: completion.total })}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: completion.pct === 100 ? '#16a34a' : 'var(--text-1)' }}>
              {completion.pct}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 9999, background: 'var(--green-50)', overflow: 'hidden', marginBottom: '0.7rem' }}>
            <div style={{ width: `${completion.pct}%`, height: '100%', borderRadius: 9999, background: completion.pct === 100 ? '#16a34a' : 'var(--green-600)', transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {scopedModules.map((m) => {
              const has = (sections[m.key] || 0) > 0;
              return (
                <button key={m.key} onClick={() => selectTab(m.key)}
                  title={has ? `${sections[m.key]} record(s) this period` : 'No data yet for this period'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: 9999,
                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${has ? '#16a34a55' : 'var(--border)'}`,
                    background: has ? '#dcece2' : 'var(--white)', color: has ? '#155e34' : 'var(--text-3)' }}>
                  {has
                    ? <CheckCircle2 size={13} />
                    : <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', border: '1.5px solid var(--text-3)', display: 'inline-block' }} />}
                  {t(m.label)}
                </button>
              );
            })}
          </div>
          {canEdit && ['draft', 'returned'].includes(currentPeriodRow.submission_status) && completion.done < completion.total && (
            <p style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.72rem', color: 'var(--text-2)', margin: '0.7rem 0 0' }}>
              <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span>{t('merl.submitAnyTime')}</span>
            </p>
          )}
        </div>
      )}

      {newPeriodOpen && (
        <PeriodForm onCancel={() => setNewPeriodOpen(false)} onSave={createPeriod} />
      )}

      {/* Module tabs */}
      <div className="mr-tabs">
        {MODULES.map((m) => (
          <button key={m.key} className={`mr-tab${tab === m.key ? ' active' : ''}`} onClick={() => selectTab(m.key)}>
            {t(m.label)}
          </button>
        ))}
      </div>

      {/* Records */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '0.95rem' }}>{t(activeModule.label)}</strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: '0.4rem' }}>{t('merl.form', { n: activeModule.form })}</span>
          </div>
          {canEdit && (
            <button style={btn('var(--green-700)')}
              onClick={() => setEditing({})}
              disabled={(activeModule.periodScoped && !activePeriod)
                || (activeModule.periodScoped && currentPeriodRow?.submission_status === 'approved')}
              title={activeModule.periodScoped && currentPeriodRow?.submission_status === 'approved'
                ? 'This reporting period is approved and locked — the DoCC M&E Officer must reopen it to make changes'
                : activeModule.periodScoped && !activePeriod ? 'Select or create a reporting period first' : ''}>
              <Plus size={15} /> {t('merl.add')}
            </button>
          )}
        </div>

        {activeModule.note && (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.75rem', color: 'var(--text-2)', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8, padding: '0.5rem 0.7rem', marginBottom: '0.6rem' }}>
            <Info size={14} style={{ color: 'var(--green-700)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>{activeModule.note}</span>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('merl.loading')}</p>
        ) : records.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('merl.noRecords')}</p>
        ) : (
          <>
            <div className="mr-desktop-table" style={{ overflowX: 'auto' }}>
              <table className="mr-table">
                <thead>
                  <tr>
                    {activeModule.columns.map((c) => <th key={c.label}>{t(c.label)}</th>)}
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      {activeModule.columns.map((c) => <td key={c.label}>{c.get(r) ?? '—'}</td>)}
                      {canEdit && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => setEditing(r)} aria-label={t('merl.editRecord')} title={t('merl.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                          <button onClick={() => deleteRecord(r)} aria-label={t('merl.deleteRecord')} title={t('merl.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mr-cards">
              {records.map((r) => (
                <div className="mr-card" key={r.id}>
                  {activeModule.columns.map((c) => (
                    <div className="mr-card-row" key={c.label}><span>{t(c.label)}</span><span>{c.get(r) ?? '—'}</span></div>
                  ))}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <button onClick={() => setEditing(r)} style={btnGhost()}><Pencil size={13} /> {t('merl.edit')}</button>
                      <button onClick={() => deleteRecord(r)} style={btnGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('merl.deleteLbl')}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {editing !== null && (
        <RecordForm
          module={activeModule}
          initial={editing}
          dynamicOptions={dynamicOptions}
          indicators={indicators}
          onCancel={() => setEditing(null)}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

// ── Reporting-period creation form ───────────────────────────────────────────
function PeriodForm({ onCancel, onSave }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ period_label: '', period_type: '', period_start: '', period_end: '' });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div style={{ marginTop: '0.75rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--white)' }}>
      <div className="mr-form-grid">
        <div>
          <label className="field-label">{t('merl.periodLabel')}</label>
          <input className="field-input" value={v.period_label} onChange={set('period_label')} />
        </div>
        <div>
          <label className="field-label">{t('merl.periodType')}</label>
          <select className="field-input" value={v.period_type} onChange={set('period_type')}>
            <option value="">—</option>
            {OPT.PERIOD_TYPE.map((o) => <option key={o.value} value={o.value}>{OPT.optionLabel(o)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t('merl.start')}</label>
          <input type="date" className="field-input" value={v.period_start} onChange={set('period_start')} />
        </div>
        <div>
          <label className="field-label">{t('merl.end')}</label>
          <input type="date" className="field-input" value={v.period_end} onChange={set('period_end')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
        <button style={btn('var(--green-700)')} onClick={() => onSave(v)}>{t('merl.create')}</button>
        <button style={btnSecondary()} onClick={onCancel}>{t('merl.cancel')}</button>
      </div>
    </div>
  );
}

// ── Generic module record form ───────────────────────────────────────────────
function RecordForm({ module, initial, dynamicOptions, indicators, onCancel, onSave }) {
  const { t } = useTranslation();
  const seed = useMemo(() => {
    const base = {};
    for (const f of module.fields) base[f.name] = initial?.[f.name] ?? (f.type === 'checkbox' ? false : '');
    return base;
  }, [module, initial]);
  const [v, setV] = useState(seed);
  useEffect(() => setV(seed), [seed]);
  const set = (name, type) => (e) =>
    setV((s) => ({ ...s, [name]: type === 'checkbox' ? e.target.checked : e.target.value }));

  // Live derived previews
  const ind = indicators.find((i) => i.id === v.indicator_id);
  const preview = [];
  if (module.key === 'indicator_progress') {
    preview.push(['Achievement %', fmtPct(achievementPct(v.cumulative_actual, ind?.target_value))]);
  }
  if (module.key === 'financial_progress') {
    preview.push(['Remaining balance', fmtAmount(remainingBalance(v.approved_budget, v.cumulative_expenditure))]);
    preview.push(['Utilisation %', fmtPct(utilisationPct(v.approved_budget, v.cumulative_expenditure))]);
    preview.push(['Funds available', fmtAmount(fundsAvailable(v.funds_received, v.funds_committed))]);
  }
  if (module.key === 'risks_issues') {
    preview.push(['Risk rating', riskRating(v.likelihood, v.impact) || '—']);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
      onClick={onCancel}>
      <div style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 720, padding: '1.2rem', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <strong style={{ fontSize: '1rem' }}>{initial?.id ? t('merl.edit') : t('merl.add')} — {t(module.label)}</strong>
          <button onClick={onCancel} aria-label={t('ui.close')} title={t('ui.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="mr-form-grid">
          {module.fields.map((f) => (
            <div key={f.name} style={{ gridColumn: f.type === 'textarea' ? '1 / -1' : 'auto' }}>
              <label className="field-label">{t(f.label)}{f.required && ' *'}</label>
              {f.type === 'textarea' ? (
                <textarea className="field-input" rows={2} value={v[f.name] ?? ''} onChange={set(f.name, f.type)} />
              ) : f.type === 'select' ? (
                <select className="field-input" value={v[f.name] ?? ''} onChange={set(f.name, f.type)}>
                  <option value="">—</option>
                  {(f.dynamicOptions ? dynamicOptions(f.dynamicOptions) : f.options).map((o) => (
                    <option key={o.value} value={o.value}>{OPT.optionLabel(o)}</option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <div style={{ paddingTop: '0.4rem' }}>
                  <input type="checkbox" checked={!!v[f.name]} onChange={set(f.name, f.type)} style={{ width: 18, height: 18 }} />
                </div>
              ) : (
                <input type={f.type} className="field-input" value={v[f.name] ?? ''} onChange={set(f.name, f.type)} />
              )}
            </div>
          ))}
        </div>
        {preview.length > 0 && (
          <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-2)' }}>
            {preview.map(([k, val]) => (
              <span key={k}><span style={{ color: 'var(--text-3)' }}>{k}: </span><strong>{val}</strong></span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button style={btn('var(--green-700)')} onClick={() => onSave(v)}>{initial?.id ? 'Save changes' : 'Add record'}</button>
          <button style={btnSecondary()} onClick={onCancel}>{t('merl.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
