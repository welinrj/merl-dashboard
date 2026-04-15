import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, FileText, Table, Map, Search,
  CheckCircle, AlertCircle, Clock, RefreshCw, Download,
  ThumbsUp, ThumbsDown, X, MessageSquare,
} from 'lucide-react';
import { PROJECTS } from '../mockData';
import { supabase } from '../supabaseClient';

/* ── constants ──────────────────────────────────────────────────────────── */
const TYPE_ICON = { csv: Table, xlsx: Table, geojson: Map, json: FileText };

const STATUS_CFG = {
  processed: { icon: CheckCircle, color: '#1a8c4e', bg: '#d1fae5', label: 'Processed' },
  partial:   { icon: AlertCircle, color: '#c97b00', bg: '#fef3c7', label: 'Partial'   },
  pending:   { icon: Clock,       color: '#6b7280', bg: '#f3f4f6', label: 'Pending'   },
  error:     { icon: AlertCircle, color: '#c0392b', bg: '#fee2e2', label: 'Error'     },
  approved:  { icon: CheckCircle, color: '#1a8c4e', bg: '#d1fae5', label: 'Approved'  },
  rejected:  { icon: AlertCircle, color: '#c0392b', bg: '#fee2e2', label: 'Rejected'  },
};

/* ── review modal ──────────────────────────────────────────────────────── */
function ReviewModal({ dataset, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'1.75rem', width:420, maxWidth:'90vw', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ fontWeight:700, fontSize:'1rem', color:'var(--text-1)', marginBottom:'0.375rem' }}>Reject Dataset</div>
        <div style={{ fontSize:'0.8125rem', color:'var(--text-3)', marginBottom:'1.25rem' }}>
          Rejecting: <strong>{dataset.name}</strong>
        </div>
        <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'0.375rem' }}>
          Reason (optional)
        </label>
        <textarea
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="Describe why this dataset is being rejected…"
          rows={3}
          style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', padding:'0.625rem 0.875rem', fontSize:'0.8125rem', color:'var(--text-1)', resize:'vertical', fontFamily:'var(--font-ui)', boxSizing:'border-box' }}
        />
        <div style={{ display:'flex', gap:'0.75rem', marginTop:'1.25rem', justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'0.5rem 1rem', borderRadius:8, border:'1px solid var(--border)', background:'none', cursor:'pointer', fontSize:'0.8125rem', color:'var(--text-2)' }}>Cancel</button>
          <button onClick={() => onConfirm(note)} style={{ padding:'0.5rem 1.25rem', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontWeight:600, cursor:'pointer', fontSize:'0.8125rem' }}>Reject Dataset</button>
        </div>
      </div>
    </div>
  );
}

