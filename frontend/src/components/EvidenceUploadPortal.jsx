import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';

const BUCKET = 'merl-indicator-evidence';
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.geojson,.json,.zip';

const cleanFileName = (name = 'evidence') => name
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(-120) || 'evidence';

const labelOf = (options, value) => {
  const found = (options || []).find((o) => o.value === value);
  return found?.label || value;
};

export default function EvidenceUploadPortal() {
  const [visible, setVisible] = useState(() => window.location.hash.includes('/analytics/reporting'));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [activities, setActivities] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [period, setPeriod] = useState('');
  const [indicatorId, setIndicatorId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [description, setDescription] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [file, setFile] = useState(null);

  useEffect(() => {
    const onHash = () => setVisible(window.location.hash.includes('/analytics/reporting'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!visible) { setOpen(false); return; }
    let alive = true;
    supabase.from('v_projects').select('id, code, name').order('code').then(({ data, error }) => {
      if (!alive || error) return;
      setProjects(data || []);
      if (!projectId && data?.length) setProjectId(data[0].id);
    });
    return () => { alive = false; };
  }, [visible]);

  useEffect(() => {
    if (!projectId) { setPeriods([]); setIndicators([]); setActivities([]); return; }
    let alive = true;
    Promise.all([
      supabase.from('v_reporting_periods').select('id, period_label, submission_status').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('v_project_indicators').select('id, code, name').eq('project_id', projectId).order('code'),
      supabase.from('v_project_activities').select('id, code, name').eq('project_id', projectId).order('code'),
    ]).then(([p, i, a]) => {
      if (!alive) return;
      if (p.error || i.error || a.error) {
        toast.error('Could not load the evidence reference lists.');
        return;
      }
      setPeriods(p.data || []);
      setIndicators(i.data || []);
      setActivities(a.data || []);
      setPeriod((current) => (p.data || []).some((x) => x.period_label === current) ? current : (p.data?.[0]?.period_label || ''));
      setIndicatorId('');
      setActivityId('');
    });
    return () => { alive = false; };
  }, [projectId]);

  const selectedPeriod = useMemo(() => periods.find((p) => p.period_label === period), [periods, period]);
  const locked = selectedPeriod?.submission_status === 'approved';

  const reset = () => {
    setTitle(''); setDocumentType(''); setDocumentDate(''); setDescription('');
    setVerificationStatus('pending'); setIndicatorId(''); setActivityId(''); setFile(null);
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!projectId) return toast.error('Select a project.');
    if (!period) return toast.error('Select or create a reporting period first.');
    if (locked) return toast.error('This reporting period is approved and locked. Reopen it before adding evidence.');
    if (!title.trim()) return toast.error('Enter an evidence title.');
    if (!file) return toast.error('Choose a supporting file to upload.');
    if (file.size > MAX_BYTES) return toast.error('The file is larger than 25 MB.');

    setLoading(true);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${projectId}/${period.replace(/[^a-zA-Z0-9._-]+/g, '-')}/${stamp}-${cleanFileName(file.name)}`;
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded = true;

      const storageRef = `storage://${BUCKET}/${path}`;
      const params = {
        p_id: null,
        p_project_id: projectId,
        p_reporting_period: period,
        p_title: title.trim(),
        p_document_type: documentType || null,
        p_indicator_id: indicatorId || null,
        p_activity_id: activityId || null,
        p_description: description.trim() || null,
        p_document_date: documentDate || null,
        p_file_url: storageRef,
        p_verification_status: verificationStatus || null,
      };
      const { error: recordError } = await supabase.rpc('upsert_evidence', params);
      if (recordError) throw recordError;

      toast.success('Evidence uploaded and linked successfully.');
      reset();
      setOpen(false);
      const target = '#/analytics/reporting?module=evidence';
      if (window.location.hash !== target) window.location.hash = target;
    } catch (error) {
      if (uploaded) await supabase.storage.from(BUCKET).remove([path]);
      toast.error(error?.message || 'Evidence upload failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <button type="button" className="evidence-upload-fab" onClick={() => setOpen(true)}>
        + Upload evidence
      </button>
      {open && (
        <div className="evidence-upload-backdrop" onClick={() => !loading && setOpen(false)}>
          <form className="evidence-upload-modal" onSubmit={upload} onClick={(e) => e.stopPropagation()}>
            <div className="evidence-upload-head">
              <div>
                <h2>Upload supporting evidence</h2>
                <p>Attach a private file to a project, indicator, activity, or both.</p>
              </div>
              <button type="button" className="evidence-upload-close" onClick={() => !loading && setOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="evidence-upload-grid">
              <label>Project<select className="field-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
              </select></label>
              <label>Reporting period<select className="field-input" value={period} onChange={(e) => setPeriod(e.target.value)} required>
                <option value="">Select reporting period</option>
                {periods.map((p) => <option key={p.id} value={p.period_label}>{p.period_label}{p.submission_status === 'approved' ? ' — Approved/locked' : ''}</option>)}
              </select></label>

              <label className="evidence-upload-wide">Evidence title *<input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label>Document type<select className="field-input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                <option value="">Select</option>{(OPT.DOCUMENT_TYPE || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
              <label>Document date<input className="field-input" type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} /></label>

              <label>Related indicator<select className="field-input" value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
                <option value="">Project-level / none</option>{indicators.map((i) => <option key={i.id} value={i.id}>{i.code ? `${i.code} — ` : ''}{i.name}</option>)}
              </select></label>
              <label>Related activity<select className="field-input" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                <option value="">Project-level / none</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>)}
              </select></label>

              <label className="evidence-upload-wide">Description<textarea className="field-input" rows="3" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <label>Verification status<select className="field-input" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
                {(OPT.VERIFICATION_STATUS || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
              <label>Supporting file *<input className="field-input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
            </div>

            <div className="evidence-upload-note">
              Files are private to authorised MERL users. Maximum 25 MB. You can link one upload to an indicator, an activity, both, or leave both blank for project/reporting-period evidence.
            </div>
            <div className="evidence-upload-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || locked}>{loading ? 'Uploading…' : 'Upload & link evidence'}</button>
            </div>
          </form>
        </div>
      )}
      <style>{`
        .evidence-upload-fab{position:fixed;right:24px;bottom:24px;z-index:45;border:0;border-radius:999px;background:#1f5bb8;color:#fff;font-weight:800;font-size:.82rem;padding:.8rem 1rem;box-shadow:0 10px 28px rgba(15,23,42,.2);cursor:pointer}
        .evidence-upload-backdrop{position:fixed;inset:0;z-index:90;background:rgba(15,23,42,.48);display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}
        .evidence-upload-modal{width:min(780px,100%);margin:auto;background:#fff;border-radius:14px;padding:1.1rem;border:1px solid var(--border);box-shadow:0 24px 70px rgba(15,23,42,.28)}
        .evidence-upload-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding-bottom:.8rem;margin-bottom:.9rem;border-bottom:1px solid var(--border)}
        .evidence-upload-head h2{margin:0;font-size:1.15rem;font-weight:900}.evidence-upload-head p{margin:.25rem 0 0;color:var(--text-3);font-size:.78rem}
        .evidence-upload-close{border:0;background:none;font-size:1.8rem;line-height:1;color:var(--text-3);cursor:pointer}
        .evidence-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.evidence-upload-grid label{display:flex;flex-direction:column;gap:.3rem;font-size:.75rem;font-weight:800;color:var(--text-2)}.evidence-upload-wide{grid-column:1/-1}
        .evidence-upload-note{margin-top:.9rem;padding:.7rem .8rem;background:#f8fafc;border:1px solid var(--border);border-radius:9px;color:var(--text-3);font-size:.72rem;line-height:1.45}
        .evidence-upload-actions{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1rem}
        @media(max-width:700px){.evidence-upload-fab{right:14px;bottom:14px}.evidence-upload-grid{grid-template-columns:1fr}.evidence-upload-wide{grid-column:1}.evidence-upload-backdrop{padding:12px}.evidence-upload-actions{flex-direction:column-reverse}.evidence-upload-actions .btn{width:100%}}
      `}</style>
    </>
  );
}
