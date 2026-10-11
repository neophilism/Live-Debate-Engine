import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { appendIntentHash, commandParser, decodeSnapshot, referencesIn, verifySnapshot, type AppendCommand, type AppendReceipt, type Snapshot } from '../../contracts/src/snapshot.js';
import { identifier } from '../../contracts/src/validation.js';

export class RevisionConflict extends Error {
  readonly code = 'revision_conflict';
  constructor(message = 'Revision or idempotency conflict') { super(message); this.name = 'RevisionConflict'; }
}

/** Internal persistence primitive. Caller authorization is required separately in E04. */
export async function appendSnapshot(pool: Pool, input: Snapshot, rawCommand: AppendCommand): Promise<AppendReceipt> {
  const snapshot = verifySnapshot(input);
  const command = commandParser(rawCommand);
  const record = snapshot.record;
  if (command.expectedRevision !== record.revision - 1) throw new RevisionConflict();
  const intent = appendIntentHash(snapshot);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`lde:command:${record.tenantId}:${command.idempotencyKey}`]);
    const priorReceipt = await client.query<{ principal_id: string; intent_hash: string; snapshot_id: string; revision: number }>(
      'SELECT principal_id, intent_hash, snapshot_id, revision FROM lde.command_receipts WHERE tenant_id=$1 AND idempotency_key=$2', [record.tenantId, command.idempotencyKey]);
    const receipt = priorReceipt.rows[0];
    if (receipt) {
      if (receipt.principal_id !== command.principalId || receipt.intent_hash !== intent) throw new RevisionConflict('Idempotency key reused with different actor or intent');
      await client.query('COMMIT');
      return Object.freeze({ snapshotId: receipt.snapshot_id, revision: receipt.revision, replayed: true });
    }
    if (record.revision === 1) {
      await client.query('INSERT INTO lde.subjects (tenant_id,entity_id,kind,event_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,entity_id) DO NOTHING', [record.tenantId, record.entityId, record.kind, record.eventId]);
    }
    const subject = await client.query<{ kind: string; event_id: string | null }>('SELECT kind,event_id FROM lde.subjects WHERE tenant_id=$1 AND entity_id=$2 FOR UPDATE', [record.tenantId, record.entityId]);
    if (!subject.rows[0] || subject.rows[0].kind !== record.kind || subject.rows[0].event_id !== record.eventId) throw new RevisionConflict('Subject kind or scope mismatch');
    const head = await client.query<{ revision: number; snapshot_id: string }>('SELECT revision,snapshot_id FROM lde.revisions WHERE tenant_id=$1 AND entity_id=$2 ORDER BY revision DESC LIMIT 1', [record.tenantId, record.entityId]);
    const previous = head.rows[0];
    if ((previous?.revision ?? 0) !== command.expectedRevision || (previous?.snapshot_id ?? null) !== record.previousSnapshotId) throw new RevisionConflict('Stale expected revision');
    await client.query('INSERT INTO lde.revisions (tenant_id,entity_id,kind,event_id,snapshot_id,revision,previous_snapshot_id,recorded_at,canonical_record,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [record.tenantId, record.entityId, record.kind, record.eventId, record.snapshotId, record.revision, record.previousSnapshotId, record.recordedAt, snapshot.canonical, snapshot.contentHash]);
    for (const ref of referencesIn(record.data)) {
      await client.query('INSERT INTO lde.revision_references (tenant_id,source_snapshot_id,target_snapshot_id,target_entity_id,target_kind,target_revision,target_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [record.tenantId, record.snapshotId, ref.snapshotId, ref.entityId, ref.kind, ref.revision, ref.eventId]);
    }
    await client.query('INSERT INTO lde.command_receipts (tenant_id,idempotency_key,principal_id,intent_hash,expected_revision,snapshot_id,revision) VALUES ($1,$2,$3,$4,$5,$6,$7)', [record.tenantId, command.idempotencyKey, command.principalId, intent, command.expectedRevision, record.snapshotId, record.revision]);
    await client.query('INSERT INTO lde.domain_events (tenant_id,message_id,message_type,snapshot_id) VALUES ($1,$2,$3,$4)', [record.tenantId, randomUUID(), 'snapshot-appended', record.snapshotId]);
    await client.query('COMMIT');
    return Object.freeze({ snapshotId: record.snapshotId, revision: record.revision, replayed: false });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

/** Returns a validated snapshot in an explicit tenant scope, not an authorized API response. */
export async function readSnapshot(pool: Pool, tenantId: string, snapshotId: string): Promise<Snapshot | null> {
  const tenant = identifier('tenant')(tenantId); const id = identifier('snapshot')(snapshotId);
  const result = await pool.query<{ canonical_record: string; content_hash: string }>('SELECT canonical_record,content_hash FROM lde.revisions WHERE tenant_id=$1 AND snapshot_id=$2', [tenant, id]);
  const row = result.rows[0];
  if (!row) return null;
  const snapshot = decodeSnapshot(row.canonical_record, row.content_hash);
  if (snapshot.record.tenantId !== tenant || snapshot.record.snapshotId !== id) throw new RevisionConflict('Stored scope mismatch');
  return snapshot;
}
