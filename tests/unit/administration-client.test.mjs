import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical-json.js';
import { administrationCommand, readAdministrationPage, readAdministrationRecord } from '../../dist/packages/ui/src/administration-client.js';
const tenant = randomUUID();
const snapshot = { schemaVersion: 1, kind: 'series', tenantId: tenant, entityId: randomUUID(), snapshotId: randomUUID(), revision: 1, recordedAt: '2026-10-18T10:00:00.000Z', data: { name: 'Synthetic series' } };
const envelope = record => ({ snapshot: record, contentHash: createHash('sha256').update(canonicalJson(record)).digest('hex') });
test('browser accepts only hash-verified records in the exact tenant and entity kind', async () => {
  const row = envelope(snapshot); assert.deepEqual(await readAdministrationRecord(row, tenant, 'series'), row);
  for (const candidate of [{ ...row, contentHash: '0'.repeat(64) }, envelope({ ...snapshot, tenantId: randomUUID() }), envelope({ ...snapshot, kind: 'motion' }), envelope({ ...snapshot, revision: 0 })]) await assert.rejects(readAdministrationRecord(candidate, tenant, 'series'));
});
test('bounded pages reject malformed cursors and oversized records', async () => {
  const page = { records: [envelope(snapshot)], nextCursor: null, nextRevision: null };
  assert.equal((await readAdministrationPage(page, tenant, 'series')).records.length, 1);
  for (const candidate of [{ ...page, records: Array(51).fill(envelope(snapshot)) }, { ...page, nextCursor: 'bad' }, { ...page, nextRevision: 0 }, { records: [] }]) await assert.rejects(readAdministrationPage(candidate, tenant, 'series'));
});
test('ambiguous retries retain command identity only for an unchanged path and intent', () => {
  const first = administrationCommand(null, '/api/series', { expectedRevision: 0, data: { name: 'Synthetic' } });
  assert.equal(administrationCommand(first, '/api/series', { data: { name: 'Synthetic' }, expectedRevision: 0 }).commandId, first.commandId);
  assert.notEqual(administrationCommand(first, '/api/series', { expectedRevision: 1, data: { name: 'Synthetic' } }).commandId, first.commandId);
  assert.notEqual(administrationCommand(first, '/api/another', { expectedRevision: 0, data: { name: 'Synthetic' } }).commandId, first.commandId);
});
