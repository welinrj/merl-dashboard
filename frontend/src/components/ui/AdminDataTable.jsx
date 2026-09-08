import { useEffect, useMemo, useState } from 'react';
import './admin-data-table.css';

import { display, valueOf, tableModel } from './adminTableModel';

export default function AdminDataTable({
  title, columns, rows = [], loading = false, empty = 'No records found.',
  searchPlaceholder = 'Search records…', filters = [], actions, rowActions,
  getRowId = row => row.id, expandedRow, isExpanded, onRefresh,
  pagination, selection = false, defaultSort = null,
}) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [hidden, setHidden] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [menuId, setMenuId] = useState(null);
  const server = Boolean(pagination);
  const currentPage = server ? pagination.page : page;
  const filtersForModel = filters.map(f => ({...f, selected: filterValues[f.key] || ''}));
  const model = useMemo(() => server ? {rows, total:pagination.total, pages:Math.max(1,Math.ceil(pagination.total / pagination.pageSize)), page:Math.min(pagination.page,Math.max(0,Math.ceil(pagination.total / pagination.pageSize)-1))} : tableModel(rows, columns, query, filtersForModel, sort, page, size), [server, rows, columns, query, filtersForModel, sort, page, size, pagination]);
  const visible = columns.filter(c => c.required || !hidden.includes(c.key));
  const pageIds = model.rows.map(getRowId);
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someSelected = pageIds.some(id => selected.has(id));
  const changePage = next => server ? pagination.onPageChange(next) : setPage(next);
  const resetPage = () => changePage(0);
  const toggleSelection = (id, checked) => setSelected(previous => {const next = new Set(previous); if(checked) next.add(id); else next.delete(id); return next;});
  const togglePage = checked => setSelected(previous => {const next = new Set(previous); pageIds.forEach(id => checked ? next.add(id) : next.delete(id)); return next;});
  useEffect(() => { if (!server && page >= model.pages) setPage(model.pages - 1); }, [server, page, model.pages]);
  useEffect(() => { setSelected(previous => new Set([...previous].filter(id => rows.some(row => getRowId(row) === id)))); }, [rows]);
  const colSpan = visible.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);
  const renderRow = row => {
    const id = getRowId(row);
    const options = rowActions?.(row) || [];
    return <tbody key={id} className="adt-row-group">
      <tr>
        {selection && <td className="adt-check"><input type="checkbox" aria-label={`Select ${display(row.full_name || row.name || row.code || id)}`} checked={selected.has(id)} onChange={e => toggleSelection(id,e.target.checked)}/></td>}
        {visible.map(column => <td key={column.key} className={column.align === 'right' ? 'adt-right' : ''}>{column.render ? column.render(row) : display(valueOf(column,row)) || '—'}</td>)}
        {rowActions && <td className="adt-right"><details className="adt-row-menu" open={menuId === id} onToggle={e => setMenuId(e.currentTarget.open ? id : old => old === id ? null : old)}><summary aria-label={`Actions for ${display(row.full_name || row.name || row.code || id)}`}>⋯</summary><div className="adt-row-menu-list">{options.map(option => <button key={option.label} type="button" disabled={option.disabled} className={option.danger ? 'adt-danger' : ''} onClick={() => {setMenuId(null); option.onClick();}}>{option.label}</button>)}</div></details></td>}
      </tr>
      {expandedRow && isExpanded?.(row) && <tr><td colSpan={colSpan}>{expandedRow(row)}</td></tr>}
    </tbody>;
  };
  return <section className="adt" aria-label={title}>
    <div className="adt-toolbar">
      <label className="adt-search"><span aria-hidden="true">⌕</span><input aria-label={searchPlaceholder} type="search" placeholder={searchPlaceholder} value={server ? pagination.search : query} onChange={e => {if(server)pagination.onSearchChange(e.target.value);else setQuery(e.target.value);resetPage();}}/></label>
      {filters.map(filter => <label key={filter.key} className="adt-filter"><span>{filter.label}</span><select value={filterValues[filter.key] || ''} onChange={e => {setFilterValues(v => ({...v,[filter.key]:e.target.value}));filter.onChange?.(e.target.value);resetPage();}}><option value="">All {filter.label.toLowerCase()}</option>{filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
      <div className="adt-toolbar-end"><details className="adt-columns"><summary>Columns <span aria-hidden="true">⌄</span></summary><div className="adt-columns-menu">{columns.filter(c => !c.required).map(column => <label key={column.key}><input type="checkbox" checked={!hidden.includes(column.key)} onChange={e => setHidden(v => e.target.checked ? v.filter(k => k !== column.key) : [...v,column.key])}/>{column.label}</label>)}</div></details>{onRefresh && <button type="button" className="adt-secondary" disabled={loading} onClick={onRefresh}>Refresh</button>}{actions}</div>
    </div>
    {selection && selected.size > 0 && <div className="adt-selection" role="status"><strong>{selected.size} selected</strong><button type="button" onClick={() => setSelected(new Set())}>Clear selection</button></div>}
    <div className="adt-scroll"><table><thead><tr>{selection && <th className="adt-check" scope="col"><input type="checkbox" aria-label="Select visible rows" checked={allSelected} ref={node => {if(node) node.indeterminate = someSelected && !allSelected;}} onChange={e => togglePage(e.target.checked)}/></th>}{visible.map(column => <th key={column.key} scope="col" className={column.align === 'right' ? 'adt-right' : ''} aria-sort={sort?.key === column.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>{column.sortable === false ? column.label : <button type="button" className="adt-sort" onClick={() => {setSort(s => s?.key === column.key ? {key:column.key,desc:!s.desc} : {key:column.key,desc:false});resetPage();}}>{column.label}<span aria-hidden="true">{sort?.key === column.key ? (sort.desc ? '↓' : '↑') : '↕'}</span></button>}</th>)}{rowActions && <th scope="col" className="adt-right">Actions</th>}</tr></thead>
      {loading && !rows.length ? <tbody><tr><td colSpan={colSpan} className="adt-empty" role="status">Loading records…</td></tr></tbody> : !model.rows.length ? <tbody><tr><td colSpan={colSpan} className="adt-empty">{empty}</td></tr></tbody> : model.rows.map(renderRow)}
    </table></div>
    <footer className="adt-footer"><span>{model.total ? `${model.page * (server ? pagination.pageSize : size) + 1}–${Math.min((model.page + 1) * (server ? pagination.pageSize : size),model.total)} of ${model.total}` : '0 records'}{selection ? ` · ${selected.size} selected` : ''}</span><div>{!server && <label>Rows per page <select value={size} onChange={e => {setSize(Number(e.target.value));setPage(0);}}>{[10,25,50].map(n => <option key={n}>{n}</option>)}</select></label>}<button type="button" aria-label="First page" disabled={model.page === 0 || loading} onClick={() => changePage(0)}>«</button><button type="button" aria-label="Previous page" disabled={model.page === 0 || loading} onClick={() => changePage(model.page - 1)}>‹</button><span>Page {model.page + 1} of {model.pages}</span><button type="button" aria-label="Next page" disabled={model.page + 1 >= model.pages || loading} onClick={() => changePage(model.page + 1)}>›</button><button type="button" aria-label="Last page" disabled={model.page + 1 >= model.pages || loading} onClick={() => changePage(model.pages - 1)}>»</button></div></footer>
  </section>;
}
