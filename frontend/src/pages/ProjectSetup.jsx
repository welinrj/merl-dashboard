// =============================================================================
// ProjectSetup.jsx — DoCC Standardised MERL "Project Setup".
// Covers the setup half of the DoCC form as five independent sections:
//   1. Project Profile   (Form 1)  -> upsert_project
//   2. Results Framework (Form 2)  -> objective/outcome/output RPCs (0009)
//   3. Indicators        (Form 3)  -> upsert_project_indicator
//   4. Activities        (Form 5)  -> upsert_project_activity_full
//   5. Locations         (Form 7)  -> upsert_project_location
// Reads through the public.v_* views; writes through the SECURITY DEFINER RPCs.
//
// This page used to be a wizard: five steps, with 2-5 locked until a project
// existed, and Previous/Next to walk between them. That shape fits creating a
// project, which happens once per project. It fought the job officers actually
// do here — opening a project months later to correct one field — because
// reaching that field meant walking the wizard to it.
//
// So the model is completeness, not sequence. Every section is open at any
// time, each carries its own state chip and its own save, and what is missing
// is named rather than implied by which step you have reached. The reason the
// wizard locked steps 2-5 has not gone away — those sections write against a
// project id, so they need a saved project — but it is enforced at save time,
// with a sentence, instead of by a shut door.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X, Send,
  CheckCircle2, AlertTriangle, MapPin,
} from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import { dbErrorMessage, isMissingRpcArgument } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import * as OPT from '../constants/formOptions';
import { islandsForProvince, areaCouncilsForProvince, PROVINCE_LIST } from '../constants/vanuatuGeo';
import { useTranslation } from 'react-i18next';
import { localised, sourceRow, i18nCols } from '../lib/contentLocale';
import { fmtDate, fmtNum } from '../lib/locale';
import TranslationPanel from '../components/ui/TranslationPanel';
import VillageSelect from '../components/ui/VillageSelect';
import MapPinPicker from '../components/ui/MapPinPicker';
import DraftStatus, { DraftChip } from '../components/ui/DraftStatus';
import { useFormDraft, useDraftPrefixes, draftKey } from '../lib/formDraft';
import {
  checkSection, summarise, sectionState, SECTION_DONE, SECTION_PARTIAL,
} from '../lib/completion';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// `draftKind` is the segment each section's forms build their draft keys from,
// so a section can be marked when it holds work that was left unfinished. These
// segments are unchanged from the wizard: an officer who left a half-filled form
// before this page changed shape finds it waiting in the same place.
const SECTIONS = [
  { key: 'profile',    label: 'ps.projectProfile',   form: 1, draftKind: 'profile' },
  { key: 'results',    label: 'ps.resultsFramework', form: 2, draftKind: 'result' },
  { key: 'indicators', label: 'ps.indicators',       form: 3, draftKind: 'indicator' },
  { key: 'activities', label: 'ps.activities',       form: 5, draftKind: 'activity' },
  { key: 'locations',  label: 'ps.locations',        form: 7, draftKind: 'location' },
];

// What the profile has to carry before the project counts as set up. These are
// the fields the rest of the portal reads: Financial Analysis needs a budget,
// the timeline needs both dates, Geographic Coverage needs provinces, and every
// list and report needs a title and a status. The other twenty-odd fields on
// Form 1 are useful but nothing downstream breaks without them, so they are not
// allowed to hold up a submission.
const REQUIRED_PROFILE_FIELDS = [
  { name: 'name',        label: 'ps.projectTitle' },
  { name: 'status',      label: 'ps.status' },
  { name: 'start_date',  label: 'ps.startDate' },
  { name: 'end_date',    label: 'ps.endDate' },
  { name: 'budget_vuv',  label: 'ps.approvedBudget' },
  { name: 'provinces',   label: 'ps.provinces' },
];

// A value counts as entered when it is more than whitespace, and an empty
// multi-select counts as unanswered rather than as "no provinces".
const hasValue = (row, name) => {
  const v = row?.[name];
  if (Array.isArray(v)) return v.length > 0;
  if (v === null || v === undefined) return false;
  return String(v).trim() !== '';
};

const btn = (bg, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem',
  fontSize: '0.8125rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer',
  color: '#fff', background: bg, ...extra,
});
const ghostBtn = { ...btn('var(--white)'), color: 'var(--text-2)', border: '1px solid var(--border)' };
// These buttons are styled with inline style objects, which cannot express a
// :disabled rule — so a disabled button kept rendering at full strength and read
// as clickable. Spread this alongside the base style whenever `disabled` is set.
const disabledBtn = { opacity: 0.45, cursor: 'not-allowed' };
// Compact text-style row actions (edit/delete on cards) — a filled button per
// row reads heavier than these actions need (spec §11/§12).
const rowGhost = (extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.4rem',
  fontSize: '0.78rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none',
  cursor: 'pointer', color: 'var(--text-2)', background: 'none', ...extra,
});

// ── The state chip carried by every section, in both columns ────────────────
// One component so the rail and the section headers can never disagree about
// what state a section is in.
function StateChip({ section, t }) {
  const state = sectionState(section);
  const done = state === SECTION_DONE;
  const partial = state === SECTION_PARTIAL;
  const label = done ? t('ps.chipDone')
    : partial ? t('ps.chipPartial', { filled: section.filled, total: section.total })
      : t('ps.chipEmpty');
  return (
    <span className={`ps-chip${done ? ' is-done' : partial ? ' is-partial' : ''}`}>
      {done && <Check size={11} aria-hidden="true" />}
      {label}
    </span>
  );
}

