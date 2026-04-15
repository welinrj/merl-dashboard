import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Table, Map, Search, Filter, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { DATASETS, PROJECTS } from '../mockData';

const TYPE_ICON = { csv: Table, xlsx: Table, geojson: Map, json: FileText };
const STATUS = {
  processed: { icon: CheckCircle, color:'#1a8c4e', bg:'#d1fae5', label:'Processed' },
  partial:   { icon: AlertCircle, color:'#c97b00', bg:'#fef3c7', label:'Partial' },
  pending:   { icon: Clock,       color:'#6b7280', bg:'#f3f4f6', label:'Pending' },
  error:     { icon: AlertCircle, color:'#c0392b', bg:'#fee2e2', label:'Error' },
};

function UploadZone({ onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const onDrop = useCallback(accepted => {
    if (!accepted.length) return;
    setUploading(true); setMessage('');
    setTimeout(() => {
      setUploading(false);
      setMessage(`${accepted.length} file${accepted.length>1?'s':''} uploaded successfully.`);
      if (onUpload) onUpload(accepted);
    }, 1400);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: true,
    accept: { 'text/csv':['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'], 'application/json':['.json','.geojson'] }
  });

  return (
    <div>
      <div {...getRootProps()} style={{
        border: `2px dashed ${isDragActive ? 'var(--green-600)' : 'var(--border)'}`,
        background: isDragActive ? 'var(--green-50)' : 'var(--white)',
        borderRadius: 10, padding:'2.5rem 2rem',
        textAlign:'center', cursor:'pointer', transition:'all 0.15s',
      }}>
        <input {...getInputProps()} />
        <div style={{ width:44, height:44, background:'var(--green-50)', border:'1px solid var(--green-100)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
          <Upload size={20} style={{ color:'var(--green-600)' }}/>
        </div>
        {uploading ? (
          <p style={{ color:'var(--text-3)', fontSize:'0.875rem' }}>Uploading<span style={{ animation:'dots 1.2s infinite' }}>…</span></p>
        ) : isDragActive ? (
          <p style={{ color:'var(--green-700)', fontWeight:600, fontSize:'0.875rem' }}>Drop files here</p>
        ) : (
          <>
            <p style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.875rem', margin:'0 0 0.25rem' }}>
              Drag &amp; drop files, or <span style={{ color:'var(--green-700)', textDecoration:'underline' }}>browse</span>
            </p>
            <p style={{ color:'var(--text-3)', fontSize:'0.75rem' }}>CSV, XLSX, GeoJSON · Max 50MB per file</p>
          </>
        )}
      </div>
      {message && (
        <div style={{ marginTop:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem', background:'#d1fae5', border:'1px solid #6ee7b7', borderRadius:8, padding:'0.625rem 0.875rem', color:'#065f46', fontSize:'0.8125rem', fontWeight:500 }}>
          <CheckCircle size={14}/>
          {message}
        </div>
      )}
    </div>
  );
}

export default function Datasets({ user }) {
  const [search, setSearch]   = useState('');
  const [projF, setProjF]     = useState('All');
  const [typeF, setTypeF]     = useState('All');
  const [localData, setLocalData] = useState(DATASETS);

  const filtered = localData.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.tags.some(t=>t.includes(search.toLowerCase()));
    const matchProj = projF==='All' || d.project_code===projF;
    const matchType = typeF==='All' || d.type===typeF;
    return matchSearch && matchProj && matchType;
  });

  const handleUpload = files => {
    const newRows = files.map((f,i) => ({
      id: localData.length+i+1, name: f.name,
      project_code:'LD-ADAPT-001', type: f.name.split('.').pop(),
      rows:0, size_kb: Math.round(f.size/1024),
      uploaded_by: user?.name||'Current User',
      uploaded_at: new Date().toISOString(),
      status:'pending', tags:[],
    }));
    setLocalData(prev => [...newRows, ...prev]);
  };

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>Data Management</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          Datasets
        </h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          Upload, manage and explore project data files.
        </p>
      </div>

      {/* Upload zone */}
      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontFamily:'var(--font-ui)', fontSize:'0.875rem', fontWeight:700, color:'var(--text-1)', marginBottom:'1rem' }}>
          Upload New Dataset
        </div>
        <UploadZone onUpload={handleUpload} />
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom:'1rem', padding:'0.875rem 1.25rem' }}>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <Search size={14} style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-3)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search datasets or tags…"
              style={{ paddingLeft:'2.25rem', width:'100%' }}
              className="field-input" />
          </div>
          <select value={projF} onChange={e=>setProjF(e.target.value)} className="field-input" style={{ width:'auto' }}>
            <option value="All">All Components</option>
            {PROJECTS.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
          </select>
          <select value={typeF} onChange={e=>setTypeF(e.target.value)} className="field-input" style={{ width:'auto' }}>
            {['All','csv','xlsx','geojson'].map(t => <option key={t}>{t}</option>)}
          </select>
          <span style={{ fontSize:'0.75rem', color:'var(--text-3)', whiteSpace:'nowrap' }}>
            {filtered.length} record{filtered.length!==1?'s':''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="data-table">
          <thead><tr>
            <th>Dataset</th><th>Component</th><th>Type</th>
            <th style={{ textAlign:'right' }}>Rows</th>
            <th style={{ textAlign:'right' }}>Size</th>
            <th>Uploaded by</th><th>Status</th>
          </tr></thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:'3rem', color:'var(--text-3)' }}>No datasets found</td></tr>
            ) : filtered.map(d => {
              const proj = PROJECTS.find(p=>p.code===d.project_code);
              const Icon = TYPE_ICON[d.type] || FileText;
              const S = STATUS[d.status] || STATUS.pending;
              const SI = S.icon;
              return (
                <tr key={d.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:'0.625rem' }}>
                      <div style={{ width:30, height:30, borderRadius:6, background:'var(--green-50)', border:'1px solid var(--green-100)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                        <Icon size={14} style={{ color:'var(--green-600)' }}/>
                      </div>
                      <div>
                        <div style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{d.name}</div>
                        <div style={{ display:'flex', gap:'0.25rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
                          {d.tags.slice(0,3).map(t => (
                            <span key={t} style={{ background:'var(--cream)', color:'var(--text-3)', border:'1px solid var(--border)', borderRadius:4, padding:'0.05rem 0.4rem', fontSize:'0.625rem', fontWeight:600 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {proj && <span style={{ background:proj.category_color+'18', color:proj.category_color, border:`1px solid ${proj.category_color}33`, borderRadius:4, padding:'0.1rem 0.5rem', fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>{proj.category}</span>}
                  </td>
                  <td><span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{d.type}</span></td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-2)', fontSize:'0.8125rem' }}>{d.rows>0?d.rows.toLocaleString():'—'}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.75rem' }}>{d.size_kb}KB</td>
                  <td>
                    <div style={{ fontSize:'0.8125rem', color:'var(--text-2)' }}>{d.uploaded_by}</div>
                    <div style={{ fontSize:'0.6875rem', color:'var(--text-3)' }}>{new Date(d.uploaded_at).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:S.bg, color:S.color, borderRadius:9999, padding:'0.15rem 0.6rem', fontSize:'0.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                      <SI size={11}/> {S.label}
                    </span>
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
