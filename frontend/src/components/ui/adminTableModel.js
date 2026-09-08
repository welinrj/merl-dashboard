export const display = value => value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value);
export const valueOf = (column, row) => column.value ? column.value(row) : row[column.key];
export function compareValues(a, b) {
  if (a == null || a === '') return b == null || b === '' ? 0 : -1;
  if (b == null || b === '') return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return display(a).localeCompare(display(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Only client-side tables use this model. Audit history is paged by the backend.
export function tableModel(rows, columns, query, filters, sort, page, size) {
  const q = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => {
    if (q && !columns.filter(c => c.searchable !== false).some(c => display(valueOf(c, row)).toLocaleLowerCase().includes(q))) return false;
    return filters.every(f => !f.selected || String(f.value ? f.value(row) : row[f.key]) === f.selected);
  });
  const column = columns.find(c => c.key === sort?.key);
  const sorted = column ? [...filtered].sort((a, b) => compareValues(valueOf(column, a), valueOf(column, b)) * (sort.desc ? -1 : 1)) : filtered;
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  return { rows: sorted.slice(current * size, (current + 1) * size), total: sorted.length, pages, page: current };
}

