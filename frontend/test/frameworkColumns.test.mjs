import test from 'node:test';
import assert from 'node:assert/strict';
import { frameworkColumns } from '../src/lib/docc/frameworkColumns.js';

test('recorded ancestry separates components, outcomes and outputs without losing nodes', () => {
  const path = ['project_objective', 'component', 'outcome', 'output', 'sub_output'].map((node_type, id) => ({ id, node_type }));
  const columns = frameworkColumns(path);
  assert.deepEqual(columns.component, [path[1]]);
  assert.deepEqual(columns.outcome, [path[2]]);
  assert.deepEqual(columns.output, [path[3], path[4]]);
  assert.equal(Object.values(columns).flat().length, path.length);
});

test('frameworks with missing levels or unusual strategic nodes preserve their actual structure', () => {
  const path = [{ id: 'impact', node_type: 'impact' }, { id: 'output', node_type: 'output' }, { id: 'legacy', node_type: 'legacy_result' }];
  const columns = frameworkColumns(path);
  assert.deepEqual(columns.component, []);
  assert.deepEqual(columns.outcome, []);
  assert.deepEqual(columns.output, [path[1]]);
  assert.deepEqual(columns.objective, [path[0], path[2]]);
  assert.deepEqual(frameworkColumns([]), { objective: [], component: [], outcome: [], output: [] });
});