export default function ProjectSetup({ user }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null); // null = choosing / new
  const [users, setUsers] = useState([]);
  // Which sections are expanded. Any section can be opened at any time; the
  // profile starts open because it is where a new project begins.
  const [open, setOpen] = useState({ profile: true });
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [objectives, setObjectives] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [activities, setActivities] = useState([]);
  const [locations, setLocations] = useState([]);
  // The selected project's full row. The dropdown only carries enough to label
  // an option; the identity card and the profile checks need the rest. Fetched
  // here rather than lifted out of ProfileStep on purpose — that component's
  // load is what gates its draft restore, and a project's row is a few hundred
  // bytes, so a second read is cheaper than making draft handling conditional
  // on a parent's fetch landing.
  const [projectRow, setProjectRow] = useState(null);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  const sectionRefs = useRef({});

  const loadProjects = useCallback(async () => {
    const { data } = await localised(() => supabase.from('v_projects').select(i18nCols('id, code, name, status')).order('code'));
    setProjects(data ?? []);
    return data ?? [];
  }, [lang]);

  useEffect(() => {
    loadProjects();
    supabase.rpc('list_assignable_users').then(({ data }) => setUsers(data ?? []));
  }, [loadProjects]);

  // Deep-link from Global Search (§59): ?project=<id> selects that project.
  // It used to jump to the Results step; there are no steps now, so it simply
  // opens the project with every section reachable.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const pid = searchParams.get('project');
    if (pid && projects.some((p) => p.id === pid)) {
      setProjectId(pid);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, projects, setSearchParams]);

  const loadFramework = useCallback(async (pid) => {
    if (!pid) {
      setObjectives([]); setOutcomes([]); setOutputs([]); setIndicators([]);
      setActivities([]); setLocations([]); setProjectRow(null);
      return;
    }
    const [row, obj, oc, op, ind, act, loc] = await Promise.all([
      supabase.from('v_projects').select('*').eq('id', pid).single(),
      localised(supabase.from('v_objectives').select('*').eq('project_id', pid).order('code')),
      localised(supabase.from('v_outcomes').select('*').eq('project_id', pid).order('code')),
      localised(supabase.from('v_outputs').select('*').eq('project_id', pid).order('code')),
      localised(supabase.from('v_project_indicators').select('*').eq('project_id', pid).order('code')),
      localised(supabase.from('v_project_activities').select('*').eq('project_id', pid).order('code')),
      localised(supabase.from('v_project_locations').select('*').eq('project_id', pid).order('created_at')),
    ]);
    setProjectRow(row.data ?? null);
    setObjectives(obj.data ?? []); setOutcomes(oc.data ?? []); setOutputs(op.data ?? []);
    setIndicators(ind.data ?? []); setActivities(act.data ?? []); setLocations(loc.data ?? []);
  }, [lang]);

  useEffect(() => { loadFramework(projectId); }, [projectId, loadFramework]);

  // ── Completeness ───────────────────────────────────────────────────────────
  // Built as checks so what is missing can be named. The arithmetic on top of
  // them is lib/completion.js, the same module MERL Reporting rolls its period
  // up with — one definition of "how complete is this record" for both pages.
  //
  // Labels are resolved here rather than carried as keys, because several of
  // them are counts and need the plural rule applied with the number.
  const sections = useMemo(() => {
    if (!project) return [];
    const noBaseline = indicators.filter((i) => i.baseline_value == null).length;
    const noTarget = indicators.filter((i) => i.target_value == null && !i.is_qualitative).length;
    const noFreq = indicators.filter((i) => !i.frequency).length;
    return [
      checkSection('profile',
        REQUIRED_PROFILE_FIELDS.map((f) => ({ ok: hasValue(projectRow, f.name), label: t(f.label) })),
        { label: 'ps.projectProfile' }),
      checkSection('results', [
        { ok: objectives.length > 0, label: t('ps.addObjective') },
        { ok: outcomes.length > 0, label: t('ps.addOutcome') },
        { ok: outputs.length > 0, label: t('ps.addOutput') },
      ], { label: 'ps.resultsFramework' }),
      checkSection('indicators', [
        { ok: indicators.length > 0, label: t('ps.addIndicator') },
        // Only asked once there is an indicator to ask it of — otherwise a
        // project with no indicators would fail three checks for one problem.
        indicators.length > 0 && { ok: noBaseline === 0, label: t('ps.missingBaseline', { count: noBaseline }) },
        indicators.length > 0 && { ok: noTarget === 0, label: t('ps.missingTarget', { count: noTarget }) },
        indicators.length > 0 && { ok: noFreq === 0, label: t('ps.missingFreq', { count: noFreq }) },
      ], { label: 'ps.indicators' }),
      checkSection('activities', [
        { ok: activities.length > 0, label: t('ps.addActivity') },
      ], { label: 'ps.activities' }),
      checkSection('locations', [
        { ok: locations.length > 0, label: t('ps.addLocation') },
      ], { label: 'ps.locations' }),
    ];
  }, [project, projectRow, objectives, outcomes, outputs, indicators, activities, locations, t]);

  const byKey = useMemo(() => Object.fromEntries(sections.map((s) => [s.key, s])), [sections]);
  const summary = useMemo(() => summarise(sections), [sections]);

  // Unfinished entries, per section — keyed exactly as the wizard keyed them.
  const sectionDraftPrefix = useCallback((s) => draftKey(
    'ps', user?.id, s.key === 'profile' ? (projectId ?? 'new') : projectId, s.draftKind,
  ), [user?.id, projectId]);
  const draftPrefixes = useMemo(() => SECTIONS.map(sectionDraftPrefix), [sectionDraftPrefix]);
  const draftedPrefixes = useDraftPrefixes(draftPrefixes);
  const sectionHasDraft = (s) => draftedPrefixes.has(sectionDraftPrefix(s));

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  // Opening from the rail or the banner: expand it, then bring it into view.
  // Expanding first means the scroll lands on the section's content rather than
  // on a collapsed header that is about to grow.
  const jumpTo = useCallback((key) => {
    setOpen((o) => ({ ...o, [key]: true }));
    requestAnimationFrame(() => {
      sectionRefs.current[key]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  // The first section holding an unmet check — where "fix this" should land.
  const firstBlocking = summary.missingRequired[0];
  // Every unmet check, with the section it belongs to, so the banner can say
  // where they are rather than only how many there are.
  const blockingIssues = useMemo(
    () => summary.missingRequired.flatMap((s) => (s.issues ?? []).map((i) => ({ ...i, section: s }))),
    [summary]);

  // Where that work is. "2 required fields, in Project Profile" is the sentence
  // worth reading; the same sentence naming all five sections is the bare count
  // again with more words, and it is what overflows the banner in French.
  const missing = summary.missingRequired;
  const blockingWhere = missing.length === 1
    ? t('ps.whereOne', { section: t(missing[0].label) })
    : missing.length === 2
      ? t('ps.whereTwo', { first: t(missing[0].label), second: t(missing[1].label) })
      : t('ps.whereMany', { count: missing.length, first: t(missing[0]?.label ?? '') });

  const submitForReview = async () => {
    if (!project) return;
    if (summary.missingRequired.length) {
      toast.error(t('ps.submitBlocked', { section: t(summary.missingRequired[0].label) }));
      jumpTo(summary.missingRequired[0].key);
      return;
    }
    const pending = SECTIONS.filter((s) => sectionHasDraft(s));
    if (pending.length && !(await confirmDialog({
      title: t('merl.submitDraftsTitle'),
      message: t('merl.submitDrafts', { sections: pending.map((s) => t(s.label)).join(', ') }),
      confirmLabel: t('merl.submitAnyway'), cancelLabel: t('merl.backToDrafts'), danger: false,
    }))) { jumpTo(pending[0].key); return; }

    setSubmitting(true);
    const { error } = await supabase.rpc('submit_project_for_review', { p_id: project.id });
    setSubmitting(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(t('ps.submittedForReview'));
    loadFramework(projectId);
  };

  if (!canEdit) {
    return (
      <div className="page-pad" style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>{t('ps.projectSetup')}</h1>
        <p style={{ color: 'var(--text-2)' }}>{t('ps.readOnlyNotice')}</p>
      </div>
    );
  }

  const duration = projectRow?.start_date && projectRow?.end_date
    ? `${fmtDate(projectRow.start_date)} → ${fmtDate(projectRow.end_date)}`
    : null;

  return (
    <div className="page-pad ps-page">
      <style>{`
        .ps-page{max-width:1200px;margin:0 auto}
        .ps-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:1rem;align-items:start;margin-top:.9rem}
        /* With no project chosen the rail holds one line of text — a column
           reserved for it just makes the form narrower for nothing, so the
           notice goes full width above the form and the grid collapses. */
        .ps-layout.is-empty{grid-template-columns:1fr}
        .ps-layout.is-empty .ps-rail{position:static}
        .ps-layout.is-empty .ps-idcard{padding:.7rem .9rem}
        .ps-rail{position:sticky;top:1rem;display:flex;flex-direction:column;gap:.7rem}
        .ps-idcard{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.9rem}
        .ps-idcard h2{margin:0;font-size:.95rem;line-height:1.25;font-family:var(--font-display)}
        .ps-idmeta{margin-top:.2rem;font-size:.7rem;color:var(--text-3);font-family:var(--font-mono)}
        .ps-ring-row{display:flex;align-items:center;gap:.7rem;margin:.8rem 0 .2rem}
        .ps-ring{flex-shrink:0}
        .ps-ring-cap{font-size:.68rem;color:var(--text-3);line-height:1.3}
        .ps-facts{list-style:none;margin:.8rem 0 0;padding:.7rem 0 0;border-top:1px solid var(--border);
          display:flex;flex-direction:column;gap:.35rem}
        .ps-facts li{display:flex;justify-content:space-between;gap:.5rem;font-size:.74rem}
        .ps-facts dt{color:var(--text-3)}
        .ps-facts dd{margin:0;font-weight:600;text-align:right;min-width:0;overflow-wrap:anywhere}
        .ps-seclist{border:1px solid var(--border);border-radius:10px;background:var(--white);overflow:hidden}
        .ps-seclist button{display:flex;align-items:center;gap:.45rem;width:100%;padding:.5rem .7rem;
          border:none;border-bottom:1px solid var(--border);background:none;cursor:pointer;font:inherit;
          font-size:.78rem;font-weight:600;color:var(--text-2);text-align:left}
        .ps-seclist button:last-child{border-bottom:none}
        .ps-seclist button:hover{background:var(--surface-1)}
        .ps-seclist .ps-secname{flex:1;min-width:0;overflow-wrap:anywhere}
        /* Chips carry their own words, which are longer in French — they wrap
           rather than stretching the rail or clipping. */
        .ps-chip{display:inline-flex;align-items:center;gap:.22rem;flex-shrink:0;
          padding:.12rem .4rem;border-radius:9999px;font-size:.65rem;font-weight:700;
          border:1px solid var(--border);background:var(--white);color:var(--text-3);
          white-space:normal;text-align:center;line-height:1.25}
        .ps-chip.is-done{border-color:#16a34a55;background:#dcece2;color:#155e34}
        .ps-chip.is-partial{border-color:#d9a62966;background:#fdf3dc;color:#8a6416}
        .ps-banner{border:1px solid #d9a62966;background:#fdf3dc;border-radius:10px;padding:.75rem .9rem;margin-bottom:.8rem}
        .ps-banner-head{display:flex;gap:.45rem;align-items:flex-start;font-size:.85rem;font-weight:700;color:#8a6416}
        .ps-banner ul{margin:.45rem 0 0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.2rem}
        .ps-banner li{font-size:.79rem;color:var(--text-2)}
        .ps-linkbtn{background:none;border:none;padding:0;color:var(--green-700);cursor:pointer;
          text-decoration:underline;font:inherit;text-align:left}
        .ps-ok{border:1px solid #16a34a55;background:#dcece2;border-radius:10px;padding:.7rem .9rem;
          margin-bottom:.8rem;display:flex;align-items:center;gap:.5rem;color:#155e34;font-weight:700;font-size:.85rem}
        .ps-section{border:1px solid var(--border);border-radius:10px;background:var(--white);margin-bottom:.7rem;overflow:hidden;scroll-margin-top:1rem}
        .ps-sechead{display:flex;align-items:center;gap:.55rem;width:100%;padding:.7rem .9rem;border:none;
          background:none;cursor:pointer;font:inherit;text-align:left}
        .ps-sechead:hover{background:var(--surface-1)}
        .ps-sechead .ps-title{font-size:.9rem;font-weight:700;min-width:0;overflow-wrap:anywhere}
        .ps-sechead .ps-form{font-size:.7rem;color:var(--text-3);flex-shrink:0}
        .ps-secbody{padding:0 .9rem 1rem;border-top:1px solid var(--border)}
        .ps-submitbar{position:sticky;bottom:0;z-index:5;margin-top:.9rem;
          display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;
          padding:.7rem .9rem;border:1px solid var(--border);border-radius:10px;
          background:var(--white);box-shadow:0 -2px 10px rgba(20,45,40,.06)}
        .ps-submitcount{font-size:.8rem;font-weight:700}
        .ps-submitwhy{font-size:.75rem;color:var(--text-3);max-width:42ch}

        .ps-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem}
        .ps-full{grid-column:1 / -1}
        .ps-sec{grid-column:1 / -1;margin:1.4rem 0 0;padding-bottom:.4rem;
          border-bottom:1px solid var(--border);font-size:.75rem;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
        .ps-sec-first{margin-top:0}
        .field-hint{display:block;margin-top:.25rem;font-size:.72rem;color:var(--text-3)}
        /* Inputs are sized to what goes in them. A three-letter acronym in a
           985px box reads as a mistake and makes the form impossible to scan;
           these caps are maxima, so every one of them still shrinks on a phone. */
        .ps-w-title .field-input{max-width:640px}
        .ps-w-acronym .field-input{max-width:170px}
        .ps-w-currency .field-input{max-width:140px}
        .ps-w-date .field-input{max-width:170px}
        .ps-w-budget .field-input{max-width:220px}
        .ps-w-num .field-input{max-width:170px}
        .ps-w-med .field-input{max-width:420px}
        .ps-table{width:100%;border-collapse:collapse;font-size:.85rem}
        .ps-table th,.ps-table td{padding:.5rem .6rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .ps-table th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        .ps-card{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.75rem;margin-bottom:.5rem}
        .ps-cards{display:none}

        /* The rail is a wide-screen idea: below 1024px it becomes a normal block
           above the sections rather than a column competing with the forms. */
        @media (max-width:1024px){
          .ps-layout{grid-template-columns:1fr}
          .ps-rail{position:static}
        }
        @media (max-width:640px){
          .ps-grid{grid-template-columns:1fr}
          .ps-desktop{display:none}
          .ps-cards{display:block}
          .ps-submitbar{position:static;box-shadow:none}
        }
      `}</style>

      <PageHeader title={t('ps.projectSetup')} subtitle={t('ps.pageSubtitle')} />

      {/* Project selector */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 320px', maxWidth: 520 }}>
          <label className="field-label" htmlFor="ps-project">{t('ps.project')}</label>
          <select id="ps-project" className="field-input" value={projectId ?? ''}
            onChange={(e) => { setProjectId(e.target.value || null); setOpen({ profile: true }); }}>
            <option value="">{t('ps.selectProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <button style={btn('var(--green-700)')} onClick={() => { setProjectId(null); setOpen({ profile: true }); }}>
          <Plus size={16} aria-hidden="true" /> {t('ps.newProject')}
        </button>
      </div>

      <div className={`ps-layout${project ? '' : ' is-empty'}`}>
        {/* ── Left rail: what this project is, and how far along it is ─────── */}
        <aside className="ps-rail">
          <div className="ps-idcard">
            {project ? (
              <>
                <h2>{project.name}</h2>
                <div className="ps-idmeta">
                  {project.code}
                  {projectRow?.created_at && <> · {t('ps.createdOn', { date: fmtDate(projectRow.created_at) })}</>}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <span className="ps-chip">{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, project.status)}</span>
                </div>

                <div className="ps-ring-row">
                  <Ring pct={summary.requiredPct} />
                  <span className="ps-ring-cap">
                    {t('ps.ofRequiredFields', { forms: SECTIONS.length })}
                  </span>
                </div>

                <dl className="ps-facts">
                  <li><dt>{t('ps.approvedBudget')}</dt>
                    <dd>{projectRow?.budget_vuv != null && projectRow.budget_vuv !== ''
                      ? `${fmtNum(projectRow.budget_vuv)} ${projectRow.currency ?? ''}`.trim()
                      : t('ps.notSet')}</dd></li>
                  <li><dt>{t('ps.duration')}</dt><dd>{duration ?? t('ps.notSet')}</dd></li>
                  <li><dt>{t('ps.provinces')}</dt>
                    <dd>{projectRow?.provinces?.length ? projectRow.provinces.join(', ') : t('ps.notSet')}</dd></li>
                  <li><dt>{t('ps.indicators')}</dt><dd>{fmtNum(indicators.length)}</dd></li>
                </dl>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-3)' }}>{t('ps.noProjectSelected')}</p>
            )}
          </div>

          {project && (
            <nav className="ps-seclist" aria-label={t('ps.sectionsNav')}>
              {SECTIONS.map((s) => (
                <button key={s.key} onClick={() => jumpTo(s.key)}>
                  <span className="ps-secname">{t(s.label)}</span>
                  {sectionHasDraft(s) && <DraftChip />}
                  <StateChip section={byKey[s.key]} t={t} />
                </button>
              ))}
            </nav>
          )}
        </aside>

        {/* ── Right column: the sections themselves ────────────────────────── */}
        <div>
          {project && blockingIssues.length > 0 && (
            <div className="ps-banner" role="status">
              <div className="ps-banner-head">
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                {/* Named, not counted: which sections hold the work is the part
                    that tells an officer where to go. */}
                <span>{t('ps.blockingSummary', { count: blockingIssues.length, where: blockingWhere })}</span>
              </div>
              <ul>
                {blockingIssues.map((it, n) => (
                  <li key={n}>
                    <button className="ps-linkbtn" onClick={() => jumpTo(it.section.key)}>{it.label}</button>
                  </li>
                ))}
              </ul>
              {firstBlocking && (
                <button className="ps-linkbtn" style={{ marginTop: '0.5rem', fontWeight: 700 }}
                  onClick={() => jumpTo(firstBlocking.key)}>
                  {t('ps.goToFirst', { section: t(firstBlocking.label) })} →
                </button>
              )}
            </div>
          )}
          {project && blockingIssues.length === 0 && (
            <div className="ps-ok">
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} aria-hidden="true" /> {t('ps.readyForReporting')}
            </div>
          )}

          {SECTIONS.map((s) => {
            const isOpen = !!open[s.key];
            const sec = byKey[s.key];
            return (
              <section key={s.key} className="ps-section" ref={(el) => { sectionRefs.current[s.key] = el; }}>
                <button className="ps-sechead" onClick={() => toggle(s.key)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                  <span className="ps-title">{t(s.label)}</span>
                  <span className="ps-form">{t('ps.form', { n: s.form })}</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                    {sectionHasDraft(s) && <DraftChip />}
                    {project && <StateChip section={sec} t={t} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="ps-secbody">
                    {s.key === 'profile' && (
                      <ProfileStep project={project} userId={user?.id}
                        onSaved={async (id) => { await loadProjects(); setProjectId(id); toast.success(t('ps.projectSaved')); }} />
                    )}
                    {/* Every section below writes against a project id. The
                        wizard locked them shut; they are open now and say what
                        is needed instead. */}
                    {s.key !== 'profile' && !project && (
                      <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: '0.9rem 0 0' }}>
                        {t('ps.saveProfileFirst')}
                      </p>
                    )}
                    {s.key === 'results' && project && (
                      <ResultsStep projectId={projectId} userId={user?.id} objectives={objectives} outcomes={outcomes} outputs={outputs}
                        indicators={indicators} activities={activities} users={users} reload={() => loadFramework(projectId)} />
                    )}
                    {s.key === 'indicators' && project && (
                      <IndicatorsStep projectId={projectId} userId={user?.id} indicators={indicators} objectives={objectives}
                        outcomes={outcomes} outputs={outputs} reload={() => loadFramework(projectId)} />
                    )}
                    {s.key === 'activities' && project && (
                      <ActivitiesStep projectId={projectId} userId={user?.id} outputs={outputs} outcomes={outcomes} activities={activities}
                        reload={() => loadFramework(projectId)} />
                    )}
                    {s.key === 'locations' && project && (
                      <LocationsStep projectId={projectId} userId={user?.id} locations={locations} reload={() => loadFramework(projectId)} />
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {project && (
            <div className="ps-submitbar">
              <span className="ps-submitcount">
                {t('ps.sectionsComplete', { done: summary.done, total: summary.total })}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                {summary.missingRequired.length > 0 && (
                  <span className="ps-submitwhy">
                    {t('ps.submitDisabledWhy', {
                      count: missing.length, section: t(missing[0].label),
                    })}
                  </span>
                )}
                <button style={ghostBtn} onClick={() => setPreviewing(true)}>{t('ps.preview')}</button>
                <button
                  style={{ ...btn('var(--green-700)'), ...(summary.missingRequired.length || submitting ? disabledBtn : null) }}
                  onClick={submitForReview}
                  disabled={summary.missingRequired.length > 0 || submitting}>
                  <Send size={15} aria-hidden="true" /> {submitting ? t('ps.submitting') : t('ps.submitForReview')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {previewing && (
        <PreviewModal project={project} row={projectRow} sections={sections} byKey={byKey}
          counts={{ objectives, outcomes, outputs, indicators, activities, locations }}
          onClose={() => setPreviewing(false)} />
      )}
    </div>
  );
}

// A completeness ring. An SVG rather than a bar because the rail is narrow and
// a ring holds its number in the middle, where a bar needs a line of its own.
function Ring({ pct }) {
  const size = 56, stroke = 6, r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const done = pct >= 100;
  return (
    <svg className="ps-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-1)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={done ? 'var(--green-600)' : 'var(--gold-500)'} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(circ * Math.min(pct, 100)) / 100} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 800, fill: 'var(--text-1)' }}>
        {pct}%
      </text>
    </svg>
  );
}

// Read-only summary of what has been entered, for a last look before submitting.
// Everything shown is already in memory — this opens no new query.
function PreviewModal({ project, row, sections, byKey, counts, onClose }) {
  const { t } = useTranslation();
  const line = (label, value) => (
    <li><dt>{label}</dt><dd>{value == null || value === '' ? t('ps.notSet') : value}</dd></li>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 720, padding: '1.2rem', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <strong style={{ fontSize: '1rem' }}>{t('ps.previewTitle', { name: project?.name ?? '' })}</strong>
          <button onClick={onClose} aria-label={t('ps.close')} title={t('ps.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <dl className="ps-facts" style={{ borderTop: 'none', paddingTop: 0 }}>
          {line(t('ps.projectTitle'), project?.name)}
          {line(t('ps.status'), OPT.labelOf(OPT.DOCC_PROJECT_STATUS, project?.status))}
          {line(t('ps.approvedBudget'), row?.budget_vuv != null && row.budget_vuv !== ''
            ? `${fmtNum(row.budget_vuv)} ${row.currency ?? ''}`.trim() : null)}
          {line(t('ps.startDate'), row?.start_date ? fmtDate(row.start_date) : null)}
          {line(t('ps.endDate'), row?.end_date ? fmtDate(row.end_date) : null)}
          {line(t('ps.provinces'), row?.provinces?.length ? row.provinces.join(', ') : null)}
        </dl>
        <h4 className="ps-sec">{t('ps.sectionsNav')}</h4>
        <dl className="ps-facts" style={{ borderTop: 'none', paddingTop: 0 }}>
          {line(t('ps.resultsFramework'), t('ps.previewResults', {
            objectives: counts.objectives.length, outcomes: counts.outcomes.length, outputs: counts.outputs.length,
          }))}
          {line(t('ps.indicators'), counts.indicators.length)}
          {line(t('ps.activities'), counts.activities.length)}
          {line(t('ps.locations'), counts.locations.length)}
        </dl>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          {sections.map((s) => (
            <span key={s.key} style={{ display: 'inline-flex' }}>
              <StateChip section={byKey[s.key]} t={t} />
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button style={ghostBtn} onClick={onClose}>{t('ps.close')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Project Profile ──────────────────────────────────────────────────
// Module scope, so the draft baseline for a new project is one stable object
// rather than a fresh one on every render.
const PROFILE_BLANK = {
  name: '', acronym: '', description: '', status: 'pipeline', category: '', lead_agency: '',
  executing_agency: '', donor: '', funding_window: '', currency: 'VUV', budget_vuv: '',
  start_date: '', end_date: '', approval_date: '', project_type: '', primary_climate_theme: '',
  coverage_type: '', provinces: [],
  // Officers are typed in by name. The matching *_id links are not edited here
  // any more, but they stay in the form's values so a save hands each one back
  // as it found it — upsert_project writes whatever it is given, so dropping
  // these keys would clear the link on the next save.
  project_manager: '', me_officer: '', finance_officer: '',
  project_manager_id: '', me_officer_id: '', finance_officer_id: '',
  est_direct_beneficiaries: '', est_indirect_beneficiaries: '', expected_primary_outcome: '',
};

// The officer's name as the form should show it. Once migration 0038 is in, the
// column is the only source: null there means the officer cleared the box, and
// it has to stay cleared rather than the old account link surfacing again on the
// next read. Before that migration the column is absent altogether — undefined,
// not null — and the linked account's name the view serves is all there is.
const officerName = (row, key) => (row[key] !== undefined
  ? (row[key] ?? '')
  : (row[`${key}_name`] ?? ''));

function ProfileStep({ project, userId, onSaved }) {
  const { t } = useTranslation();
  const blank = PROFILE_BLANK;
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  // What the form started from — blank for a new project, the saved row when
  // editing. The draft is the difference between this and what is on screen.
  const [seed, setSeed] = useState(blank);
  // Which project the values on screen belong to. Drafts only run once that is
  // the project being edited, so the fetch below cannot land on top of a
  // restored draft, and switching project cannot file one project's entries
  // under the next one's key while its row is still loading.
  const currentId = project?.id ?? 'new';
  const [loadedId, setLoadedId] = useState(project ? null : 'new');
  const ready = loadedId === currentId;

  // The full record as entered. The list this form was opened from carries only
  // a few columns and is localised for display, so the translation panel below
  // needs this row to see every translatable field and its source text.
  const [record, setRecord] = useState(null);

  useEffect(() => {
    if (!project) { setV(blank); setSeed(blank); setRecord(null); setLoadedId('new'); return; }
    // Load the full row for editing. Deliberately not localised: this form edits
    // the record in the language it was entered in.
    supabase.from('v_projects').select('*').eq('id', project.id).single().then(({ data }) => {
      if (!data) { setLoadedId(project.id); return; }
      setRecord(data);
      const saved = {
        ...blank, ...data,
        provinces: data.provinces ?? [],
        project_manager: officerName(data, 'project_manager'),
        me_officer: officerName(data, 'me_officer'),
        finance_officer: officerName(data, 'finance_officer'),
        budget_vuv: data.budget_vuv ?? '', start_date: data.start_date ?? '', end_date: data.end_date ?? '',
        approval_date: data.approval_date ?? '',
        est_direct_beneficiaries: data.est_direct_beneficiaries ?? '',
        est_indirect_beneficiaries: data.est_indirect_beneficiaries ?? '',
      };
      setV(saved);
      setSeed(saved);
      setLoadedId(data.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // A profile half-filled on a phone in the field survives leaving this step,
  // switching project, or closing the browser — it is restored on the way back.
  const draft = useFormDraft(draftKey('ps', userId, currentId, 'profile'), v, {
    baseline: seed,
    enabled: ready,
    onRestore: (values) => setV((s) => ({ ...s, ...values })),
  });

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setV((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));

  const save = async () => {
    if (!v.name.trim()) { toast.error(t('ps.projectTitleRequired')); return; }
    if (toNum(v.budget_vuv) != null && toNum(v.budget_vuv) < 0) {
      toast.error(t('ps.budgetNegative')); return;
    }
    setSaving(true);
    const args = {
      p_id: project?.id ?? null, p_name: v.name, p_acronym: toNull(v.acronym), p_description: toNull(v.description),
      p_status: v.status, p_category: toNull(v.category), p_lead_agency: toNull(v.lead_agency),
      p_executing_agency: toNull(v.executing_agency), p_donor: toNull(v.donor), p_funding_window: toNull(v.funding_window),
      p_currency: v.currency, p_budget_vuv: toNum(v.budget_vuv) ?? 0, p_start_date: toNull(v.start_date),
      p_end_date: toNull(v.end_date), p_approval_date: toNull(v.approval_date), p_project_type: toNull(v.project_type),
      p_primary_climate_theme: toNull(v.primary_climate_theme), p_coverage_type: toNull(v.coverage_type),
      p_provinces: toArr(v.provinces), p_project_manager_id: toNull(v.project_manager_id),
      p_me_officer_id: toNull(v.me_officer_id), p_finance_officer_id: toNull(v.finance_officer_id),
      p_est_direct_beneficiaries: toNum(v.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: toNum(v.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(v.expected_primary_outcome),
      p_project_manager: toNull(v.project_manager?.trim()),
      p_me_officer: toNull(v.me_officer?.trim()),
      p_finance_officer: toNull(v.finance_officer?.trim()),
    };
    let { data, error } = await supabase.rpc('upsert_project', args);
    // Before migration 0038 the function has no officer-name parameters, and
    // PostgREST rejects the whole call rather than ignoring the extra ones. The
    // project itself is what the officer came to save, so save it — and say
    // plainly that the three names could not go with it, rather than dropping
    // typed-in text without a word.
    if (isMissingRpcArgument(error, 'p_project_manager')) {
      const { p_project_manager: _pm, p_me_officer: _me, p_finance_officer: _fo, ...older } = args;
      ({ data, error } = await supabase.rpc('upsert_project', older));
      if (!error) toast(t('ps.officerNamesUnavailable'), { icon: '\u26a0\ufe0f' });
    }
    setSaving(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    // Saved as a record — what is on screen is the new starting point, and the
    // draft has done its job. Without moving the baseline, the values just saved
    // would read as a fresh draft the moment this returns.
    setSeed(v);
    draft.clear();
    onSaved(data);
  };

  return (
    <div>
      <div className="ps-grid">
        <h4 className="ps-sec ps-sec-first">{t('ps.identification')}</h4>
        <Field className="ps-full ps-w-title" label={t('ps.projectTitleReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
        <Field className="ps-w-acronym" label={t('ps.acronym')}><input className="field-input" value={v.acronym ?? ''} onChange={set('acronym')} /></Field>
        <Field className="ps-w-med" label={t('ps.status')}><Select value={v.status} onChange={set('status')} options={OPT.DOCC_PROJECT_STATUS} /></Field>
        <Field className="ps-full" label={t('ps.description')}><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>

        {/* Typed in rather than chosen from the standard list. The DoCC's own
            vocabulary never covered every project — and because those lists
            stored their label as the value, what is kept here is unchanged in
            kind: the same readable text, just no longer limited to the twelve
            answers the list happened to offer.

            maxLength matches the column each field lands in (category and
            expected_primary_outcome are VARCHAR(120), project_type VARCHAR(60)),
            so an over-long entry is stopped at the keyboard rather than coming
            back from the database as "value too long for type character
            varying". */}
        <h4 className="ps-sec">{t('ps.classification')}</h4>
        <Field label={t('ps.themeSector')} hint={t('ps.classificationHint')}>
          <input className="field-input" maxLength={120} value={v.category ?? ''} onChange={set('category')} />
        </Field>
        <Field label={t('ps.projectType')}>
          <input className="field-input" maxLength={60} value={v.project_type ?? ''} onChange={set('project_type')} />
        </Field>
        <Field label={t('ps.expectedPrimaryOutcome')}>
          <input className="field-input" maxLength={120} value={v.expected_primary_outcome ?? ''} onChange={set('expected_primary_outcome')} />
        </Field>

        <h4 className="ps-sec">{t('ps.implementingInstitutions')}</h4>
        <Field label={t('ps.leadDept')}><input className="field-input" value={v.lead_agency ?? ''} onChange={set('lead_agency')} /></Field>
        <Field label={t('ps.executingAgency')}><input className="field-input" value={v.executing_agency ?? ''} onChange={set('executing_agency')} /></Field>

        <h4 className="ps-sec">{t('ps.funding')}</h4>
        <Field label={t('ps.donor')}><Select value={v.donor ?? ''} onChange={set('donor')} options={OPT.DONOR} allowBlank /></Field>
        <Field label={t('ps.fundingWindow')}><input className="field-input" value={v.funding_window ?? ''} onChange={set('funding_window')} /></Field>
        <Field className="ps-w-budget" label={t('ps.approvedBudget')}><input type="number" min="0" className="field-input" value={v.budget_vuv} onChange={set('budget_vuv')} /></Field>
        <Field className="ps-w-currency" label={t('ps.currency')}><Select value={v.currency} onChange={set('currency')} options={OPT.CURRENCY} /></Field>

        <h4 className="ps-sec">{t('ps.timeline')}</h4>
        <Field className="ps-w-date" label={t('ps.startDate')}><input type="date" className="field-input" value={v.start_date || ''} onChange={set('start_date')} /></Field>
        <Field className="ps-w-date" label={t('ps.endDate')}><input type="date" className="field-input" value={v.end_date || ''} onChange={set('end_date')} /></Field>
        <Field className="ps-w-date" label={t('ps.approvalDate')}><input type="date" className="field-input" value={v.approval_date || ''} onChange={set('approval_date')} /></Field>

        <h4 className="ps-sec">{t('ps.geographicCoverage')}</h4>
        <Field label={t('ps.coverageType')}><Select value={v.coverage_type ?? ''} onChange={set('coverage_type')} options={OPT.COVERAGE_TYPE} allowBlank /></Field>
        <Field label={t('ps.provinces')} hint={t('ps.multiSelectHint')}>
          <select multiple className="field-input" style={{ minHeight: 96 }} value={v.provinces} onChange={setMulti('provinces')}>
            {PROVINCE_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        {/* Typed in, not chosen from the portal's user list: the focal point is
            often in a partner agency or a province and has no account here, and
            a dropdown of accounts left those projects with no officer at all. */}
        <h4 className="ps-sec">{t('ps.responsibleOfficers')}</h4>
        <Field label={t('ps.projectManager')} hint={t('ps.officerNameHint')}>
          <input className="field-input" value={v.project_manager ?? ''} onChange={set('project_manager')} autoComplete="off" />
        </Field>
        <Field label={t('ps.meOfficer')}>
          <input className="field-input" value={v.me_officer ?? ''} onChange={set('me_officer')} autoComplete="off" />
        </Field>
        <Field label={t('ps.financeOfficer')}>
          <input className="field-input" value={v.finance_officer ?? ''} onChange={set('finance_officer')} autoComplete="off" />
        </Field>

        <h4 className="ps-sec">{t('ps.expectedReach')}</h4>
        <Field className="ps-w-num" label={t('ps.estDirect')}><input type="number" min="0" className="field-input" value={v.est_direct_beneficiaries} onChange={set('est_direct_beneficiaries')} /></Field>
        <Field className="ps-w-num" label={t('ps.estIndirect')}><input type="number" min="0" className="field-input" value={v.est_indirect_beneficiaries} onChange={set('est_indirect_beneficiaries')} /></Field>
      </div>
      <TranslationPanel table="projects" row={record} onSaved={() => onSaved(project?.id)}
        labels={{ name: t('ps.projectTitle'), description: t('ps.description') }} />
      {/* The title is what the project is filed under, so it is the one thing
          that cannot be left for later — everything else can sit in the draft. */}
      {!v.name.trim() && (
        <p style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.75rem', color: 'var(--text-2)', margin: '0.9rem 0 0' }}>
          <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>{t('draft.missingRequired', { fields: t('ps.projectTitle') })}</span>
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button style={{ ...btn('var(--green-700)'), ...(saving ? disabledBtn : null) }} onClick={save} disabled={saving}>
          {saving ? t('ps.saving') : t(project ? 'ps.saveChanges' : 'ps.createProject')}
        </button>
        <DraftStatus draft={draft} />
      </div>
    </div>
  );
}

// ── Step 2: Results Framework (Objective → Outcome → Output) ─────────────────
function ResultsStep({ projectId, userId, objectives, outcomes, outputs, indicators = [], activities = [], users = [], reload }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(null); // { kind, parentId, row }
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const openAdd = (kind, parentId) => setEditing({ kind, parentId, row: null });
  const openEdit = (kind, row) => setEditing({ kind, row });
  const delNode = async (kind, row) => {
    const kindLabel = t(`ps.node${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);
    if (!(await confirmDialog({ title:t('ps.deleteNodeTitle', { kind: kindLabel }), message:t('ps.deleteNodeConfirm', { kind: kindLabel, code: row.code }), confirmLabel:t('ps.deleteLbl') }))) return;
    const rpc = kind === 'objective' ? 'delete_objective' : kind === 'outcome' ? 'delete_outcome' : 'delete_output';
    const { error } = await supabase.rpc(rpc, { p_id: row.id });
    if (error) { toast.error(dbErrorMessage(error)); return; } reload();
  };
  const rowStyle = { display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.3rem 0' };
  const codeChip = (c, bg) => ({ fontSize: '0.68rem', fontWeight: 700, color: '#fff', background: bg, padding: '0.12rem 0.4rem', borderRadius: 6, flexShrink: 0, marginTop: 2 });
  const actions = (kind, row) => (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
      <button onClick={() => openEdit(kind, row)} aria-label={t('ps.editNamed', { what: t(`ps.node${kind.charAt(0).toUpperCase()}${kind.slice(1)}`), code: row.code ?? '' })} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
      <button onClick={() => delNode(kind, row)} aria-label={t('ps.deleteNamed', { what: t(`ps.node${kind.charAt(0).toUpperCase()}${kind.slice(1)}`), code: row.code ?? '' })} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
    </span>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button style={btn('var(--green-700)')} onClick={() => openAdd('objective')}><Plus size={14} /> {t('ps.objective')}</button>
      </div>
      {objectives.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noObjectives')}</p>}
      {objectives.map((obj) => {
        const isCollapsed = collapsed[obj.id];
        const ocCount = outcomes.filter((oc) => oc.objective_id === obj.id).length;
        return (
        <div key={obj.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.6rem' }}>
          <div style={rowStyle}>
            <button onClick={() => toggle(obj.id)} aria-label={isCollapsed ? 'Expand' : 'Collapse'} aria-expanded={!isCollapsed}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, marginTop: 1, flexShrink: 0 }}>
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
            <span style={codeChip(obj.code, 'var(--green-700)')}>{obj.code}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{obj.statement}</span>
            {isCollapsed && ocCount > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 3 }}>{ocCount} outcome{ocCount === 1 ? '' : 's'}</span>}
            {actions('objective', obj)}
          </div>
          {!isCollapsed && (
          <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
            {outcomes.filter((oc) => oc.objective_id === obj.id).map((oc) => (
              <div key={oc.id} style={{ marginTop: '0.35rem' }}>
                <div style={rowStyle}>
                  <span style={codeChip(oc.code, '#2563eb')}>{oc.code}</span>
                  <span style={{ fontSize: '0.83rem' }}>{oc.statement}</span>
                  {actions('outcome', oc)}
                </div>
                <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
                  {outputs.filter((op) => op.outcome_id === oc.id).map((op) => {
                    const ic = indicators.filter((i) => i.output_id === op.id).length;
                    const ac = activities.filter((a) => a.output_id === op.id).length;
                    return (
                    <div key={op.id} style={rowStyle}>
                      <span style={codeChip(op.code, '#7c3aed')}>{op.code}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{op.statement}</span>
                      {(ic > 0 || ac > 0) && (
                        <span style={{ fontSize: '0.64rem', color: 'var(--text-3)', marginTop: 3, whiteSpace: 'nowrap' }}>
                          {ic} ind · {ac} act
                        </span>
                      )}
                      {actions('output', op)}
                    </div>
                    );
                  })}
                  <button onClick={() => openAdd('output', oc.id)} style={{ ...ghostBtn, padding: '0.2rem 0.5rem', marginTop: '0.25rem', fontSize: '0.72rem' }}><Plus size={12} /> {t('ps.output')}</button>
                </div>
              </div>
            ))}
            <button onClick={() => openAdd('outcome', obj.id)} style={{ ...ghostBtn, padding: '0.25rem 0.55rem', marginTop: '0.4rem', fontSize: '0.75rem' }}><Plus size={12} /> {t('ps.outcome')}</button>
          </div>
          )}
        </div>
        );
      })}
      {editing && (
        <ResultModal editing={editing} projectId={projectId} userId={userId} users={users}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

// Objective / Outcome / Output form modal (§18-20), using the existing
// create_/update_ RPC parameters (climate theme, expected outcome, notes,
// responsible officer, status). No schema change required.
function ResultModal({ editing, projectId, userId, users, onClose, onSaved }) {
  const { t } = useTranslation();
  const { kind, parentId, row } = editing;
  const seed = useMemo(() => {
    const base = kind === 'objective'
      ? { statement: '', climate_theme: '', expected_outcome: '', notes: '', status: '' }
      : { statement: '', responsible_officer_id: '', status: '' };
    return { ...base, ...(row?.id ? row : {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, row?.id]);
  const [v, setV] = useState(seed);
  const draft = useFormDraft(
    draftKey('ps', userId, projectId, 'result', kind, parentId ?? '-', row?.id ?? 'new'),
    v, { baseline: seed, onRestore: (values) => setV((s) => ({ ...s, ...values })) });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (!v.statement.trim()) { toast.error(t('ps.statementRequired')); return; }
    const S = v.statement.trim();
    let res;
    if (kind === 'objective') {
      res = row?.id
        ? await supabase.rpc('update_objective', { p_id: row.id, p_statement: S, p_climate_theme: v.climate_theme || null, p_expected_outcome: v.expected_outcome || null, p_notes: v.notes || null, p_status: v.status || null })
        : await supabase.rpc('create_objective', { p_project_id: projectId, p_statement: S, p_climate_theme: v.climate_theme || null, p_expected_outcome: v.expected_outcome || null, p_notes: v.notes || null });
    } else if (kind === 'outcome') {
      res = row?.id
        ? await supabase.rpc('update_outcome', { p_id: row.id, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null, p_status: v.status || null })
        : await supabase.rpc('create_outcome', { p_objective_id: parentId, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null });
    } else {
      res = row?.id
        ? await supabase.rpc('update_output', { p_id: row.id, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null, p_status: v.status || null })
        : await supabase.rpc('create_output', { p_outcome_id: parentId, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null });
    }
    if (res.error) { toast.error(dbErrorMessage(res.error)); return; }
    draft.clear();
    toast.success(row?.id ? t('ps.savedToast') : t('ps.addedToast'));
    onSaved();
  };
  const Kind = kind.charAt(0).toUpperCase() + kind.slice(1);
  const title = t(`ps.${row?.id ? 'edit' : 'new'}${Kind}`);
  return (
    <Modal title={title} onClose={onClose} onSave={save}
      saveLabel={t(row?.id ? 'ps.save' : 'ps.add')} draft={draft}>
      <Field label={t('ps.statementReq')} className="ps-full">
        <textarea className="field-input" rows={2} value={v.statement} onChange={set('statement')} />
      </Field>
      {kind === 'objective' && <>
        <Field label={t('ps.climateTheme')}><Select value={v.climate_theme ?? ''} onChange={set('climate_theme')} options={OPT.CLIMATE_THEME} allowBlank /></Field>
        <Field label={t('ps.expectedOutcome')} className="ps-full"><input className="field-input" value={v.expected_outcome ?? ''} onChange={set('expected_outcome')} /></Field>
        <Field label={t('ps.notes')} className="ps-full"><textarea className="field-input" rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </>}
      {(kind === 'outcome' || kind === 'output') && (
        <Field label={t('ps.responsibleOfficerLc')}><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={users.map((u) => ({ value: u.id, label: u.full_name }))} allowBlank /></Field>
      )}
      {row?.id && <Field label={t('ps.status')}><Select value={v.status ?? ''} onChange={set('status')} options={OPT.RECORD_STATUS} allowBlank /></Field>}
        <TranslationPanel table={`${kind}s`} row={row} onSaved={onSaved}
          labels={{ statement: t('ps.statementReq'), notes: t('ps.notes') }} />
    </Modal>
  );
}

// ── Step 3: Indicators ───────────────────────────────────────────────────────
const qualTag = { marginLeft: 6, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface-1)', borderRadius: 4, padding: '0.05rem 0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const miniChip = { fontSize: '0.72rem', color: 'var(--text-2)', background: 'var(--surface-1)', borderRadius: 6, padding: '0.15rem 0.45rem' };

function IndicatorsStep({ projectId, userId, indicators, objectives, outcomes, outputs, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteIndicator'), message:t('ps.deleteIndicatorConfirm', { code: row.code }), confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_indicator', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.indicator')}</button>
      </div>
      {indicators.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noIndicators')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.code')}</th><th>{t('ps.name')}</th><th>{t('ps.level')}</th><th>{t('ps.linked')}</th><th>{t('ps.unit')}</th><th>{t('ps.baseline')}</th><th>{t('ps.target')}</th><th>{t('ps.frequency')}</th><th></th></tr></thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{i.code}</td>
                  <td>{i.name}{i.is_qualitative && <span style={qualTag}>{t('ps.qualitative')}</span>}</td>
                  <td>{OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-3)' }}>{i.linked_code ?? '—'}</td>
                  <td>{i.unit ?? '—'}</td>
                  <td>{i.baseline_value ?? '—'}</td>
                  <td>{i.target_value ?? '—'}</td>
                  <td>{i.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY, i.frequency) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(i)} aria-label={t('ps.editNamed', { what: t('ps.indicatorWord'), code: i.code ?? '' })} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(i)} aria-label={t('ps.deleteNamed', { what: t('ps.indicatorWord'), code: i.code ?? '' })} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {indicators.length > 0 && (
        <div className="ps-cards">
          {indicators.map((i) => (
            <div className="ps-card" key={i.id}>
              <div><strong style={{ fontFamily: 'var(--font-mono)' }}>{i.code}</strong> · {i.name}{i.is_qualitative && <span style={qualTag}>{t('ps.qualitative')}</span>}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>
                {OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level)}{i.linked_code ? ` · ${i.linked_code}` : ''}
                {i.frequency ? ` · ${OPT.labelOf(OPT.REPORTING_FREQUENCY, i.frequency)}` : ''}
              </div>
              {/* baseline -> target (§21). Achievement/current come from reporting, not setup. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.8rem' }}>
                <span style={miniChip}>{t('ps.baselineLbl')} <strong>{i.baseline_value ?? '—'}</strong></span>
                <span style={{ color: 'var(--text-3)' }}>→</span>
                <span style={miniChip}>{t('ps.targetLbl')} <strong>{i.target_value ?? '—'}</strong></span>
                {i.unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{i.unit}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setEditing(i)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(i)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <IndicatorForm projectId={projectId} userId={userId} initial={editing} objectives={objectives} outcomes={outcomes}
          outputs={outputs} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function IndicatorForm({ projectId, userId, initial, objectives, outcomes, outputs, onClose, onSaved }) {
  const { t } = useTranslation();
  const seed = useMemo(() => ({
    name: '', indicator_level: '', definition: '', unit: '', baseline_value: '', baseline_year: '',
    target_value: '', target_date: '', frequency: '', data_source: '', collection_method: '',
    means_of_verification: '', verification_method: '', disaggregation: '', assumptions: '',
    responsible_officer_id: '', objective_id: '', outcome_id: '', output_id: '', is_qualitative: false, higher_is_better: true,
    ...(initial?.id ? initial : {}),
    // After the spread, so an older indicator shows the officer it has —
    // and a new one starts blank rather than carrying the row's shape.
    responsible_officer: initial?.id ? officerName(initial, 'responsible_officer') : '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [initial?.id]);
  const [v, setV] = useState(seed);
  useEffect(() => setV(seed), [seed]);
  const draft = useFormDraft(
    draftKey('ps', userId, projectId, 'indicator', initial?.id ?? 'new'),
    v, { baseline: seed, onRestore: (values) => setV((s) => ({ ...s, ...values })) });
  const set = (k, t) => (e) => setV((s) => ({ ...s, [k]: t === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    if (!v.name.trim()) return toast.error(t('ps.indicatorNameRequired'));
    const year = toNum(v.baseline_year);
    if (year != null && (year < 1980 || year > 2100)) {
      return toast.error(t('ps.baselineYearRange'));
    }
    const args = {
      p_id: initial?.id ?? null, p_project_id: projectId, p_name: v.name, p_unit: toNull(v.unit),
      p_baseline_value: toNum(v.baseline_value), p_target_value: toNum(v.target_value),
      p_means_of_verification: toNull(v.means_of_verification), p_frequency: toNull(v.frequency),
      p_indicator_level: toNull(v.indicator_level), p_definition: toNull(v.definition),
      p_baseline_year: toNum(v.baseline_year), p_target_date: toNull(v.target_date),
      p_data_source: toNull(v.data_source), p_collection_method: toNull(v.collection_method),
      p_responsible_officer_id: toNull(v.responsible_officer_id), p_disaggregation: toNull(v.disaggregation),
      p_verification_method: toNull(v.verification_method), p_assumptions: toNull(v.assumptions),
      p_objective_id: toNull(v.objective_id), p_outcome_id: toNull(v.outcome_id), p_output_id: toNull(v.output_id),
      p_is_qualitative: !!v.is_qualitative, p_higher_is_better: !!v.higher_is_better,
      p_responsible_officer: toNull(v.responsible_officer?.trim()),
    };
    let { error } = await supabase.rpc('upsert_project_indicator', args);
    // Before migration 0039 the function has no officer-name parameter. Save the
    // indicator without it rather than losing the whole entry, and say so.
    if (isMissingRpcArgument(error, 'p_responsible_officer')) {
      const { p_responsible_officer: _dropped, ...older } = args;
      ({ error } = await supabase.rpc('upsert_project_indicator', older));
      if (!error) toast(t('ps.officerNameUnavailable'), { icon: '\u26a0\ufe0f' });
    }
    if (error) return toast.error(dbErrorMessage(error));
    draft.clear();
    onSaved();
  };
  return (
    <Modal title={t(initial?.id ? 'ps.editIndicatorTitle' : 'ps.addIndicatorTitle')} onClose={onClose} onSave={save}
      saveLabel={t(initial?.id ? 'ps.save' : 'ps.add')} draft={draft}>
      <Field className="ps-full" label={t('ps.indicatorNameReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label={t('ps.level')}><Select value={v.indicator_level ?? ''} onChange={set('indicator_level')} options={OPT.INDICATOR_LEVEL} allowBlank /></Field>
      <Field label={t('ps.unitOfMeasurement')}><input className="field-input" value={v.unit ?? ''} onChange={set('unit')} /></Field>
      <Field className="ps-full" label={t('ps.definition')}><textarea className="field-input" rows={2} value={v.definition ?? ''} onChange={set('definition')} /></Field>
      <Field label={t('ps.baselineValue')}><input type="number" className="field-input" value={v.baseline_value ?? ''} onChange={set('baseline_value')} /></Field>
      <Field label={t('ps.baselineYear')}><input type="number" min="1980" max="2100" className="field-input" value={v.baseline_year ?? ''} onChange={set('baseline_year')} /></Field>
      <Field label={t('ps.finalTarget')}><input type="number" className="field-input" value={v.target_value ?? ''} onChange={set('target_value')} /></Field>
      <Field label={t('ps.targetDate')}><input type="date" className="field-input" value={v.target_date || ''} onChange={set('target_date')} /></Field>
      <Field label={t('ps.reportingFrequency')}><Select value={v.frequency ?? ''} onChange={set('frequency')} options={OPT.REPORTING_FREQUENCY} allowBlank /></Field>
      <Field label={t('ps.responsibleOfficer')} hint={t('ps.officerNameHint')}>
        <input className="field-input" value={v.responsible_officer ?? ''} onChange={set('responsible_officer')} autoComplete="off" />
      </Field>
      <Field label={t('ps.dataSource')}><input className="field-input" value={v.data_source ?? ''} onChange={set('data_source')} /></Field>
      <Field label={t('ps.collectionMethod')}><input className="field-input" value={v.collection_method ?? ''} onChange={set('collection_method')} /></Field>
      <Field label={t('ps.disaggregation')}><input className="field-input" value={v.disaggregation ?? ''} onChange={set('disaggregation')} /></Field>
      <Field label={t('ps.verificationMethod')}><input className="field-input" value={v.verification_method ?? ''} onChange={set('verification_method')} /></Field>
      <Field label={t('ps.linkedObjective')}><Select value={v.objective_id ?? ''} onChange={set('objective_id')} options={objectives.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label={t('ps.linkedOutcome')}><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label={t('ps.linkedOutput')}><Select value={v.output_id ?? ''} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label={t('ps.assumptions')}><textarea className="field-input" rows={2} value={v.assumptions ?? ''} onChange={set('assumptions')} /></Field>
      <Field label={t('ps.qualitativeIndicator')}><input type="checkbox" checked={!!v.is_qualitative} onChange={set('is_qualitative', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
      <Field label={t('ps.higherIsBetter')}><input type="checkbox" checked={!!v.higher_is_better} onChange={set('higher_is_better', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
        <TranslationPanel table="project_indicators" row={initial} onSaved={onSaved}
          labels={{ name: t('ps.indicatorNameReq'), definition: t('ps.definition'),
                    data_source: t('ps.dataSource') }} />
    </Modal>
  );
}

// ── Step 4: Activities ───────────────────────────────────────────────────────
function ActivitiesStep({ projectId, userId, outputs, outcomes, activities, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteActivity'), message:t('ps.deleteActivityConfirm', { code: row.code }), confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_activity', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  if (outputs.length === 0) return <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.needOutput')}</p>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.activity')}</button>
      </div>
      {activities.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noActivities')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.code')}</th><th>{t('ps.title')}</th><th>{t('ps.output')}</th><th>{t('ps.status')}</th><th>{t('ps.progress')}</th><th></th></tr></thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td><td>{a.name}</td><td>{a.output_code}</td>
                  <td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td>
                  <td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(a)} aria-label={t('ps.editNamed', { what: t('ps.activityWord'), code: a.code ?? '' })} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(a)} aria-label={t('ps.deleteNamed', { what: t('ps.activityWord'), code: a.code ?? '' })} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activities.length > 0 && (
        <div className="ps-cards">
          {activities.map((a) => (
            <div className="ps-card" key={a.id}>
              <strong>{a.code}</strong> · {a.name}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{a.output_code} · {OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button onClick={() => setEditing(a)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(a)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <ActivityForm projectId={projectId} userId={userId} initial={editing} outputs={outputs} outcomes={outcomes}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function ActivityForm({ projectId, userId, initial, outputs, outcomes, onClose, onSaved }) {
  const { t } = useTranslation();
  const firstOutputId = outputs[0]?.id ?? '';
  const seed = useMemo(() => ({
    name: '', output_id: firstOutputId, outcome_id: '', description: '', responsible_officer_id: '',
    responsible_org: '', status: 'not_started', province: '', island: '', area_council: '', community: '',
    planned_start_date: '', planned_end_date: '', actual_start_date: '', actual_end_date: '',
    planned_budget: '', actual_expenditure: '', physical_progress_pct: '', key_achievement: '',
    issue_delay: '', next_action: '', next_action_due: '',
    ...(initial?.id ? initial : {}),
    // After the spread, so an older activity shows the officer it has —
    // and a new one starts blank rather than carrying the row's shape.
    responsible_officer: initial?.id ? officerName(initial, 'responsible_officer') : '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [initial?.id, firstOutputId]);
  const [v, setV] = useState(seed);
  useEffect(() => setV(seed), [seed]);
  const draft = useFormDraft(
    draftKey('ps', userId, projectId, 'activity', initial?.id ?? 'new'),
    v, { baseline: seed, onRestore: (values) => setV((s) => ({ ...s, ...values })) });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setProvince = (e) => setV((s) => ({ ...s, province: e.target.value, island: '', area_council: '' }));
  const save = async () => {
    if (!v.name.trim()) return toast.error(t('ps.activityTitleRequired'));
    if (!v.output_id) return toast.error(t('ps.selectParentOutput'));
    const pct = toNum(v.physical_progress_pct);
    if (pct != null && (pct < 0 || pct > 100)) {
      return toast.error(t('ps.progressRange'));
    }
    if (v.planned_start_date && v.planned_end_date && v.planned_end_date < v.planned_start_date) {
      return toast.error(t('ps.endBeforeStart'));
    }
    const args = {
      p_id: initial?.id ?? null, p_output_id: v.output_id, p_name: v.name, p_description: toNull(v.description),
      p_responsible_officer_id: toNull(v.responsible_officer_id), p_status: v.status, p_outcome_id: toNull(v.outcome_id),
      p_responsible_org: toNull(v.responsible_org), p_province: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_community: toNull(v.community),
      p_planned_start_date: toNull(v.planned_start_date), p_planned_end_date: toNull(v.planned_end_date),
      p_actual_start_date: toNull(v.actual_start_date), p_actual_end_date: toNull(v.actual_end_date),
      p_planned_budget: toNum(v.planned_budget), p_actual_expenditure: toNum(v.actual_expenditure),
      p_physical_progress_pct: toNum(v.physical_progress_pct), p_key_achievement: toNull(v.key_achievement),
      p_issue_delay: toNull(v.issue_delay), p_next_action: toNull(v.next_action), p_next_action_due: toNull(v.next_action_due),
      p_responsible_officer: toNull(v.responsible_officer?.trim()),
    };
    let { error } = await supabase.rpc('upsert_project_activity_full', args);
    // Before migration 0039 the function has no officer-name parameter. Save the
    // activity without it rather than losing the whole entry, and say so.
    if (isMissingRpcArgument(error, 'p_responsible_officer')) {
      const { p_responsible_officer: _dropped, ...older } = args;
      ({ error } = await supabase.rpc('upsert_project_activity_full', older));
      if (!error) toast(t('ps.officerNameUnavailable'), { icon: '\u26a0\ufe0f' });
    }
    if (error) return toast.error(dbErrorMessage(error));
    draft.clear();
    onSaved();
  };
  return (
    <Modal title={t(initial?.id ? 'ps.editActivityTitle' : 'ps.addActivityTitle')} onClose={onClose} onSave={save}
      saveLabel={t(initial?.id ? 'ps.save' : 'ps.add')} draft={draft}>
      <Field className="ps-full" label={t('ps.activityTitleReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label={t('ps.linkedOutputReq')}><Select value={v.output_id} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} /></Field>
      <Field label={t('ps.linkedOutcome')}><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label={t('ps.description')}><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
      <Field label={t('ps.responsibleOrg')}><input className="field-input" value={v.responsible_org ?? ''} onChange={set('responsible_org')} /></Field>
      <Field label={t('ps.responsibleOfficer')} hint={t('ps.officerNameHint')}>
        <input className="field-input" value={v.responsible_officer ?? ''} onChange={set('responsible_officer')} autoComplete="off" />
      </Field>
      <Field label={t('ps.status')}><Select value={v.status} onChange={set('status')} options={OPT.ACTIVITY_STATUS} /></Field>
      <Field label={t('ps.physicalProgressPct')}><input type="number" min="0" max="100" className="field-input" value={v.physical_progress_pct ?? ''} onChange={set('physical_progress_pct')} /></Field>
      <Field label={t('ps.province')}><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label={t('ps.island')}><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label={t('ps.areaCouncil')}><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label={t('ps.community')}><input className="field-input" value={v.community ?? ''} onChange={set('community')} /></Field>
      <Field label={t('ps.plannedStart')}><input type="date" className="field-input" value={v.planned_start_date || ''} onChange={set('planned_start_date')} /></Field>
      <Field label={t('ps.plannedEnd')}><input type="date" className="field-input" value={v.planned_end_date || ''} onChange={set('planned_end_date')} /></Field>
      <Field label={t('ps.plannedBudget')}><input type="number" className="field-input" value={v.planned_budget ?? ''} onChange={set('planned_budget')} /></Field>
      <Field label={t('ps.actualExpenditure')}><input type="number" className="field-input" value={v.actual_expenditure ?? ''} onChange={set('actual_expenditure')} /></Field>
      <Field className="ps-full" label={t('ps.keyAchievement')}><textarea className="field-input" rows={2} value={v.key_achievement ?? ''} onChange={set('key_achievement')} /></Field>
      <Field label={t('ps.nextAction')}><input className="field-input" value={v.next_action ?? ''} onChange={set('next_action')} /></Field>
      <Field label={t('ps.nextActionDue')}><input type="date" className="field-input" value={v.next_action_due || ''} onChange={set('next_action_due')} /></Field>
        <TranslationPanel table="project_activities" row={initial} onSaved={onSaved}
          labels={{ name: t('ps.activityTitleReq'), description: t('ps.description') }} />
    </Modal>
  );
}

// ── Step 5: Locations ────────────────────────────────────────────────────────
function LocationsStep({ projectId, userId, locations, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  // The whole register, once: it is reference data of a few thousand rows at
  // most, and filtering it per keystroke in the browser beats a request per one.
  const [villages, setVillages] = useState([]);
  // An empty register and a register that does not exist look the same in the
  // dropdown but are not the same offer: before migration 0037 there is nowhere
  // to save a new village to, so the form must not invite the officer to add
  // one and then fail on them.
  const [hasRegister, setHasRegister] = useState(true);
  const loadVillages = useCallback(async () => {
    const { data, error } = await supabase.from('v_ref_villages').select('*');
    // Absent before migration 0037, so the error is expected rather than
    // reported: the picker falls back to a plain name box and the map, which is
    // what it does for a village the register has never heard of anyway.
    setHasRegister(!error);
    setVillages(data ?? []);
  }, []);
  useEffect(() => { loadVillages(); }, [loadVillages]);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteLocation'), message:t('ps.deleteLocationConfirm'), confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_location', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.location')}</button>
      </div>
      {locations.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noLocations')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.province')}</th><th>{t('ps.island')}</th><th>{t('ps.areaCouncil')}</th><th>{t('ps.community')}</th><th>{t('ps.statusCol')}</th><th>{t('ps.beneficiaries')}</th><th></th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td>
                  <td>{l.community || '—'}</td>
                  <td>{l.status ? OPT.labelOf(OPT.ACTIVITY_STATUS, l.status) : '—'}</td>
                  <td>{l.beneficiaries ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(l)} aria-label={t('ps.editNamed', { what: t('ps.locationWord'), code: l.community || l.island || l.province || '' })} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(l)} aria-label={t('ps.deleteNamed', { what: t('ps.locationWord'), code: l.community || l.island || l.province || '' })} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {locations.length > 0 && (
        <div className="ps-cards">
          {locations.map((l) => (
            <div className="ps-card" key={l.id}>
              <strong>{l.province || '—'}</strong> · {l.island || '—'} · {l.community || '—'}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button onClick={() => setEditing(l)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(l)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <LocationForm projectId={projectId} userId={userId} initial={editing} villages={villages}
          hasRegister={hasRegister} onVillageAdded={loadVillages}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function LocationForm({ projectId, userId, initial, villages, hasRegister = true, onVillageAdded, onClose, onSaved }) {
  const { t } = useTranslation();
  const seed = useMemo(() => ({
    province: '', island: '', area_council: '', community: '', latitude: '', longitude: '',
    intervention: '', status: '', beneficiaries: '', village_id: null,
    ...(initial?.id ? sourceRow(initial) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [initial?.id]);
  const [v, setV] = useState(seed);
  const [showMap, setShowMap] = useState(false);
  const [adding, setAdding] = useState(null);   // { name } while naming a new village
  useEffect(() => {
    setV(seed);
    setShowMap(false); setAdding(null);
  }, [seed]);
  const draft = useFormDraft(
    draftKey('ps', userId, projectId, 'location', initial?.id ?? 'new'),
    v, { baseline: seed, onRestore: (values) => setV((s) => ({ ...s, ...values })) });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  // Changing province invalidates the island and area council under it, and the
  // village that was chosen within them.
  const setProvince = (e) => setV((s) => ({
    ...s, province: e.target.value, island: '', area_council: '', village_id: null,
  }));

  // Picking a known village fills in what the register knows, without
  // overwriting anything the officer has already chosen by hand.
  const onVillage = ({ name, villageId, island, areaCouncil, latitude, longitude }) => {
    setV((s) => ({
      ...s,
      community: name,
      village_id: villageId ?? null,
      island: island ?? s.island,
      area_council: areaCouncil ?? s.area_council,
      latitude: latitude ?? (villageId ? s.latitude : s.latitude),
      longitude: longitude ?? (villageId ? s.longitude : s.longitude),
    }));
  };

  const save = async () => {
    // Every field here is optional on its own, but a location with none of them
    // is not a location — it used to save as a blank row.
    if (!v.province && !v.island && !v.community.trim()) {
      return toast.error(t('ps.locationEmpty'));
    }
    const lat = toNum(v.latitude), lon = toNum(v.longitude);
    // Caught here as well as in the database, so the officer reads a sentence
    // about the field they filled in rather than a constraint name.
    if (lat != null && (lat < -90 || lat > 90)) return toast.error(t('ps.latitudeRange'));
    if (lon != null && (lon < -180 || lon > 180)) return toast.error(t('ps.longitudeRange'));
    // A single coordinate places nothing, and half a pin is worse than none:
    // it looks like a location on the map and points at the wrong ocean.
    if ((lat == null) !== (lon == null)) return toast.error(t('ps.coordinatePair'));

    const args = {
      p_id: initial?.id ?? null, p_project_id: projectId, p_province: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_community: toNull(v.community), p_latitude: lat,
      p_longitude: lon, p_intervention: toNull(v.intervention), p_status: toNull(v.status),
      p_beneficiaries: toNum(v.beneficiaries), p_village_id: v.village_id ?? null,
    };
    let { error } = await supabase.rpc('upsert_project_location', args);
    // Before migration 0037 the function has no p_village_id, and PostgREST
    // rejects the whole call rather than ignoring the extra argument. The
    // location itself is what the officer came to save, so save it: only the
    // link to the register is lost, and that register does not exist yet.
    if (isMissingRpcArgument(error, 'p_village_id')) {
      const { p_village_id: _dropped, ...older } = args;
      ({ error } = await supabase.rpc('upsert_project_location', older));
    }
    if (error) return toast.error(dbErrorMessage(error));
    draft.clear();
    onSaved();
  };

  // Adding a village writes it to the shared register, so the next officer
  // finds it in the list instead of typing a fourth spelling.
  const saveVillage = async () => {
    const lat = toNum(v.latitude), lon = toNum(v.longitude);
    if (lat == null || lon == null) return toast.error(t('ps.villageNeedsPin'));
    const { data, error } = await supabase.rpc('add_village', {
      p_name: adding.name, p_province_code: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_latitude: lat, p_longitude: lon,
    });
    if (error) return toast.error(dbErrorMessage(error));
    const row = Array.isArray(data) ? data[0] : data;
    setV((s) => ({ ...s, community: row?.name ?? adding.name, village_id: row?.id ?? null }));
    setAdding(null);
    toast.success(t('ps.villageAdded', { name: row?.name ?? adding.name }));
    onVillageAdded?.();
  };

  const fromRegister = Boolean(v.village_id);

  return (
    <Modal title={t(initial?.id ? 'ps.editLocationTitle' : 'ps.addLocationTitle')} onClose={onClose} onSave={save}
      saveLabel={t(initial?.id ? 'ps.save' : 'ps.add')} draft={draft}>
      <Field label={t('ps.province')}><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label={t('ps.island')}><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label={t('ps.areaCouncil')}><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label={t('ps.communitySite')}>
        <VillageSelect
          value={v.community ?? ''} villageId={v.village_id} villages={villages}
          province={v.province} island={v.island}
          canAdd={hasRegister}
          onSelect={onVillage}
          onAddRequest={(name) => { setAdding({ name }); setShowMap(true); }}
        />
      </Field>

      <Field label={t('ps.latitude')} hint={fromRegister ? t('ps.villageCoordsFromRegister') : undefined}>
        <input type="number" min="-90" max="90" step="any" className="field-input" value={v.latitude ?? ''} onChange={set('latitude')} />
      </Field>
      <Field label={t('ps.longitude')}>
        <input type="number" min="-180" max="180" step="any" className="field-input" value={v.longitude ?? ''} onChange={set('longitude')} />
      </Field>

      <div className="ps-full">
        <button type="button" className="ps-maptoggle" onClick={() => setShowMap((o) => !o)}>
          <MapPin size={13} aria-hidden="true" /> {t(showMap ? 'ps.hideMap' : 'ps.pinOnMap')}
        </button>
        {showMap && (
          <div className="ps-mapbox">
            {adding && (
              <div className="ps-addvillage">
                <strong>{t('ps.villageAddTitle')}</strong>
                <p>{t('ps.villageAddBody', { name: adding.name })}</p>
                <div className="ps-addvillage-actions">
                  <button type="button" style={btn('var(--green-700)')} onClick={saveVillage}>{t('ps.villageAddSave')}</button>
                  <button type="button" style={ghostBtn} onClick={() => setAdding(null)}>{t('ps.cancel')}</button>
                </div>
              </div>
            )}
            <MapPinPicker
              latitude={toNum(v.latitude)} longitude={toNum(v.longitude)}
              province={v.province} villages={villages}
              onChange={({ latitude, longitude }) => setV((s) => ({
                // Moving the pin detaches the village: the coordinates no longer
                // describe the place the register holds.
                ...s, latitude, longitude, village_id: adding ? s.village_id : null,
              }))}
            />
          </div>
        )}
      </div>

      <Field className="ps-full" label={t('ps.intervention')}><input className="field-input" value={v.intervention ?? ''} onChange={set('intervention')} /></Field>
      <Field label={t('ps.implementationStatus')}>
        {/* A location saved before this was a controlled value may hold wording
            migration 0037 could not map. Offer it as-is rather than letting the
            select show blank and quietly write the status away on the next save. */}
        <Select value={v.status ?? ''} onChange={set('status')} allowBlank
          options={v.status && !OPT.ACTIVITY_STATUS.some((o) => o.value === v.status)
            ? [...OPT.ACTIVITY_STATUS, { value: v.status, label: v.status }]
            : OPT.ACTIVITY_STATUS} />
      </Field>
      <Field label={t('ps.beneficiaries')}><input type="number" min="0" className="field-input" value={v.beneficiaries ?? ''} onChange={set('beneficiaries')} /></Field>
        <TranslationPanel table="project_locations" row={initial} onSaved={onSaved}
          labels={{ intervention: t('ps.intervention') }} />
    </Modal>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────
function Field({ label, children, className, hint }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
function Select({ value, onChange, options, allowBlank }) {
  return (
    <select className="field-input" value={value} onChange={onChange}>
      {allowBlank && <option value="">—</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{OPT.optionLabel(o)}</option>)}
    </select>
  );
}
// A form modal that never loses work: closing it (the ✕, the backdrop, or
// "Save draft & close") keeps what has been typed as a local draft and restores
// it next time the same form is opened. Cancel is the one way out that throws
// the entry away, and it asks first. Saving is unchanged — it still runs the
// form's own required-field checks before anything reaches the database.
function Modal({ title, children, onClose, onSave, saveLabel, draft }) {
  const { t } = useTranslation();
  // Anything typed but not yet saved to the record — a draft in the making.
  const hasDraft = Boolean(draft && (draft.status !== 'idle' || draft.hasDraft));

  const closeKeepingDraft = () => {
    if (draft?.flush()) toast.success(t('draft.keptOnClose'));
    onClose();
  };

  const cancelDiscardingDraft = async () => {
    // Unsaved-changes guard (§22): confirm before discarding the entry.
    if (hasDraft && !(await confirmDialog({
      title: t('ps.discardChangesQ'), message: t('ps.unsavedChanges'),
      confirmLabel: t('ps.discardChanges'), cancelLabel: t('ps.stay'),
    }))) return;
    draft?.clear();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }} onClick={closeKeepingDraft}>
      <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 760, padding: '1.2rem', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: '1rem' }}>{title}</strong>
            <DraftStatus draft={draft} style={{ marginTop: '0.2rem' }} />
          </div>
          <button onClick={closeKeepingDraft} aria-label={t('ps.close')} title={t('ps.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="ps-grid">{children}</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button style={btn('var(--green-700)')} onClick={onSave}>{saveLabel}</button>
          {draft && <button style={ghostBtn} onClick={closeKeepingDraft}>{t('draft.saveAndClose')}</button>}
          <button style={ghostBtn} onClick={cancelDiscardingDraft}>{t('ps.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
