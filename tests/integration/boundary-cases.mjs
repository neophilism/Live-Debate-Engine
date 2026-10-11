import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical.js';
import { decodeSnapshot } from '../../dist/packages/contracts/src/snapshot.js';
import { uuid } from '../helpers/domain-fixtures.mjs';

export async function runBoundaryCases(t, pool) {
  const tenant = uuid(1);
  const rows = await pool.query("SELECT canonical_record,content_hash FROM lde.revisions WHERE tenant_id=$1 AND kind='motion' AND revision=1 ORDER BY snapshot_id LIMIT 1", [tenant]);
  const base = decodeSnapshot(rows.rows[0].canonical_record, rows.rows[0].content_hash).record;
  const source = (await pool.query("SELECT snapshot_id FROM lde.revisions WHERE tenant_id=$1 AND kind='series' LIMIT 1", [tenant])).rows[0].snapshot_id;
  await t.test('SQL rejects missing nullable header fields and ambiguous event scopes', async () => {
    for (const mode of ['missing-header', 'ambiguous-scope', 'bad-hash']) {
      const record = { ...base, entityId: randomUUID(), snapshotId: randomUUID() };
      if (mode === 'missing-header') delete record.previousSnapshotId;
      if (mode === 'ambiguous-scope') record.eventId = tenant;
      const canonical = canonicalJson(record);
      const hash = mode === 'bad-hash' ? '0'.repeat(64) : createHash('sha256').update(canonical).digest('hex');
      await pool.query('INSERT INTO lde.subjects (tenant_id,entity_id,kind,event_id) VALUES ($1,$2,$3,$4)', [tenant, record.entityId, 'motion', null]);
      await assert.rejects(pool.query('INSERT INTO lde.revisions (tenant_id,entity_id,kind,event_id,snapshot_id,revision,previous_snapshot_id,recorded_at,canonical_record,content_hash) VALUES ($1,$2,$3,$4,$5,1,NULL,$6,$7,$8)', [tenant, record.entityId, 'motion', record.eventId, record.snapshotId, record.recordedAt, canonical, hash]), (error) => error.code === '23514');
    }
  });
  await t.test('SQL rejects ambiguous NULL reference scope', async () => {
    await assert.rejects(pool.query('INSERT INTO lde.revision_references (tenant_id,source_snapshot_id,target_snapshot_id,target_entity_id,target_kind,target_revision,target_event_id) VALUES ($1,$2,$3,$4,$5,1,$6)', [tenant, source, base.snapshotId, base.entityId, 'motion', tenant]), (error) => error.code === '23514');
  });
  await t.test('idempotency receipt must name the actual persisted revision', async () => {
    await assert.rejects(pool.query('INSERT INTO lde.command_receipts (tenant_id,idempotency_key,principal_id,intent_hash,expected_revision,snapshot_id,revision) VALUES ($1,$2,$3,$4,1,$5,2)', [tenant, randomUUID(), uuid(900), '0'.repeat(64), base.snapshotId]), (error) => error.code === '23503');
  });
}
