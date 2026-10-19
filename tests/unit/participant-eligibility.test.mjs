import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibilityEvidence } from '../../packages/competition/src/participant-eligibility.mjs';
const codes = ['identity', 'age-or-guardian', 'jurisdiction', 'employee-family-conflict', 'recording-release', 'terms', 'material-rights'];
const example = () => ({ tenantId: 'tenant-A', eventId: 'event-A', participantId: 'person-A', checks: codes.map(code => ({ code, state: 'verified' })) });
test('all positive claims remain untrusted until authenticated issuer and immutable evidence are checked', () => {
  const result = evaluateEligibilityEvidence(example());
  assert.equal(result.noReportedFindings, true);
  assert.equal(result.participantAuthorized, false);
  assert.equal(result.evidenceAuthenticityVerified, false);
  assert.equal(result.competitionReady, false);
  assert.ok(Object.isFrozen(result.blockers));
});
test('missing guardian, family conflict, expired recording release and disputed eligibility cannot be overlooked', () => {
  const input=example();
  for (const [code, state] of [['age-or-guardian','missing'],['employee-family-conflict','disputed'],['recording-release','expired']]) {
    const row=input.checks.find(x => x.code === code); row.state=state;
  }
  const result=evaluateEligibilityEvidence(input);
  assert.equal(result.noReportedFindings,false);
  assert.deepEqual(result.blockers.map(x => x.code), ['age-or-guardian','employee-family-conflict','recording-release']);
  assert.equal(result.participantAuthorized,false);
});
test('incomplete, cross-scope-looking or duplicate evidence is rejected', () => {
 const source=example();
 for (const changed of [
  { ...source, checks: source.checks.slice(1) },
  { ...source, checks: [...source.checks.slice(0,-1), source.checks[0]] },
  { ...source, checks: source.checks.map((x,i) => i ? x : {...x,state:'auto-approved'} ) },
  { ...source, checks: source.checks.map((x,i) => i ? x : {...x,sourceSecret:'untrusted'} ) },
  { ...source, tenantId: '../tenant' },
  { ...source, gateApproved: true },
 ]) assert.throws(() => evaluateEligibilityEvidence(changed));
});
