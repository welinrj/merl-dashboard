import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ClipboardList, Plus, Pencil, Send, CheckCircle2, RotateCcw,
  ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  PROJECT_STATUS, PROJECT_TYPE, CLIMATE_THEME, EXPECTED_OUTCOME, COVERAGE_TYPE,
  PROVINCES, DONOR, CURRENCY, SDG, REGISTRATION_STATUS, labelOf,
} from '../constants/formOptions';

const EDITOR_ROLES   = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const REVIEWER_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_SENIOR', 'ROLE_DOCC_MEO'];

const REG_BADGE = {
  draft:          { bg: '#f1f5f9', fg: '#475569' },
  pending_review: { bg: '#fef3c7', fg: '#92400e' },
  approved:       { bg: '#d1fae5', fg: '#065f46' },
  returned:       { bg: '#fee2e2', fg: '#991b1b' },
};

const csvToArray = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const arrayToCsv = a => (a || []).join(', ');

const EMPTY = {
  code: '', name: '', acronym: '', description: '',
  status: 'planning', project_type: '', category: 'CC-ADAPT', lead_agency: '',
  primary_climate_theme: '', secondary_climate_themes: [], expected_primary_outcome: '',
  nsdp_alignment: [], sdg_alignment: [],
  coverage_type: '', provinces: [], islands: '', area_councils: '', communities: '',
  donor: '', funding_window: '', currency: 'VUV', budget_vuv: '', executing_agency: '',
  implementing_partners: '', project_manager_id: '', me_officer_id: '', finance_officer_id: '',
  approval_date: '', start_date: '', end_date: '',
  est_direct_beneficiaries: '', est_indirect_beneficiaries: '',
  expected_households: '', expected_communities: '',
};

// ── small field helpers ──────────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div>
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

const ChipMulti = ({ value, onChange, options }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
    {options.map(o => {
      const on = value.includes(o.value);
      return (
        <button key={o.value} type="button"
          onClick={() => onChange(on ? value.filter(v => v !== o.value) : [...value, o.value])}
          style={{
            fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: 9999,
            cursor: 'pointer', border: '1.5px solid',
            borderColor: on ? 'var(--green-600)' : 'var(--border)',
            background: on ? 'var(--green-50)' : 'var(--white)',
            color: on ? 'var(--green-700)' : 'var(--text-2)',
          }}>
          {o.label}
        </button>
      );
    })}
  </div>
);

const Section = ({ title, children, cols = 2 }) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <div className="section-label" style={{ marginBottom: '0.75rem' }}>{title}</div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.875rem' }}>
      {children}
    </div>
  </div>
);

