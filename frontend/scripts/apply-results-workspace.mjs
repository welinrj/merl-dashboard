import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No change made to ${path}`);
  fs.writeFileSync(path, after);
}
function replace(source, oldText, newText) {
  if (!source.includes(oldText)) throw new Error(`Missing expected source: ${oldText.slice(0, 100)}`);
  return source.replace(oldText, newText);
}
const root = 'frontend/src/';
edit(root + 'pages/ProjectSetup.jsx', (s) => replace(s, 'function IndicatorForm({ projectId, userId, initial, objectives, outcomes, outputs, onClose, onSaved }) {', 'export function IndicatorForm({ projectId, userId, initial, objectives, outcomes, outputs, onClose, onSaved }) {'));
edit(root + 'pages/MerlReporting.jsx', (source) => {
  let s = replace(source, "import { supabase } from '../supabaseClient';", "import { supabase } from '../supabaseClient';\nimport { saveModuleRecord } from '../lib/merlRecordSave';");
  s = replace(s, 'const MODULES = [', 'export const MODULES = [');
  s = replace(s, 'function RecordForm({ module, initial, draftKey: key, dynamicOptions, indicators, onCancel, onSave, onTranslated }) {', 'export function RecordForm({ module, initial, draftKey: key, dynamicOptions, indicators, onCancel, onSave, onTranslated, enableFileUpload = false, busy = false }) {');
  const start = s.indexOf('    const params = { p_id: editing?.id ?? null, p_project_id: projectId };');
  const end = s.indexOf('    // The record is saved, so its draft has served its purpose.', start);
  if (start < 0 || end < 0) throw new Error('MERL writer anchor not found');
  s = s.slice(0, start) + `    try {\n      await saveModuleRecord({ module: m, values, id: editing?.id ?? null, projectId, reportingPeriod: activePeriod, indicators });\n    } catch (error) { toast.error(dbErrorMessage(error)); return; }\n` + s.slice(end);
  s = replace(s, "  const [v, setV] = useState(seed);\n  useEffect(() => setV(seed), [seed]);\n  const set = (name, type)", "  const [v, setV] = useState(seed);\n  const [file, setFile] = useState(null);\n  useEffect(() => { setV(seed); setFile(null); }, [seed]);\n  const set = (name, type)");
  s = replace(s, "          {module.fields.map((f) => (", "          {module.fields.filter((f) => !(enableFileUpload && f.name === 'file_url')).map((f) => (");
  s = replace(s, "        {preview.length > 0 && (", "        {enableFileUpload && module.key === 'evidence' && (\n          <div style={{ marginTop: '0.8rem' }}>\n            <label className=\"field-label\" htmlFor=\"ri-evidence-file\">Supporting file (optional if a file is already attached)</label>\n            <input id=\"ri-evidence-file\" type=\"file\" className=\"field-input\" accept=\".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.geojson,.zip\" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />\n            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Private evidence. Maximum 25 MB. The file is not published to the public portal.</p>\n          </div>\n        )}\n        {preview.length > 0 && (");
  s = replace(s, "onClick={() => onSave(v)}", "onClick={() => onSave(v, file)} disabled={busy}");
  return s;
});
edit(root + 'App.tsx', (source) => {
  let s = replace(source, "import Dashboards from './pages/Dashboards';", "import Dashboards from './pages/Dashboards';\nimport ResultsWorkspace from './pages/ResultsWorkspace';");
  s = replace(s, '<AnalyticsRoute allowed={allowed} fallback={defaultPath} />', '<AnalyticsRoute allowed={allowed} fallback={defaultPath} user={user} />');
  s = replace(s, 'function AnalyticsRoute({ allowed, fallback }: { allowed: NavKey[]; fallback: string }) {', 'function AnalyticsRoute({ allowed, fallback, user }: { allowed: NavKey[]; fallback: string; user: AppUser }) {');
  s = replace(s, "  if (!allowed.includes(key)) return <Navigate to={fallback} replace />;\n  return <Dashboards", "  if (!allowed.includes(key)) return <Navigate to={fallback} replace />;\n  if (lens === 'results' || lens === 'indicators') return <ResultsWorkspace user={user} />;\n  return <Dashboards");
  return s;
});
edit(root + 'pages/ResultsWorkspace.jsx', (source) => {
  let s = replace(source, "import { fmtPct } from '../lib/docc/reporting';", "import { fmtPct } from '../lib/docc/reporting';\nimport { uploadIndicatorEvidence, openIndicatorEvidence, removeIndicatorEvidence } from '../lib/indicatorEvidenceFiles';");
  s = replace(s, "  const formModule = editing?.kind === 'evidence' ? { ...module, fields: module.fields.filter((f) => f.name !== 'verification_status') } : module;", "  const formModule = editing?.kind === 'evidence' ? { ...module, fields: module.fields.filter((f) => !['verification_status', 'activity_id'].includes(f.name)) } : module;");
  s = replace(s, '  const saveRecord = async (values) => {\n    if (!editing || !selected || !editablePeriod(period) || saving) return;\n    setSaving(true);\n    try {\n      const payload = { ...values, indicator_id: selected.id };', '  const saveRecord = async (values, file) => {\n    if (!canEdit || !editing || !selected || !editablePeriod(period) || saving) return;\n    setSaving(true);\n    let uploaded = null;\n    try {\n      const payload = { ...editing.initial, ...values, indicator_id: selected.id };\n      if (file && editing.kind === \'evidence\') {\n        uploaded = await uploadIndicatorEvidence(projectId, selected.id, file);\n        payload.file_url = uploaded;\n      }');
  s = replace(s, "    } catch (err) { toast.error(dbErrorMessage(err)); }\n    finally { setSaving(false); }", "    } catch (err) {\n      if (uploaded) await removeIndicatorEvidence(uploaded).catch(() => {});\n      toast.error(dbErrorMessage(err));\n    } finally { setSaving(false); }");
  s = replace(s, "<RecordForm key={`${editing.kind}-${editing.initial?.id ?? selectedId}-${periodLabel}`}", "<RecordForm key={`${editing.kind}-${editing.initial?.id ?? selectedId}-${periodLabel}`}");
  s = replace(s, 'onSave={saveRecord} onTranslated={reload} />', 'onSave={saveRecord} onTranslated={reload} enableFileUpload={editing.kind === \'evidence\'} busy={saving} />');
  s = replace(s, "<span>{e.title}<small>{e.reporting_period}</small></span>{canEdit", "<span>{e.title}<small>{e.reporting_period}</small>{e.file_url && <button type=\"button\" onClick={() => openIndicatorEvidence(e.file_url).catch((err) => toast.error(dbErrorMessage(err)))}>Open file</button>}</span>{canEdit");
  return s;
});
console.log('Results workspace integration applied.');
