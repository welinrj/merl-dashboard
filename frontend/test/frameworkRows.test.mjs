import test from 'node:test';
import assert from 'node:assert/strict';
import { standaloneFrameworkNodes } from '../src/lib/docc/frameworkRows';

test('component and outcome ancestors do not appear as empty results before linked outputs', () => {
  const nodes = [{id:'component'}, {id:'outcome',parent_node_id:'component'}, {id:'output',parent_node_id:'outcome'}];
  assert.deepEqual(standaloneFrameworkNodes(nodes,[{framework_node_id:'output'}]), []);
});
test('unlinked outputs and components without children remain visible for completion', () => {
  const nodes = [{id:'component'}, {id:'output',parent_node_id:'component'}, {id:'unfilled'}];
  assert.deepEqual(standaloneFrameworkNodes(nodes,[]).map(n=>n.id), ['output','unfilled']);
});
