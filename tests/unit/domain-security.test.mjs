import test from 'node:test';
import assert from 'node:assert/strict';
import { dataParsers, ENTITY_KINDS, EVENT_KINDS, TENANT_KINDS, ROLES, PHASES } from '../../dist/packages/contracts/src/domain.js';
import { initialSnapshot, nextSnapshot, verifySnapshot } from '../../dist/packages/contracts/src/snapshot.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';

const f = fixtureSet();
test('schema registry and public enum arrays cannot be mutated', () => {
  for (const value of [dataParsers, ENTITY_KINDS, EVENT_KINDS, TENANT_KINDS, ROLES, PHASES]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { dataParsers.motion = () => ({}); });
  assert.throws(() => ENTITY_KINDS.push('toString'));
});
test('scope and generation options cannot override protected metadata', () => {
  const scope = { tenantId: f.tenantId, entityId: uuid(888), eventId: null };
  assert.throws(() => initialSnapshot('motion', { ...scope, kind: 'series' }, { text: 'test' }));
  assert.throws(() => initialSnapshot('motion', scope, { text: 'test' }, { revision: 999 }));
  assert.throws(() => initialSnapshot('motion', scope, { text: 'test' }, { snapshotId: undefined }));
  assert.throws(() => nextSnapshot(f.motion, { text: 'test' }, { tenantId: uuid(2) }));
});
test('snapshot envelopes reject accessors before reading payload fields', () => {
  let calls = 0;
  const input = { canonical: f.motion.canonical, contentHash: f.motion.contentHash };
  Object.defineProperty(input, 'record', { enumerable: true, get() { calls += 1; return f.motion.record; } });
  assert.throws(() => verifySnapshot(input));
  assert.equal(calls, 0);
});
