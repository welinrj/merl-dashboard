import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ClipboardCheck, Plus, Pencil, Trash2, Send, CheckCircle2, RotateCcw,
  Loader2, AlertCircle, Users, Wallet,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import {
  FREQUENCY, PROGRESS_RATING, REPORT_STATUS, labelOf,
} from '../constants/formOptions';

const EDITOR_ROLES   = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const REVIEWER_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_SENIOR', 'ROLE_DOCC_MEO'];

const STATUS_BADGE = {
  on_track:  { bg: '#dcece2', fg: '#155e34', dot: '#1a8c4e' },
  at_risk:   { bg: '#f7ead0', fg: '#8a6416', dot: '#d99a2b' },
  off_track: { bg: '#f6ded8', fg: '#8a2e21', dot: '#b3402f' },
  completed: { bg: '#dbeafe', fg: '#1e40af', dot: '#2563eb' },
};
const REPORT_BADGE = {
  draft:          { bg: '#f1f5f9', fg: '#475569' },
  pending_review: { bg: '#fef3c7', fg: '#92400e' },
  approved:       { bg: '#d1fae5', fg: '#065f46' },
  returned:       { bg: '#fee2e2', fg: '#991b1b' },
};

const numOrNull = v => (v === '' || v == null ? null : Number(v));
const sumBen = f =>
  (Number(f.beneficiaries_male) || 0) +
  (Number(f.beneficiaries_female) || 0) +
  (Number(f.beneficiaries_other) || 0);

const EMPTY = {
  activity_id: '', reporting_period: '', period_type: 'Monthly',
  status: 'on_track', percent_complete: '', narrative: '',
  beneficiaries_male: '', beneficiaries_female: '', beneficiaries_other: '',
  beneficiaries_pwd: '', beneficiaries_youth: '',
  budget_spent_vuv: '', issues: '', lessons_learned: '', next_steps: '',
};

// ── small field helpers (shared style with FRM-01/02) ─────────────────────────
const Field = ({ label, children, hint, span }) => (
  <div style={span ? { gridColumn: '1 / -1' } : undefined}>
    <label className="field-label">{label}</label>
    {children}
    {hint && <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: 4 }}>{hint}</div>}
  </div>
);

const Select = ({ value, onChange, options, placeholder }) => {
  const { t } = useTranslation();
  return (
    <select className="field-input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder ?? t('form.selectOption')}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
};

const Section = ({ title, children, cols = 2 }) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <div className="section-label" style={{ marginBottom: '0.75rem' }}>{title}</div>
    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.875rem' }}>
      {children}
    </div>
  </div>
);

