import test from 'node:test';
import assert from 'node:assert/strict';
import { frameworkGroups } from '../src/lib/docc/frameworkGroups';

test('phone groups retain outcome ancestry and every indicator exactly once', () => {
  const outcome = { id: 'oc', node_type: 'outcome' };
  const outputA = { id: 'a', node_type: 'output' }, outputB = { id: 'b', node_type: 'output' };
  const rows = [outputA, outputB].map((node, index) => ({ project: { id: 'p' }, path: [outcome, node], node, indicator: { id: index } }));
  const groups = frameworkGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].node, outcome);
  assert.deepEqual(groups[0].rows, rows);
});

test('outputs without outcomes and unlinked indicators never acquire invented parents', () => {
  const output = { id: 'out', node_type: 'output' };
  const rows = [
    { project: { id: 'p' }, path: [output], node: output },
    { project: { id: 'p' }, path: [], node: null, indicator: { id: 'i' } },
    { project: { id: 'q' }, path: [], node: null, indicator: { id: 'j' } },
  ];
  const groups = frameworkGroups(rows);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].node, output);
  assert.equal(groups[1].node, null);
  assert.notEqual(groups[1].key, groups[2].key);
});
