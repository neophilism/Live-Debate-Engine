import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { materialRuleset, materialContract, parseData } from '../../dist/packages/contracts/src/domain.js';
import { sourceManualProfile } from '../../dist/packages/competition/src/model.js';
import { acknowledgeInput, saveContractInput } from '../../dist/packages/competition/src/store.js';
import { createCompetitionHttp } from '../../dist/packages/competition/src/http.js';
import { initialSnapshot, referenceOf } from '../../dist/packages/contracts/src/snapshot.js';
import { readMaterialRecord, readContractWorkspace } from '../../dist/packages/ui/src/competition-client.js';
import { createApi } from '../../dist/apps/api/src/server.js';
import { fixtureSet } from '../helpers/domain-fixtures.mjs';

const f = fixtureSet();
const rules = sourceManualProfile();
const data = { ...f.contract.record.data, materialVersion: 2, eventRef: referenceOf(f.event),
  startsAt: '2027-03-01T12:00:00.000Z', acknowledgmentDeadline: '2027-02-28T12:00:00.000Z', amendmentReason: null,
  speakers: [[f.participant, 'for'], [f.participant2, 'against']].map(([participant, side]) => ({ participantRef: referenceOf(participant),
    assignmentRef: { ...referenceOf(f.assignment), entityId: randomUUID(), snapshotId: randomUUID() }, side, order: 1,
    openingSeconds: 420, closingSeconds: 180, prizeShareBps: null })) };

test('material source profile has explicit voting, per-side timing, human judging and distinct prize policies', () => {
  assert.equal(rules.rubric.reduce((n, r) => n + r.weightBps, 0), 10000);
  assert.equal(rules.timing.openingPerSideSeconds, 420); assert.equal(rules.timing.closingPerSideSeconds, 180);
  assert.equal(rules.judging.mode, 'human'); assert.equal(rules.standardPrize.audienceShareBps, 5000);
  assert.equal(rules.electorate.cohort, 'paired-valid'); assert.equal(rules.electorate.interimDisclosure, false);
  assert.equal(rules.competitorEntryFeeMinorUnits, '0'); assert.ok(Object.isFrozen(rules.voting));
});
test('version discrimination preserves legacy history but rejects unknown or mixed versions', () => {
  assert.deepEqual(parseData('ruleset', f.ruleset.record.data), f.ruleset.record.data);
  assert.deepEqual(parseData('contract', f.contract.record.data), f.contract.record.data);
  assert.deepEqual(materialContract(data), data);
  for (const materialVersion of [null, 0, 1, 3, '2']) { assert.throws(() => parseData('ruleset', { ...rules, materialVersion })); assert.throws(() => parseData('contract', { ...data, materialVersion })); }
  const legacy = { ...rules }; delete legacy.materialVersion; assert.throws(() => parseData('ruleset', legacy));
});
test('every material field is required; null, extra properties and hidden actors fail closed', () => {
  for (const key of Object.keys(rules)) { const bad = structuredClone(rules); delete bad[key]; assert.throws(() => materialRuleset(bad)); }
  for (const key of Object.keys(data)) { const bad = structuredClone(data); delete bad[key]; assert.throws(() => materialContract(bad)); }
  assert.throws(() => materialRuleset({ ...rules, override: true }));
  assert.throws(() => saveContractInput({ commandId: randomUUID(), expectedRevision: 0, data, principalId: randomUUID() }));
});
test('rubric and material deadline/cap relationships reject ambiguous policies', () => {
  for (const mutate of [r => { r.rubric[0].weightBps--; }, r => { r.rubric[0].code = r.rubric[1].code; }, r => { r.adjustments.bonusTotalCap = 0; }, r => { r.deadlines.paymentTargetDays = 90; }, r => { r.voting.choices = ['for', 'against', 'against']; }, r => { r.electorate.interimDisclosure = true; }]) {
    const bad = structuredClone(rules); mutate(bad); assert.throws(() => materialRuleset(bad));
  }
});
test('contract validates each unique individual, opposing teams, contiguous order and material UTC dates', () => {
  for (const mutate of [d => { d.speakers[0].participantRef = d.speakers[1].participantRef; }, d => { d.speakers[0].assignmentRef = d.speakers[1].assignmentRef; }, d => { d.speakers[0].order = 2; }, d => { d.againstTeamRef = d.forTeamRef; }, d => { d.acknowledgmentDeadline = d.startsAt; }, d => { d.startsAt = '2027-02-30T12:00:00.000Z'; }, d => { d.timeZone = 'Unlisted/Zone'; }, d => { d.publication = 'embargoed'; d.embargoUntil = null; }]) {
    const bad = structuredClone(data); mutate(bad); assert.throws(() => materialContract(bad));
  }
});
test('material prizes retain exact minor-unit precision and acknowledgments demand explicit current hash intent', () => {
  assert.equal(materialContract({ ...data, prizeBudget: { currency: 'USD', exponent: 2, minorUnits: '9007199254740993' } }).prizeBudget.minorUnits, '9007199254740993');
  const intent = { commandId: randomUUID(), snapshotId: randomUUID(), contentHash: 'a'.repeat(64), accepted: true };
  assert.deepEqual(acknowledgeInput(intent), intent);
  for (const accepted of [false, null, 1, 'true']) assert.throws(() => acknowledgeInput({ ...intent, accepted }));
  assert.throws(() => acknowledgeInput({ ...intent, principalId: randomUUID() }));
  assert.throws(() => acknowledgeInput({ ...intent, contentHash: 'b'.repeat(63) }));
});
test('browser verifies immutable bytes before enabling material controls and rejects invented operational readiness', async () => {
  const snap = initialSnapshot('ruleset', { tenantId: f.tenantId, entityId: randomUUID(), eventId: null }, rules);
  const envelope = { snapshot: snap.record, contentHash: snap.contentHash, published: true, accepted: false, invalidated: false };
  assert.equal((await readMaterialRecord(envelope)).contentHash, snap.contentHash);
  await assert.rejects(readMaterialRecord({ ...envelope, contentHash: '0'.repeat(64) }));
  await assert.rejects(readMaterialRecord({ ...envelope, snapshot: { ...snap.record, data: { ...rules, name: 'Altered' } } }));
  await assert.rejects(readMaterialRecord({ ...envelope, published: 'true' }));
  await assert.rejects(readContractWorkspace({ canManage: true, canAcknowledge: false, pendingAmendment: false, viewingHistory: false, ownAcknowledgment: false,
    status: { offered: true, accepted: true, basisCurrent: true, materialReady: true, acknowledgmentOpen: true, registrationOpen: true, competitionReady: true } }));
});
test('material HTTP telemetry failure never causes a second response or changes a committed result', async (t) => {
  const store = { rulesets: async () => ({ records: [], current: null, profile: rules }) };
  const identity = { authenticate: async () => ({ token: 'synthetic-only' }) }; let runtime;
  const server = createApi({ competition: { handle: (...args) => runtime.handle(...args) } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  runtime = createCompetitionHttp(store, identity, origin, () => { throw new Error('Unavailable synthetic telemetry sink'); });
  const response = await fetch(`${origin}/api/tenants/${f.tenantId}/rulesets`);
  assert.equal(response.status, 200); assert.equal((await response.json()).records.length, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