export default function ActivityProgress({ user }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';

  const [projects, setProjects]     = useState([]);
  const [activities, setActivities] = useState([]);
  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [loadErr, setLoadErr]       = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [busy, setBusy]             = useState(false);
  const [formErr, setFormErr]       = useState('');
  const [reviewing, setReviewing]   = useState(null); // { id, note }

  const canEdit   = EDITOR_ROLES.includes(user?.role);
  const canReview = REVIEWER_ROLES.includes(user?.role);

  // Project list for the selector.
  useEffect(() => {
    supabase.from('v_projects').select('id,code,name').order('code')
      .then(({ data, error }) => { if (!error) setProjects(data ?? []); });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) { setActivities([]); setReports([]); return; }
    setLoading(true); setLoadErr('');
    const [ac, rp] = await Promise.all([
      supabase.from('v_project_activities').select('id,code,name').eq('project_id', projectId).order('code'),
      supabase.from('v_activity_progress').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    if (ac.error) setLoadErr(ac.error.message); else setActivities(ac.data ?? []);
    if (rp.error) setLoadErr(rp.error.message); else setReports(rp.data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const activityLabel = id => {
    const a = activities.find(x => x.id === id);
    return a ? `${a.code} · ${a.name}` : '—';
  };

  const openAdd = () => {
    if (!activities.length) { toast.error(t('activityProgress.needActivities')); return; }
    setEditingId(null); setForm(EMPTY); setFormErr(''); setShowForm(true);
  };
  const openEdit = r => {
    setEditingId(r.id);
    setForm({
      activity_id: r.activity_id || '', reporting_period: r.reporting_period || '',
      period_type: r.period_type || 'Monthly', status: r.status || 'on_track',
      percent_complete: r.percent_complete ?? '', narrative: r.narrative || '',
      beneficiaries_male: r.beneficiaries_male ?? '', beneficiaries_female: r.beneficiaries_female ?? '',
      beneficiaries_other: r.beneficiaries_other ?? '', beneficiaries_pwd: r.beneficiaries_pwd ?? '',
      beneficiaries_youth: r.beneficiaries_youth ?? '',
      budget_spent_vuv: r.budget_spent_vuv != null ? String(r.budget_spent_vuv) : '',
      issues: r.issues || '', lessons_learned: r.lessons_learned || '', next_steps: r.next_steps || '',
    });
    setFormErr(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); setFormErr(''); };

  const save = async () => {
    if (!form.activity_id)            { setFormErr(t('activityProgress.activity') + ' — ' + t('common.required')); return; }
    if (!form.reporting_period.trim()) { setFormErr(t('activityProgress.reportingPeriod') + ' — ' + t('common.required')); return; }
    setBusy(true); setFormErr('');
    const common = {
      p_reporting_period: form.reporting_period.trim(),
      p_period_type: form.period_type || 'Monthly',
      p_status: form.status || 'on_track',
      p_percent_complete: numOrNull(form.percent_complete),
      p_narrative: form.narrative.trim() || null,
      p_ben_male: numOrNull(form.beneficiaries_male),
      p_ben_female: numOrNull(form.beneficiaries_female),
      p_ben_other: numOrNull(form.beneficiaries_other),
      p_ben_pwd: numOrNull(form.beneficiaries_pwd),
      p_ben_youth: numOrNull(form.beneficiaries_youth),
      p_budget_spent: numOrNull(form.budget_spent_vuv),
      p_issues: form.issues.trim() || null,
      p_lessons: form.lessons_learned.trim() || null,
      p_next_steps: form.next_steps.trim() || null,
    };
    const resp = editingId
      ? await supabase.rpc('update_activity_progress', { p_id: editingId, ...common })
      : await supabase.rpc('create_activity_progress', { p_activity_id: form.activity_id, ...common });
    setBusy(false);
    if (resp.error) { setFormErr(resp.error.message); return; }
    toast.success(t('activityProgress.saved'));
    closeForm(); load();
  };

  const remove = async r => {
    if (!(await confirmDialog({
      title: t('activityProgress.confirmDeleteTitle', 'Delete report'),
      message: t('activityProgress.confirmDelete'),
      confirmLabel: t('common.delete', 'Delete'),
    }))) return;
    const { error } = await supabase.rpc('delete_activity_progress', { p_id: r.id });
    if (error) return toast.error(error.message);
    toast.success(t('activityProgress.deleted')); load();
  };

  const submitForReview = async r => {
    const { error } = await supabase.rpc('submit_activity_progress_for_review', { p_id: r.id });
    if (error) return toast.error(error.message);
    toast.success(t('activityProgress.submitted')); load();
  };

  const review = async (r, decision) => {
    setBusy(true);
    const { error } = await supabase.rpc('review_activity_progress', {
      p_id: r.id, p_decision: decision, p_note: reviewing?.note?.trim() || null,
    });
    setBusy(false); setReviewing(null);
    if (error) return toast.error(error.message);
    toast.success(t('activityProgress.reviewed')); load();
  };

  const project = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId]);

  return (
    <div className="page-pad animate-fade-up" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div className="section-label" style={{ marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ClipboardCheck size={13} /> FRM-03
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 4vw, 1.875rem)', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
            {t('activityProgress.title')}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>{t('activityProgress.subtitle')}</p>
        </div>
        {canEdit && projectId && !showForm && (
          <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>
            <Plus size={15} /> {t('activityProgress.newReport')}
          </button>
        )}
      </div>

      {/* Project selector */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <Field label={t('activityProgress.project')}>
          <Select
            value={projectId}
            onChange={v => { setParams(v ? { project: v } : {}); closeForm(); }}
            options={projects.map(p => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
            placeholder={t('activityProgress.selectProject')}
          />
        </Field>
      </div>

      {loadErr && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
          <AlertCircle size={15} /> {loadErr}
        </div>
      )}

      {!projectId ? (
        <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          {t('activityProgress.pickProjectHint')}
        </div>
      ) : (
        <>
          {/* ── Report form ─────────────────────────────────────────────── */}
          {showForm && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                {editingId ? t('activityProgress.editReport') : t('activityProgress.newReport')}
              </div>

              <Section title={t('activityProgress.sec1')}>
                <Field label={t('activityProgress.activity')} span>
                  <Select value={form.activity_id} onChange={v => set('activity_id', v)}
                    options={activities.map(a => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
                    placeholder={t('activityProgress.selectActivity')} />
                </Field>
                <Field label={t('activityProgress.periodType')}>
                  <Select value={form.period_type} onChange={v => set('period_type', v)} options={FREQUENCY} />
                </Field>
                <Field label={t('activityProgress.reportingPeriod')} hint={t('activityProgress.reportingPeriodHint')}>
                  <input className="field-input" value={form.reporting_period} onChange={e => set('reporting_period', e.target.value)} placeholder="e.g. January 2026" />
                </Field>
              </Section>

              <Section title={t('activityProgress.sec2')}>
                <Field label={t('activityProgress.rating')}>
                  <Select value={form.status} onChange={v => set('status', v)} options={PROGRESS_RATING} />
                </Field>
                <Field label={t('activityProgress.percentComplete')}>
                  <input className="field-input" type="number" min="0" max="100" value={form.percent_complete} onChange={e => set('percent_complete', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.narrative')} span>
                  <textarea className="field-input" rows={3} value={form.narrative} onChange={e => set('narrative', e.target.value)} placeholder={t('activityProgress.narrativeHint')} />
                </Field>
              </Section>

              <Section title={t('activityProgress.sec3')} cols={3}>
                <Field label={t('activityProgress.benFemale')}>
                  <input className="field-input" type="number" min="0" value={form.beneficiaries_female} onChange={e => set('beneficiaries_female', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.benMale')}>
                  <input className="field-input" type="number" min="0" value={form.beneficiaries_male} onChange={e => set('beneficiaries_male', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.benOther')}>
                  <input className="field-input" type="number" min="0" value={form.beneficiaries_other} onChange={e => set('beneficiaries_other', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.benPwd')}>
                  <input className="field-input" type="number" min="0" value={form.beneficiaries_pwd} onChange={e => set('beneficiaries_pwd', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.benYouth')}>
                  <input className="field-input" type="number" min="0" value={form.beneficiaries_youth} onChange={e => set('beneficiaries_youth', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.benTotal')}>
                  <input className="field-input" value={sumBen(form)} disabled readOnly />
                </Field>
              </Section>

              <Section title={t('activityProgress.sec4')}>
                <Field label={t('activityProgress.budgetSpent')} hint="VUV" span>
                  <input className="field-input" type="number" min="0" value={form.budget_spent_vuv} onChange={e => set('budget_spent_vuv', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.issues')} span>
                  <textarea className="field-input" rows={2} value={form.issues} onChange={e => set('issues', e.target.value)} />
                </Field>
                <Field label={t('activityProgress.lessons')} span>
                  <textarea className="field-input" rows={2} value={form.lessons_learned} onChange={e => set('lessons_learned', e.target.value)} placeholder={t('activityProgress.lessonsHint')} />
                </Field>
                <Field label={t('activityProgress.nextSteps')} span>
                  <textarea className="field-input" rows={2} value={form.next_steps} onChange={e => set('next_steps', e.target.value)} />
                </Field>
              </Section>

              {formErr && <div style={{ color: 'var(--red-600)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{formErr}</div>}
              <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem', flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={closeForm} style={{ padding: '0.6rem 1.1rem' }}>{t('form.cancel')}</button>
                <button className="btn-primary" onClick={save} disabled={busy} style={{ padding: '0.6rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('common.save')}
                </button>
              </div>
            </div>
          )}

          {/* ── Report list ─────────────────────────────────────────────── */}
          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{t('common.loading')}</div>
          ) : reports.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>{t('activityProgress.noReports')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {reports.map(r => {
                const sb = STATUS_BADGE[r.status] ?? STATUS_BADGE.on_track;
                const rb = REPORT_BADGE[r.report_status] ?? REPORT_BADGE.draft;
                return (
                  <div key={r.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-3)' }}>{r.code}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.55rem', borderRadius: 9999, background: sb.bg, color: sb.fg }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sb.dot }} />
                            {labelOf(PROGRESS_RATING, r.status)}
                          </span>
                          <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.55rem', borderRadius: 9999, background: rb.bg, color: rb.fg }}>
                            {labelOf(REPORT_STATUS, r.report_status)}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{r.period_type} · {r.reporting_period}</span>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-1)', marginTop: 3 }}>{r.activity_code} · {r.activity_name}</div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                          {r.percent_complete != null && <span>{Number(r.percent_complete)}% {t('activityProgress.complete')}</span>}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Users size={12} /> {r.beneficiaries_total ?? 0}</span>
                          {r.budget_spent_vuv != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Wallet size={12} /> {Number(r.budget_spent_vuv).toLocaleString()} VUV</span>}
                          {r.created_by_name && <span>{t('activityProgress.by')} {r.created_by_name}</span>}
                        </div>
                        {r.report_status === 'returned' && r.review_note && (
                          <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: 4 }}>↩ {r.review_note}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {canEdit && r.report_status !== 'approved' && (
                          <button className="btn-secondary" onClick={() => openEdit(r)} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Pencil size={13} /> {t('common.edit')}
                          </button>
                        )}
                        {canEdit && r.report_status !== 'pending_review' && r.report_status !== 'approved' && (
                          <button className="btn-secondary" onClick={() => submitForReview(r)} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Send size={13} /> {t('activityProgress.submitReview')}
                          </button>
                        )}
                        {canReview && r.report_status === 'pending_review' && (
                          <>
                            <button className="btn-primary" onClick={() => review(r, 'approved')} disabled={busy} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckCircle2 size={13} /> {t('activityProgress.approve')}
                            </button>
                            <button className="btn-secondary" onClick={() => setReviewing({ id: r.id, note: '' })} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <RotateCcw size={13} /> {t('activityProgress.returnForEdits')}
                            </button>
                          </>
                        )}
                        {canEdit && r.report_status !== 'approved' && (
                          <button className="btn-secondary" onClick={() => remove(r)} title={t('common.delete', 'Delete')} style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {(r.narrative || r.issues || r.lessons_learned || r.next_steps) && (
                      <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'grid', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                        {r.narrative && <div><strong style={{ color: 'var(--text-3)', fontWeight: 600 }}>{t('activityProgress.narrative')}: </strong>{r.narrative}</div>}
                        {r.issues && <div><strong style={{ color: 'var(--text-3)', fontWeight: 600 }}>{t('activityProgress.issues')}: </strong>{r.issues}</div>}
                        {r.lessons_learned && <div><strong style={{ color: 'var(--text-3)', fontWeight: 600 }}>{t('activityProgress.lessons')}: </strong>{r.lessons_learned}</div>}
                        {r.next_steps && <div><strong style={{ color: 'var(--text-3)', fontWeight: 600 }}>{t('activityProgress.nextSteps')}: </strong>{r.next_steps}</div>}
                      </div>
                    )}

                    {reviewing?.id === r.id && (
                      <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        <input className="field-input" placeholder={t('activityProgress.reviewNote')} value={reviewing.note}
                          onChange={e => setReviewing({ id: r.id, note: e.target.value })} style={{ marginBottom: '0.5rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button className="btn-secondary" onClick={() => setReviewing(null)} style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}>{t('form.cancel')}</button>
                          <button className="btn-danger" onClick={() => review(r, 'returned')} disabled={busy} style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer' }}>
                            {t('activityProgress.returnForEdits')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
