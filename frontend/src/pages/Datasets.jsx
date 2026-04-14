import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DATASETS, PROJECTS } from '../mockData';

const TYPE_ICON = { csv: '📊', xlsx: '📗', geojson: '🗺️', json: '📋' };
const STATUS_CHIP = {
  processed: 'bg-green-100 text-green-700',
  partial:   'bg-amber-100 text-amber-700',
  pending:   'bg-gray-100 text-gray-500',
  error:     'bg-red-100 text-red-700',
};

function UploadZone({ onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage]     = useState('');

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setUploading(true);
    setMessage('');
    // Simulate upload
    setTimeout(() => {
      setUploading(false);
      setMessage(`✅ ${accepted.map(f=>f.name).join(', ')} uploaded successfully (demo mode — data not persisted).`);
      if (onUpload) onUpload(accepted);
    }, 1500);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/json': ['.json','.geojson'] },
    multiple: true,
  });

  return (
    <div>
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-green-200 bg-white hover:border-emerald-400 hover:bg-green-50'}`}>
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">{uploading ? '⏳' : isDragActive ? '📂' : '📤'}</div>
        {uploading ? (
          <p className="text-sm text-gray-500 animate-pulse">Uploading…</p>
        ) : isDragActive ? (
          <p className="text-sm text-emerald-600 font-semibold">Drop files here…</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700">Drag &amp; drop files here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Supports CSV, XLSX, GeoJSON · Max 50MB per file</p>
          </>
        )}
      </div>
      {message && <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{message}</div>}
    </div>
  );
}

export default function Datasets({ user }) {
  const [search, setSearch]   = useState('');
  const [projFilter, setProj] = useState('All');
  const [typeFilter, setType] = useState('All');
  const [localData, setLocalData] = useState(DATASETS);

  const projects = ['All', ...PROJECTS.map(p => p.code)];
  const types    = ['All', 'csv', 'xlsx', 'geojson'];

  const filtered = localData.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
                        d.tags.some(t => t.includes(search.toLowerCase()));
    const matchProj   = projFilter === 'All' || d.project_code === projFilter;
    const matchType   = typeFilter === 'All' || d.type === typeFilter;
    return matchSearch && matchProj && matchType;
  });

  const handleUpload = (files) => {
    const newRows = files.map((f, i) => ({
      id: localData.length + i + 1,
      name: f.name,
      project_code: 'CC-ADAPT-001',
      type: f.name.split('.').pop(),
      rows: 0,
      size_kb: Math.round(f.size / 1024),
      uploaded_by: user?.name || 'Current User',
      uploaded_at: new Date().toISOString(),
      status: 'pending',
      tags: [],
    }));
    setLocalData(prev => [...newRows, ...prev]);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload, manage and explore project datasets</p>
      </div>

      {/* Upload zone */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Upload New Dataset</h2>
        <UploadZone onUpload={handleUpload} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets or tags…"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 flex-1 min-w-48"
          />
          <select value={projFilter} onChange={e => setProj(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <span className="text-xs text-gray-400">{filtered.length} records</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-green-50">
            <tr className="text-left">
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400">Name</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400">Project</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400">Type</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400 text-right">Rows</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400 text-right">Size</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400">Uploaded</th>
              <th className="px-5 py-3 text-xs font-bold uppercase text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No datasets found</td></tr>
            ) : filtered.map(d => {
              const proj = PROJECTS.find(p => p.code === d.project_code);
              return (
                <tr key={d.id} className="hover:bg-green-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{TYPE_ICON[d.type] || '📄'}</span>
                      <div>
                        <div className="font-medium text-gray-800">{d.name}</div>
                        <div className="flex gap-1 mt-0.5">
                          {d.tags.map(t => (
                            <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {proj && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: proj.category_color }}>
                        {proj.category}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 uppercase text-xs font-mono text-gray-500">{d.type}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{d.rows > 0 ? d.rows.toLocaleString() : '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{d.size_kb}KB</td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    <div>{d.uploaded_by}</div>
                    <div>{new Date(d.uploaded_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CHIP[d.status] || 'bg-gray-100 text-gray-500'}`}>
                      {d.status}
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
