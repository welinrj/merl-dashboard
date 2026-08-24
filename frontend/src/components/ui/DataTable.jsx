// DataTable — one professional table pattern (spec §10): search, column sort,
// pagination (10/25/50), row actions, sticky header, empty + loading states,
// and horizontal-scroll responsive behaviour. Client-side; for very large sets
// pass already-paginated data and set `serverPaged`.
//
//   <DataTable
//     columns={[
//       { key:'code', header:'Project', sortable:true, render:r => r.code },
//       { key:'status', header:'Status', render:r => <StatusBadge status={r.status}/> },
//       { key:'_actions', header:'', align:'right', render:r => <button/> },
//     ]}
//     rows={rows} keyField="id" searchable={['code','name']} loading={loading}
//     empty={{ title:'No projects', description:'Add one to begin.' }}
//     toolbar={<FilterBar .../>} />
import { useMemo, useState } from 'react';
import { Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState';
import { SkeletonRows } from './LoadingSkeleton';

const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export default function DataTable({
  columns, rows = [], keyField = 'id',
  searchable, searchPlaceholder = 'Search…',
  pageSizeOptions = [10, 25, 50], pageSize: initialPageSize = 10,
  loading = false, empty, toolbar, dense = false, minWidth = 720, stickyHeader = true,
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const searchText = (row) => {
    if (typeof searchable === 'function') return searchable(row) ?? '';
    if (Array.isArray(searchable)) return searchable.map((k) => row[k] ?? '').join(' ');
    return '';
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchable) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchable]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const val = col.sortValue || ((r) => r[sortKey]);
    const out = [...filtered].sort((a, b) => cmp(val(a), val(b)));
    return sortDir === 'desc' ? out.reverse() : out;
  }, [filtered, sortKey, sortDir, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount);
  const start = (curPage - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col.key); setSortDir('asc'); }
    setPage(1);
  };

  const cellPad = dense ? '0.4rem 0.6rem' : undefined;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {(searchable || toolbar) && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem 0.9rem', borderBottom: '1px solid var(--border)' }}>
          {searchable && (
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} aria-hidden="true" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder={searchPlaceholder} aria-label={searchPlaceholder}
                className="field-input" style={{ paddingLeft: 32, width: '100%' }} />
            </div>
          )}
          {toolbar}
        </div>
      )}

      <div style={{ overflowX: 'auto' }} className="scrollbar-thin">
        <table className="data-table" style={{ minWidth, width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key} onClick={() => toggleSort(c)}
                    style={{ textAlign: c.align || 'left', width: c.width, whiteSpace: 'nowrap',
                      cursor: c.sortable ? 'pointer' : 'default', userSelect: 'none',
                      position: stickyHeader ? 'sticky' : undefined, top: stickyHeader ? 0 : undefined,
                      background: 'var(--surface-1)', zIndex: 1 }}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      {c.header}
                      {c.sortable && active && (sortDir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{ padding: '0.5rem 0.9rem' }}><SkeletonRows rows={Math.min(pageSize, 6)} cols={columns.length} /></td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ padding: 0 }}>
                <EmptyState title={empty?.title || (query ? 'No matches' : 'No records')}
                  description={empty?.description || (query ? 'Try a different search.' : undefined)} action={empty?.action} />
              </td></tr>
            ) : paged.map((r) => (
              <tr key={r[keyField]}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'left', padding: cellPad, ...(c.cellStyle || null) }}>
                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', padding: '0.6rem 0.9rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>Rows</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              aria-label="Rows per page" className="field-input" style={{ width: 'auto', padding: '0.2rem 0.4rem' }}>
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1}
              aria-label="Previous page" className="btn-secondary" style={{ padding: '0.25rem', borderRadius: 6, cursor: curPage <= 1 ? 'not-allowed' : 'pointer', opacity: curPage <= 1 ? 0.5 : 1 }}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span style={{ minWidth: 60, textAlign: 'center' }}>Page {curPage}/{pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage >= pageCount}
              aria-label="Next page" className="btn-secondary" style={{ padding: '0.25rem', borderRadius: 6, cursor: curPage >= pageCount ? 'not-allowed' : 'pointer', opacity: curPage >= pageCount ? 0.5 : 1 }}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
