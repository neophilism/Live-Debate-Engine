import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ENTITY_KINDS, parseData } from '../../dist/packages/contracts/src/domain.js';
import { addMoney, compareMoney, money, MAX_MINOR_UNITS } from '../../dist/packages/contracts/src/money.js';
import { canonicalJson, contentHash, MAX_RECORD_BYTES } from '../../dist/packages/contracts/src/canonical.js';
import { initialSnapshot, nextSnapshot, snapshotOf, verifySnapshot, decodeSnapshot, referenceOf, appendIntentHash } from '../../dist/packages/contracts/src/snapshot.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';

const fixtures = fixtureSet();
const byKind = new Map(fixtures.created.map((item) => [item.record.kind, item]));
for (const kind of ENTITY_KINDS) {
  test(`typed snapshot round trip: ${kind}`, () => {
    const source = byKind.get(kind);
    assert.ok(source);
    assert.deepEqual(decodeSnapshot(source.canonical, source.contentHash), source);
    assert.ok(Object.isFrozen(source.record.data));
    assert.throws(() => parseData(kind, { ...source.record.data, unexpected: true }));
  });
}
test('all 20 entity families have structural fixtures', () => assert.equal(byKind.size, 20));
test('audience, judges, advancement and obligations cannot be substituted', () => {
  for (const [target, source] of [['audience-verdict', fixtures.judges], ['judges-verdict', fixtures.audience], ['advancement-decision', fixtures.prize], ['prize-obligation', fixtures.advancement]]) {
    assert.throws(() => parseData(target, source.record.data));
  }
  assert.equal(fixtures.audience.record.data.decision, 'for');
  assert.equal(fixtures.judges.record.data.decision, 'against');
  assert.equal(fixtures.advancement.record.data.selectedSide, 'for');
});
test('money round trips values beyond Number safe integer without loss', () => {
  const total = addMoney(money('USD', '9007199254740993', 2), money('USD', 2n, 2));
  assert.equal(total.minorUnits, '9007199254740995');
  assert.equal(compareMoney(total, money('USD', '9007199254740993', 2)), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(total)), total);
});
test('money rejects floating input, negatives, exponent notation, padding and overflow', () => {
  for (const input of [18.5, 1800, -1n, '1.5', '1e3', '001', '-0', MAX_MINOR_UNITS + 1n]) assert.throws(() => money('USD', input, 2));
  assert.throws(() => addMoney(money('USD', MAX_MINOR_UNITS, 2), money('USD', 1n, 2)));
  assert.throws(() => addMoney(money('USD', 1n, 2), money('EUR', 1n, 2)));
  assert.throws(() => compareMoney(money('USD', 1n, 2), money('USD', 1n, 0)));
});
test('canonical JSON is independent of insertion order', () => {
  assert.equal(canonicalJson({ b: 2, a: [true, null, 'hello'] }), '{"a":[true,null,"hello"],"b":2}');
  assert.equal(contentHash({ a: 1, b: 2 }), contentHash({ b: 2, a: 1 }));
  assert.notEqual(contentHash({ a: '1' }), contentHash({ a: 1 }));
});
for (const value of [NaN, Infinity, -0, 0.5, undefined, 2n, new Date(), () => 1, String.fromCharCode(0xd800), '\0']) {
  test(`unsafe canonical value rejected: ${typeof value}`, () => assert.throws(() => canonicalJson(value)));
}
test('canonicalization does not invoke accessors or toJSON', () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, 'a', { enumerable: true, get() { calls += 1; return 1; } });
  const custom = { toJSON() { calls += 1; return 1; } };
  assert.throws(() => canonicalJson(accessor));
  assert.throws(() => canonicalJson(custom));
  assert.equal(calls, 0);
});
test('canonicalization rejects cycles, sparse arrays, hidden fields and oversized data', () => {
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle));
  assert.throws(() => canonicalJson(new Array(2)));
  assert.throws(() => canonicalJson({ [Symbol('hidden')]: 1 }));
  assert.throws(() => canonicalJson('x'.repeat(MAX_RECORD_BYTES + 1)));
  let nested = null; for (let i = 0; i < 40; i += 1) nested = { nested };
  assert.throws(() => canonicalJson(nested));
});
test('revision creation does not mutate the previous record', () => {
  const previous = fixtures.motion;
  const next = nextSnapshot(previous, { text: 'Corrected synthetic motion.' });
  assert.equal(next.record.revision, 2);
  assert.equal(next.record.previousSnapshotId, previous.record.snapshotId);
  assert.notEqual(next.contentHash, previous.contentHash);
  assert.equal(previous.record.data.text, 'This is a synthetic test motion.');
  assert.throws(() => { previous.record.data.text = 'mutation'; });
  assert.throws(() => { fixtures.team.record.data.members.push(referenceOf(fixtures.participant2)); });
});
test('corrupt, noncanonical and incorrectly linked revisions are rejected', () => {
  const item = fixtures.motion;
  assert.throws(() => verifySnapshot({ ...item, contentHash: '0'.repeat(64) }));
  assert.throws(() => decodeSnapshot(` ${item.canonical}`, item.contentHash));
  assert.throws(() => snapshotOf({ ...item.record, revision: 2 }));
  assert.throws(() => snapshotOf({ ...item.record, previousSnapshotId: item.record.snapshotId }));
  assert.throws(() => snapshotOf({ ...item.record, recordedAt: '2026-02-30T00:00:00.000Z' }));
});
test('entity and reference scopes cannot cross tenants or events', () => {
  const item = fixtures.ballot;
  assert.throws(() => snapshotOf({ ...item.record, tenantId: uuid(2) }), /Cross-tenant/);
  assert.throws(() => snapshotOf({ ...item.record, eventId: uuid(3) }), /Cross-event/);
  assert.throws(() => snapshotOf({ ...fixtures.motion.record, eventId: fixtures.eventId }), /scope/);
  assert.throws(() => snapshotOf({ ...fixtures.event.record, entityId: uuid(777) }), /identity/);
});
test('plaintext ballot choices and personal identity fields are rejected', () => {
  for (const field of ['choice', 'email', 'principalId']) assert.throws(() => parseData('ballot', { ...fixtures.ballot.record.data, [field]: 'for' }));
});
test('invalid roster, rubric and timing metadata are rejected', () => {
  assert.throws(() => parseData('team', { ...fixtures.team.record.data, members: [referenceOf(fixtures.participant), referenceOf(fixtures.participant)] }));
  assert.throws(() => parseData('contract', { ...fixtures.contract.record.data, againstTeamRef: referenceOf(fixtures.team) }));
  assert.throws(() => parseData('poll', { ...fixtures.poll.record.data, closesAt: fixtures.poll.record.data.opensAt }));
  const data = fixtures.ruleset.record.data;
  assert.throws(() => parseData('ruleset', { ...data, rubric: data.rubric.map((row) => ({ ...row, weightBps: 1 })) }));
  assert.throws(() => parseData('ruleset', { ...data, electorate: { ...data.electorate, interimDisclosure: true } }));
});
test('idempotency hashes exclude generated timestamps and snapshot IDs, not intent', () => {
  const current = fixtures.motion;
  const retry = snapshotOf({ ...current.record, snapshotId: randomUUID(), recordedAt: '2026-10-11T09:01:00.000Z' });
  assert.equal(appendIntentHash(current), appendIntentHash(retry));
  assert.notEqual(current.contentHash, retry.contentHash);
  const changed = initialSnapshot('motion', { tenantId: fixtures.tenantId, entityId: current.record.entityId, eventId: null }, { text: 'Different intent' });
  assert.notEqual(appendIntentHash(current), appendIntentHash(changed));
});
test('unknown discriminator and scope metadata cannot override a factory kind', () => {
  assert.throws(() => parseData('toString', {}));
  assert.throws(() => initialSnapshot('motion', { tenantId: fixtures.tenantId, entityId: uuid(777), eventId: null, kind: 'series' }, { name: 'Attempted override' }));
});
