import test from 'node:test';
import assert from 'node:assert/strict';
import { frameworkTargetValue } from '../src/lib/docc/frameworkTarget.js';

test('text milestones and compound requirements remain visible in the framework', () => {
  assert.equal(frameworkTargetValue({ text_value: 'Published national guideline and action plan.' }), 'Published national guideline and action plan.');
  assert.equal(frameworkTargetValue({ text_value: 'At least 7 sectors and at least 4 training.' }), 'At least 7 sectors and at least 4 training.');
});
test('ordinal targets carry their scale label without becoming percentage targets', () => {
  assert.equal(frameworkTargetValue({ ordinal_value: 8, text_value: 'Scale 8. Strong standardized measurements.' }), 'Scale 8');
});
test('numeric zero is preserved and absent baselines remain missing', () => {
  assert.equal(frameworkTargetValue({ numeric_value: 0 }), 0);
  assert.equal(frameworkTargetValue({ numeric_value: null, text_value: null }), null);
  assert.equal(frameworkTargetValue(undefined, 7), 7);
});
