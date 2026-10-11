import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRepository, validatePlan } from '../scripts/check-plan.mjs';

const plan = readFileSync(new URL('../docs/DEVELOPMENT_PLAN.md', import.meta.url), 'utf8');

test('approved 50 engine and 4 branded steps are complete and acyclic', () => {
  assert.equal(validatePlan(plan).length, 54);
  assert.equal(checkRepository().traceabilityGroups, 22);
});
test('missing approved work is rejected', () => {
  assert.throws(() => validatePlan(plan.replace('## E05 -', '### E05 -')), /exactly/);
});
test('duplicate IDs are rejected', () => {
  assert.throws(() => validatePlan(plan.replace('## E05 -', '## E04 -')), /Duplicate/);
});
test('unknown dependencies are rejected', () => {
  assert.throws(() => validatePlan(plan.replace('Depends: none', 'Depends: E99')), /Unknown/);
});
test('circular dependencies are rejected', () => {
  assert.throws(() => validatePlan(plan.replace('Depends: none', 'Depends: E50')), /cycle/);
});
test('missing acceptance criteria are rejected', () => {
  assert.throws(() => validatePlan(plan.replace('Gate: Every substantive', 'Acceptance: Every substantive')), /Incomplete/);
});
test('premature branded release is rejected', () => {
  assert.throws(() => validatePlan(plan.replace('Depends: E47\n', 'Depends: E46\n')), /release\/pilot/);
});
test('premature AI promotion is rejected', () => {
  assert.throws(() => validatePlan(plan.replace('Depends: U04, E42, E43', 'Depends: E42, E43')), /release\/pilot/);
});
