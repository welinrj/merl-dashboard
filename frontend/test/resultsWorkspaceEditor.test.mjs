import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ResultsWorkspace.jsx', import.meta.url), 'utf8');

test('results workspace uses the table as the single framework editing entry point', () => {
  assert.doesNotMatch(source, />Framework editor</);
  assert.doesNotMatch(source, />\+ Result node</);
  assert.doesNotMatch(source, />\+ Indicator</);
  assert.match(source, /onClick=\{\(\) => editNode\(node, row\)\}/);
  assert.match(source, /onClick=\{\(\) => editRow\(row\)\}/);
});

test('table edit actions open an accessible focused dialog', () => {
  assert.match(source, /className="rf2-edit-dialog"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});
