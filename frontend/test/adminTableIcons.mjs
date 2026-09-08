import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminTableIcon, AdminSortIcon } from '../src/components/ui/AdminTableIcons.jsx';
import { tableModel } from '../src/components/ui/adminTableModel.js';

const render = component => renderToStaticMarkup(component);

test('sort indicators use unboxed line SVGs in all three states', () => {
  const icons = ['ascending', 'descending', undefined].map(direction => render(createElement(AdminSortIcon, { direction })));
  for (const icon of icons) {
    assert.match(icon, /<svg\b/);
    assert.match(icon, /fill="none"/);
    assert.match(icon, /stroke="currentColor"/);
    assert.match(icon, /aria-hidden="true"/);
    assert.doesNotMatch(icon, /<rect\b|<text\b|↕|↑|↓/);
  }
  assert.notEqual(icons[0], icons[1]);
  assert.notEqual(icons[0], icons[2]);
});

test('table control icons render without changing their accessible button labels', () => {
  for (const name of ['search', 'chevronDown', 'moreHorizontal', 'chevronsLeft', 'chevronLeft', 'chevronRight', 'chevronsRight']) {
    const icon = render(createElement(AdminTableIcon, { name }));
    assert.match(icon, /<svg\b/);
    assert.match(icon, /<path\b|<circle\b/);
  }
});

test('ascending and descending table sorting still order records correctly', () => {
  const rows = [{id: '2', name: 'Zoe'}, {id: '1', name: 'Anna'}];
  const columns = [{key: 'name', label: 'Name'}];
  const ascending = tableModel(rows, columns, '', [], {key: 'name', desc: false}, 0, 10);
  const descending = tableModel(rows, columns, '', [], {key: 'name', desc: true}, 0, 10);
  assert.deepEqual(ascending.rows.map(row => row.id), ['1', '2']);
  assert.deepEqual(descending.rows.map(row => row.id), ['2', '1']);
});