/* ── upload zone ────────────────────────────────────────────────────────── */
function UploadZone({ onUpload, uploading }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: useCallback(files => files.length && onUpload(files), [onUpload]),
    multiple: true,
    accept: {
      'text/csv':   ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json', '.geojson'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png':  ['.png'],
      'application/pdf': ['.pdf'],
    },
  });

  return (
    <div {...getRootProps()} style={{
      border:     `2px dashed ${isDragActive ? 'var(--green-600)' : 'var(--border)'}`,
      background: isDragActive ? 'var(--green-50)' : 'var(--white)',
      borderRadius: 10, padding: '2.5rem 2rem',
      textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
      opacity: uploading ? 0.6 : 1,
      pointerEvents: uploading ? 'none' : 'auto',
    }}>
      <input {...getInputProps()} />
      <div style={{ width: 44, height: 44, background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
        {uploading
          ? <RefreshCw size={20} style={{ color: 'var(--green-600)', animation: 'spin 1s linear infinite' }} />
          : <Upload size={20} style={{ color: 'var(--green-600)' }} />}
      </div>
      {uploading ? (
        <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Uploading to Supabase…</p>
      ) : isDragActive ? (
        <p style={{ color: 'var(--green-700)', fontWeight: 600, fontSize: '0.875rem' }}>Drop files here</p>
      ) : (
        <>
          <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.875rem', margin: '0 0 0.25rem' }}>
            Drag &amp; drop files, or <span style={{ color: 'var(--green-700)', textDecoration: 'underline' }}>browse</span>
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
            CSV · XLSX · GeoJSON · PDF · Images · Max 50 MB per file
          </p>
        </>
      )}
    </div>
  );
}

/* ── upload form (project selector + zone) ──────────────────────────────── */
function UploadPanel({ user, onSuccess }) {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]?.code || '');
  const [uploading, setUploading]             = useState(false);
  const [results, setResults]                 = useState([]);   // [{name, ok, error}]

  const handleUpload = async files => {
    setUploading(true);
    setResults([]);
    const outcomes = [];

    for (const file of files) {
      try {
        // 1. upload file binary to Supabase Storage
        const ext       = file.name.split('.').pop().toLowerCase();
        const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${selectedProject}/${Date.now()}_${safeName}`;

        const { error: storageErr } = await supabase.storage
          .from('datasets')
          .upload(storagePath, file, { upsert: false });

        if (storageErr) throw new Error(storageErr.message);

        // 2. insert metadata row into datasets table
        const { error: dbErr } = await supabase
          .from('datasets')
          .insert({
            name:         file.name,
            project_code: selectedProject,
            type:         ext,
            rows:         0,
            size_kb:      Math.round(file.size / 1024),
            uploaded_by:  user?.name || 'Unknown',
            status:       'pending',
            tags:         [],
            storage_path: storagePath,
          });

        if (dbErr) throw new Error(dbErr.message);
        outcomes.push({ name: file.name, ok: true });
      } catch (err) {
        outcomes.push({ name: file.name, ok: false, error: err.message });
      }
    }

    setUploading(false);
    setResults(outcomes);
    if (outcomes.some(o => o.ok)) onSuccess();
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '1rem' }}>
        Upload New Dataset
      </div>

      {/* Project selector */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'block', marginBottom: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Link to Project Component
        </label>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="field-input"
          style={{ width: '100%', maxWidth: 400 }}
        >
          {PROJECTS.map(p => (
            <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>

      <UploadZone onUpload={handleUpload} uploading={uploading} />

      {/* Upload results */}
      {results.length > 0 && (
        <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {results.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: r.ok ? '#d1fae5' : '#fee2e2',
              border: `1px solid ${r.ok ? '#6ee7b7' : '#fca5a5'}`,
              borderRadius: 8, padding: '0.5rem 0.875rem',
              color: r.ok ? '#065f46' : '#991b1b',
              fontSize: '0.8125rem', fontWeight: 500,
            }}>
              {r.ok
                ? <><CheckCircle size={13} /> {r.name} — saved to Supabase</>
                : <><AlertCircle size={13} /> {r.name} — {r.error}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── dataset row download helper ────────────────────────────────────────── */
async function downloadFile(storagePath, fileName) {
  if (!storagePath) return;
  const { data, error } = await supabase.storage
    .from('datasets')
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) return;
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = fileName;
  a.click();
}

/* ══ Datasets page ═══════════════════════════════════════════════════════════ */
export default function Datasets({ user }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [projF, setProjF]   = useState('All');
  const [typeF, setTypeF]   = useState('All');
  const [reviewing, setReviewing] = useState(null); // dataset being rejected
  const [actionLoading, setActionLoading] = useState(null); // id of row being actioned
  const pollRef             = useRef(null);

  const canReview = user?.role === 'ROLE_ADMIN' || user?.role === 'ROLE_DOCC_SENIOR';

  // ── fetch datasets from Supabase ──────────────────────────────────────
  const fetchDatasets = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('datasets')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setRows(data || []);
      setError('');
    }
    setLoading(false);
  }, []);

  // initial fetch + real-time subscription
  useEffect(() => {
    fetchDatasets();

    // subscribe to INSERT / UPDATE / DELETE on datasets table
    const channel = supabase
      .channel('datasets-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'datasets' },
        () => fetchDatasets()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDatasets]);

  // ── filtering ─────────────────────────────────────────────────────────
  const filtered = rows.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.name.toLowerCase().includes(q)
      || (d.tags || []).some(t => t.includes(q));
    const matchProj = projF === 'All' || d.project_code === projF;
    const matchType = typeF === 'All' || d.type === typeF;
    return matchSearch && matchProj && matchType;
  });

  // ── approval handlers ─────────────────────────────────────────────────
  const handleApprove = async (dataset) => {
    setActionLoading(dataset.id);
    try {
      await supabase.from('datasets').update({
        status: 'approved',
        reviewed_by: user.name,
        reviewed_at: new Date().toISOString(),
        review_note: null,
      }).eq('id', dataset.id);
    } catch (err) {
      console.error('Approval failed:', err.message);
    }
    setActionLoading(null);
  };

  const handleReject = async (dataset, note) => {
    setReviewing(null);
    setActionLoading(dataset.id);
    try {
      await supabase.from('datasets').update({
        status: 'rejected',
        reviewed_by: user.name,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      }).eq('id', dataset.id);
    } catch (err) {
      console.error('Rejection failed:', err.message);
    }
    setActionLoading(null);
  };

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1400 }} className="animate-fade-up">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Review modal */}
      {reviewing && (
        <ReviewModal
          dataset={reviewing}
          onConfirm={note => handleReject(reviewing, note)}
          onCancel={() => setReviewing(null)}
        />
      )}

      {/* Page header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div>
            <div className="section-label" style={{ marginBottom: '0.375rem' }}>Data Management</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
              Datasets
            </h1>
          </div>
          {canReview && rows.filter(r => r.status === 'pending').length > 0 && (
            <span style={{ background:'#fef3c7', color:'#92400e', border:'1px solid #fde68a', borderRadius:9999, padding:'0.2rem 0.75rem', fontSize:'0.75rem', fontWeight:700, marginLeft:'0.75rem', whiteSpace: 'nowrap' }}>
              {rows.filter(r => r.status === 'pending').length} pending review
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
          Upload, manage and explore project data files. All uploads are stored in Supabase and visible to all users in real time.
        </p>
      </div>

      {/* Upload panel */}
      <UploadPanel user={user} onSuccess={fetchDatasets} />

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.875rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search datasets or tags…"
              style={{ paddingLeft: '2.25rem', width: '100%' }}
              className="field-input"
            />
          </div>
          <select value={projF} onChange={e => setProjF(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            <option value="All">All Components</option>
            {PROJECTS.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
          </select>
          <select value={typeF} onChange={e => setTypeF(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            {['All', 'csv', 'xlsx', 'geojson', 'json', 'pdf', 'jpg', 'png'].map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={fetchDatasets}
            title="Refresh"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}
          >
            <RefreshCw size={14} />
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {loading ? 'Loading…' : `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.8125rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Component</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Rows</th>
              <th style={{ textAlign: 'right' }}>Size</th>
              <th>Uploaded by</th>
              <th>Status</th>
              {canReview && <th>Reviewed by</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canReview ? 10 : 8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '0.5rem' }} />
                  Loading from Supabase…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={canReview ? 10 : 8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>
                  No datasets found. Upload a file to get started.
                </td>
              </tr>
            ) : filtered.map(d => {
              const proj = PROJECTS.find(p => p.code === d.project_code);
              const Icon = TYPE_ICON[d.type] || FileText;
              const S    = STATUS_CFG[d.status] || STATUS_CFG.pending;
              const SI   = S.icon;
              return (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--green-50)', border: '1px solid var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Icon size={14} style={{ color: 'var(--green-600)' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.8125rem' }}>{d.name}</div>
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                          {(d.tags || []).slice(0, 3).map(t => (
                            <span key={t} style={{ background: 'var(--cream)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.05rem 0.4rem', fontSize: '0.625rem', fontWeight: 600 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {proj && (
                      <span style={{ background: proj.category_color + '18', color: proj.category_color, border: `1px solid ${proj.category_color}33`, borderRadius: 4, padding: '0.1rem 0.5rem', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {proj.category}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {d.type}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)', fontSize: '0.8125rem' }}>
                    {d.rows > 0 ? d.rows.toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: '0.75rem' }}>
                    {d.size_kb} KB
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{d.uploaded_by}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: S.bg, color: S.color, borderRadius: 9999, padding: '0.15rem 0.6rem', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <SI size={11} /> {S.label}
                    </span>
                  </td>
                  {canReview && (
                    <td>
                      {d.reviewed_by ? (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                          {d.reviewed_by}
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: '0.125rem' }}>
                            {new Date(d.reviewed_at).toLocaleDateString()}
                          </div>
                          {d.review_note && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem', padding: '0.25rem', background: 'var(--cream)', borderRadius: 4, display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}>
                              <MessageSquare size={11} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
                              <span>{d.review_note}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                  )}
                  <td>
                    {canReview && d.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <button
                          onClick={() => handleApprove(d)}
                          disabled={actionLoading === d.id}
                          title="Approve"
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', cursor: 'pointer', color: actionLoading === d.id ? 'var(--text-3)' : '#1a8c4e', display: 'flex', alignItems: 'center', opacity: actionLoading === d.id ? 0.5 : 1, pointerEvents: actionLoading === d.id ? 'none' : 'auto',
                          }}
                        >
                          {actionLoading === d.id ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ThumbsUp size={13} />}
                        </button>
                        <button
                          onClick={() => setReviewing(d)}
                          disabled={actionLoading === d.id}
                          title="Reject"
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', cursor: 'pointer', color: actionLoading === d.id ? 'var(--text-3)' : '#c0392b', display: 'flex', alignItems: 'center', opacity: actionLoading === d.id ? 0.5 : 1, pointerEvents: actionLoading === d.id ? 'none' : 'auto',
                          }}
                        >
                          {actionLoading === d.id ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ThumbsDown size={13} />}
                        </button>
                      </div>
                    ) : d.storage_path ? (
                      <button
                        onClick={() => downloadFile(d.storage_path, d.name)}
                        title="Download"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
                      >
                        <Download size={13} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