export default function ProjectRegistration({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [busy, setBusy]         = useState(false);
  const [formErr, setFormErr]   = useState('');
  const [reviewing, setReviewing] = useState(null); // project pending review action

  const canEdit   = EDITOR_ROLES.includes(user?.role);
  const canReview = REVIEWER_ROLES.includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    const [pr, us] = await Promise.all([
      supabase.from('v_projects').select('*').order('code'),
      supabase.from('v_admin_users').select('id,full_name,role').order('full_name'),
    ]);
    if (pr.error) setLoadErr(pr.error.message);
    else setProjects(pr.data ?? []);
    if (!us.error) setOfficers(us.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditingId(null); setForm(EMPTY); setFormErr(''); setShowForm(true); };
  const openEdit = p => {
    setEditingId(p.id);
    setForm({
      code: p.code || '', name: p.name || '', acronym: p.acronym || '',
      description: p.description || '', status: p.status || 'planning',
      project_type: p.project_type || '', category: p.category || 'CC-ADAPT',
      lead_agency: p.lead_agency || '',
      primary_climate_theme: p.primary_climate_theme || '',
      secondary_climate_themes: p.secondary_climate_themes || [],
      expected_primary_outcome: p.expected_primary_outcome || '',
      nsdp_alignment: p.nsdp_alignment || [], sdg_alignment: p.sdg_alignment || [],
      coverage_type: p.coverage_type || '', provinces: p.provinces || [],
      islands: arrayToCsv(p.islands), area_councils: arrayToCsv(p.area_councils),
      communities: arrayToCsv(p.communities),
      donor: p.donor || '', funding_window: p.funding_window || '',
      currency: p.currency || 'VUV',
      budget_vuv: p.budget_vuv != null ? String(Math.round(Number(p.budget_vuv))) : '',
      executing_agency: p.executing_agency || '',
      implementing_partners: arrayToCsv(p.implementing_partners),
      project_manager_id: p.project_manager_id || '', me_officer_id: p.me_officer_id || '',
      finance_officer_id: p.finance_officer_id || '',
      approval_date: p.approval_date || '', start_date: p.start_date || '', end_date: p.end_date || '',
      est_direct_beneficiaries: p.est_direct_beneficiaries ?? '',
      est_indirect_beneficiaries: p.est_indirect_beneficiaries ?? '',
      expected_households: p.expected_households ?? '',
      expected_communities: p.expected_communities ?? '',
    });
    setFormErr(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); setFormErr(''); };

  const numOrNull = v => (v === '' || v == null ? null : Number(v));

  const save = async () => {
    if (!form.name.trim()) { setFormErr(t('registration.projectTitle') + ' — ' + t('common.required')); return; }
    setBusy(true); setFormErr('');
    const common = {
      p_name: form.name.trim(), p_category: form.category || 'CC-ADAPT',
      p_lead_agency: form.lead_agency.trim() || null,
      p_description: form.description.trim() || null,
      p_start_date: form.start_date || null, p_end_date: form.end_date || null,
      p_budget_vuv: form.budget_vuv ? Number(form.budget_vuv) : 0,
      p_status: form.status, p_provinces: form.provinces,
      p_acronym: form.acronym.trim() || null,
      p_project_type: form.project_type || null,
      p_primary_climate_theme: form.primary_climate_theme || null,
      p_secondary_climate_themes: form.secondary_climate_themes,
      p_expected_primary_outcome: form.expected_primary_outcome || null,
      p_nsdp_alignment: form.nsdp_alignment, p_sdg_alignment: form.sdg_alignment,
      p_coverage_type: form.coverage_type || null,
      p_islands: csvToArray(form.islands), p_area_councils: csvToArray(form.area_councils),
      p_communities: csvToArray(form.communities),
      p_donor: form.donor || null, p_funding_window: form.funding_window.trim() || null,
      p_currency: form.currency || 'VUV', p_executing_agency: form.executing_agency.trim() || null,
      p_implementing_partners: csvToArray(form.implementing_partners),
      p_project_manager_id: form.project_manager_id || null,
      p_me_officer_id: form.me_officer_id || null,
      p_finance_officer_id: form.finance_officer_id || null,
      p_approval_date: form.approval_date || null,
      p_est_direct_beneficiaries: numOrNull(form.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: numOrNull(form.est_indirect_beneficiaries),
      p_expected_households: numOrNull(form.expected_households),
      p_expected_communities: numOrNull(form.expected_communities),
    };
    const resp = editingId
      ? await supabase.rpc('admin_update_project', { p_id: editingId, ...common })
      : await supabase.rpc('admin_create_project', { p_code: form.code.trim(), ...common });
    setBusy(false);
    if (resp.error) { setFormErr(resp.error.message); return; }
    toast.success(t('registration.saved'));
    closeForm(); load();
  };

  const submitForReview = async p => {
    const { error } = await supabase.rpc('submit_project_for_review', { p_id: p.id });
    if (error) return toast.error(error.message);
    toast.success(t('registration.submitted')); load();
  };

  const review = async (p, decision) => {
    setBusy(true);
    const { error } = await supabase.rpc('review_project', {
      p_id: p.id, p_decision: decision, p_note: reviewing?.note?.trim() || null,
    });
    setBusy(false); setReviewing(null);
    if (error) return toast.error(error.message);
    toast.success(t('registration.reviewed')); load();
  };

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1400 }} className="animate-fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <div className="section-label" style={{ marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ClipboardList size={13} /> FRM-01
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
            {t('registration.title')}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>{t('registration.subtitle')}</p>
        </div>
        {canEdit && !showForm && (
          <button className="btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>
            <Plus size={15} /> {t('registration.newProject')}
          </button>
        )}
      </div>

      {loadErr && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
          <AlertCircle size={15} /> {loadErr}
        </div>
      )}

      {/* ── Registration form ─────────────────────────────────────────── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            {editingId ? t('registration.editProject') : t('registration.newProject')}
          </div>

          <Section title={t('registration.sec1')}>
            <Field label={t('registration.projectId')} hint={editingId ? form.code : t('registration.autoAssigned')}>
              <input className="field-input" value={form.code} onChange={e => set('code', e.target.value)}
                placeholder="DCC-YYYY-###" disabled={!!editingId} />
            </Field>
            <Field label={t('registration.status')}>
              <Select value={form.status} onChange={v => set('status', v)} options={PROJECT_STATUS} />
            </Field>
            <Field label={t('registration.projectTitle')}>
              <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label={t('registration.acronym')}>
              <input className="field-input" value={form.acronym} onChange={e => set('acronym', e.target.value)} />
            </Field>
            <Field label={t('registration.projectType')}>
              <Select value={form.project_type} onChange={v => set('project_type', v)} options={PROJECT_TYPE} />
            </Field>
            <Field label={t('registration.leadAgency')}>
              <input className="field-input" value={form.lead_agency} onChange={e => set('lead_agency', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('registration.description')}>
                <textarea className="field-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title={t('registration.sec2')} cols={1}>
            <Field label={t('registration.primaryTheme')}>
              <Select value={form.primary_climate_theme} onChange={v => set('primary_climate_theme', v)} options={CLIMATE_THEME} />
            </Field>
            <Field label={t('registration.secondaryThemes')}>
              <ChipMulti value={form.secondary_climate_themes} onChange={v => set('secondary_climate_themes', v)} options={CLIMATE_THEME} />
            </Field>
            <Field label={t('registration.expectedOutcome')}>
              <Select value={form.expected_primary_outcome} onChange={v => set('expected_primary_outcome', v)} options={EXPECTED_OUTCOME} />
            </Field>
            <Field label={t('registration.sdg')}>
              <ChipMulti value={form.sdg_alignment} onChange={v => set('sdg_alignment', v)} options={SDG} />
            </Field>
            <Field label={t('registration.nsdp')} hint={t('registration.commaSeparated')}>
              <input className="field-input" value={arrayToCsv(form.nsdp_alignment)} onChange={e => set('nsdp_alignment', csvToArray(e.target.value))} />
            </Field>
          </Section>

          <Section title={t('registration.sec3')}>
            <Field label={t('registration.coverageType')}>
              <Select value={form.coverage_type} onChange={v => set('coverage_type', v)} options={COVERAGE_TYPE} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('registration.provinces')}>
                <ChipMulti value={form.provinces} onChange={v => set('provinces', v)} options={PROVINCES} />
              </Field>
            </div>
            <Field label={t('registration.islands')} hint={t('registration.commaSeparated')}>
              <input className="field-input" value={form.islands} onChange={e => set('islands', e.target.value)} />
            </Field>
            <Field label={t('registration.areaCouncils')} hint={t('registration.commaSeparated')}>
              <input className="field-input" value={form.area_councils} onChange={e => set('area_councils', e.target.value)} />
            </Field>
            <Field label={t('registration.communities')} hint={t('registration.commaSeparated')}>
              <input className="field-input" value={form.communities} onChange={e => set('communities', e.target.value)} />
            </Field>
          </Section>

          <Section title={t('registration.sec4')}>
            <Field label={t('registration.donor')}>
              <Select value={form.donor} onChange={v => set('donor', v)} options={DONOR} />
            </Field>
            <Field label={t('registration.fundingWindow')}>
              <input className="field-input" value={form.funding_window} onChange={e => set('funding_window', e.target.value)} />
            </Field>
            <Field label={t('registration.currency')}>
              <Select value={form.currency} onChange={v => set('currency', v)} options={CURRENCY} />
            </Field>
            <Field label={t('registration.budget')}>
              <input className="field-input" type="number" min="0" value={form.budget_vuv} onChange={e => set('budget_vuv', e.target.value)} />
            </Field>
            <Field label={t('registration.executingAgency')}>
              <input className="field-input" value={form.executing_agency} onChange={e => set('executing_agency', e.target.value)} />
            </Field>
            <Field label={t('registration.partners')} hint={t('registration.commaSeparated')}>
              <input className="field-input" value={form.implementing_partners} onChange={e => set('implementing_partners', e.target.value)} />
            </Field>
            <Field label={t('registration.projectManager')}>
              <Select value={form.project_manager_id} onChange={v => set('project_manager_id', v)}
                options={officers.map(o => ({ value: o.id, label: o.full_name }))} />
            </Field>
            <Field label={t('registration.meOfficer')}>
              <Select value={form.me_officer_id} onChange={v => set('me_officer_id', v)}
                options={officers.map(o => ({ value: o.id, label: o.full_name }))} />
            </Field>
            <Field label={t('registration.financeOfficer')}>
              <Select value={form.finance_officer_id} onChange={v => set('finance_officer_id', v)}
                options={officers.map(o => ({ value: o.id, label: o.full_name }))} />
            </Field>
          </Section>

          <Section title={t('registration.sec5')}>
            <Field label={t('registration.approvalDate')}>
              <input className="field-input" type="date" value={form.approval_date} onChange={e => set('approval_date', e.target.value)} />
            </Field>
            <Field label={t('registration.startDate')}>
              <input className="field-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </Field>
            <Field label={t('registration.endDate')}>
              <input className="field-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </Field>
            <Field label={t('registration.directBen')}>
              <input className="field-input" type="number" min="0" value={form.est_direct_beneficiaries} onChange={e => set('est_direct_beneficiaries', e.target.value)} />
            </Field>
            <Field label={t('registration.indirectBen')}>
              <input className="field-input" type="number" min="0" value={form.est_indirect_beneficiaries} onChange={e => set('est_indirect_beneficiaries', e.target.value)} />
            </Field>
            <Field label={t('registration.households')}>
              <input className="field-input" type="number" min="0" value={form.expected_households} onChange={e => set('expected_households', e.target.value)} />
            </Field>
            <Field label={t('registration.expCommunities')}>
              <input className="field-input" type="number" min="0" value={form.expected_communities} onChange={e => set('expected_communities', e.target.value)} />
            </Field>
          </Section>

          {formErr && <div style={{ color: 'var(--red-600)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{formErr}</div>}
          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button className="btn-secondary" onClick={closeForm} style={{ padding: '0.6rem 1.1rem' }}>{t('form.cancel')}</button>
            <button className="btn-primary" onClick={save} disabled={busy} style={{ padding: '0.6rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* ── Project list ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{t('common.loading')}</div>
      ) : projects.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>{t('registration.noProjects')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {projects.map(p => {
            const badge = REG_BADGE[p.registration_status] ?? REG_BADGE.draft;
            return (
              <div key={p.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-3)' }}>{p.code}</span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.55rem', borderRadius: 9999, background: badge.bg, color: badge.fg }}>
                        {labelOf(REGISTRATION_STATUS, p.registration_status)}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{labelOf(PROJECT_STATUS, p.status)}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-1)', marginTop: 3 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                      {p.primary_climate_theme || '—'}{p.project_manager_name ? ` · PM: ${p.project_manager_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {canEdit && (
                      <button className="btn-secondary" onClick={() => openEdit(p)} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Pencil size={13} /> {t('common.edit')}
                      </button>
                    )}
                    {canEdit && p.registration_status !== 'pending_review' && p.registration_status !== 'approved' && (
                      <button className="btn-secondary" onClick={() => submitForReview(p)} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Send size={13} /> {t('registration.submitReview')}
                      </button>
                    )}
                    {canReview && p.registration_status === 'pending_review' && (
                      <>
                        <button className="btn-primary" onClick={() => review(p, 'approved')} disabled={busy} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={13} /> {t('registration.approve')}
                        </button>
                        <button className="btn-secondary" onClick={() => setReviewing({ id: p.id, note: '' })} style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <RotateCcw size={13} /> {t('registration.returnForEdits')}
                        </button>
                      </>
                    )}
                    <button className="btn-secondary" onClick={() => navigate(`/results-framework?project=${p.id}`)}
                      title={t('registration.resultsFramework')}
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {t('registration.resultsFramework')} <ChevronRight size={13} />
                    </button>
                  </div>
                </div>

                {reviewing?.id === p.id && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                    <input className="field-input" placeholder={t('registration.reviewNote')} value={reviewing.note}
                      onChange={e => setReviewing({ id: p.id, note: e.target.value })} style={{ marginBottom: '0.5rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" onClick={() => setReviewing(null)} style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}>{t('form.cancel')}</button>
                      <button className="btn-danger" onClick={() => review(p, 'returned')} disabled={busy} style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer' }}>
                        {t('registration.returnForEdits')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
