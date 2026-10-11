import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { appendSnapshot, readSnapshot, RevisionConflict } from '../../dist/packages/database/src/snapshots.js';
import { initialSnapshot, nextSnapshot, snapshotOf, referenceOf } from '../../dist/packages/contracts/src/snapshot.js';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';

export async function runDomainCases(t, pool) {
  const f = fixtureSet();
  const principalId = uuid(900);
  const command = (expectedRevision = 0) => ({ idempotencyKey: randomUUID(), principalId, expectedRevision });
  await pool.query('INSERT INTO lde.tenants (id) VALUES ($1)', [f.tenantId]);

  await t.test('all domain families persist with typed references and matching Node/PostgreSQL hashes', async () => {
    for (const snapshot of f.created) {
      const receipt = await appendSnapshot(pool, snapshot, command());
      assert.equal(receipt.replayed, false);
      assert.deepEqual(await readSnapshot(pool, f.tenantId, receipt.snapshotId), snapshot);
    }
    const messages = await pool.query('SELECT count(*)::int AS count FROM lde.domain_events WHERE tenant_id=$1', [f.tenantId]);
    assert.equal(messages.rows[0].count, f.created.length);
  });
  await t.test('same-command concurrent retries create one revision and one outbox event', async () => {
    const snapshot = initialSnapshot('motion', { tenantId: f.tenantId, entityId: randomUUID(), eventId: null }, { text: 'Concurrent synthetic record' });
    const cmd = command();
    const results = await Promise.all([appendSnapshot(pool, snapshot, cmd), appendSnapshot(pool, snapshot, cmd)]);
    assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
    assert.equal(results[0].snapshotId, results[1].snapshotId);
    const rows = await pool.query('SELECT count(*)::int AS count FROM lde.domain_events WHERE tenant_id=$1 AND snapshot_id=$2', [f.tenantId, snapshot.record.snapshotId]);
    assert.equal(rows.rows[0].count, 1);
    const regenerated = snapshotOf({ ...snapshot.record, snapshotId: randomUUID(), recordedAt: '2026-10-11T09:10:00.000Z' });
    assert.equal((await appendSnapshot(pool, regenerated, cmd)).snapshotId, snapshot.record.snapshotId);
    await assert.rejects(appendSnapshot(pool, snapshot, { ...cmd, principalId: uuid(901) }), RevisionConflict);
    const changed = initialSnapshot('motion', { tenantId: f.tenantId, entityId: snapshot.record.entityId, eventId: null }, { text: 'Changed intent' });
    await assert.rejects(appendSnapshot(pool, changed, cmd), RevisionConflict);
  });
  await t.test('concurrent different commands cannot overwrite the same expected revision', async () => {
    const a = nextSnapshot(f.motion, { text: 'Revision candidate A' });
    const b = nextSnapshot(f.motion, { text: 'Revision candidate B' });
    const results = await Promise.allSettled([appendSnapshot(pool, a, command(1)), appendSnapshot(pool, b, command(1))]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal((await readSnapshot(pool, f.tenantId, f.motion.record.snapshotId)).record.data.text, f.motion.record.data.text);
    const rows = await pool.query('SELECT count(*)::int AS count FROM lde.revisions WHERE tenant_id=$1 AND entity_id=$2', [f.tenantId, f.motion.record.entityId]);
    assert.equal(rows.rows[0].count, 2);
  });
  await t.test('missing references roll back subject, revision, receipt and outbox together', async () => {
    const badRef = { ...referenceOf(f.participant), snapshotId: randomUUID() };
    const team = initialSnapshot('team', { tenantId: f.tenantId, entityId: randomUUID(), eventId: null }, { name: 'Uncommitted test team', members: [badRef] });
    const cmd = command();
    await assert.rejects(appendSnapshot(pool, team, cmd), (error) => error.code === '23503');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM lde.subjects WHERE tenant_id=$1 AND entity_id=$2', [f.tenantId, team.record.entityId])).rows[0].count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM lde.command_receipts WHERE tenant_id=$1 AND idempotency_key=$2', [f.tenantId, cmd.idempotencyKey])).rows[0].count, 0);
    assert.equal(await readSnapshot(pool, f.tenantId, team.record.snapshotId), null);
  });
  await t.test('explicit tenant reads and SQL reference keys prevent cross-tenant lookup', async () => {
    const otherTenant = uuid(2);
    await pool.query('INSERT INTO lde.tenants (id) VALUES ($1)', [otherTenant]);
    const other = initialSnapshot('motion', { tenantId: otherTenant, entityId: randomUUID(), eventId: null }, { text: 'Other synthetic tenant' });
    await appendSnapshot(pool, other, command());
    assert.equal(await readSnapshot(pool, f.tenantId, other.record.snapshotId), null);
    await assert.rejects(pool.query('INSERT INTO lde.revision_references (tenant_id,source_snapshot_id,target_snapshot_id,target_entity_id,target_kind,target_revision,target_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [f.tenantId, f.motion.record.snapshotId, other.record.snapshotId, other.record.entityId, 'motion', 1, null]), (error) => error.code === '23503');
  });
  await t.test('subject kind cannot be changed to conflate independent outcome records', async () => {
    const item = initialSnapshot('judges-verdict', { tenantId: f.tenantId, entityId: f.audience.record.entityId, eventId: f.eventId }, f.judges.record.data);
    await assert.rejects(appendSnapshot(pool, item, command()), RevisionConflict);
  });
  await t.test('ordinary update/delete/truncate cannot erase historical records', async () => {
    await assert.rejects(pool.query('UPDATE lde.revisions SET content_hash=$1 WHERE tenant_id=$2 AND snapshot_id=$3', ['0'.repeat(64), f.tenantId, f.motion.record.snapshotId]), (error) => error.code === '55000');
    await assert.rejects(pool.query('DELETE FROM lde.revisions WHERE tenant_id=$1 AND snapshot_id=$2', [f.tenantId, f.motion.record.snapshotId]), (error) => error.code === '55000');
    await assert.rejects(pool.query('TRUNCATE lde.domain_events'), (error) => error.code === '55000');
  });
  await t.test('SQL enforces money representation and verdict discriminators even for direct writes', async () => {
    const amount = await pool.query('SELECT lde.valid_money($1::jsonb) AS valid, lde.valid_money($2::jsonb) AS invalid', [JSON.stringify({ currency: 'USD', minorUnits: '9007199254740993', exponent: 2 }), JSON.stringify({ currency: 'USD', minorUnits: 1.25, exponent: 2 })]);
    assert.equal(amount.rows[0].valid, true); assert.equal(amount.rows[0].invalid, false);
    for (const [base, data] of [[f.audience, f.judges.record.data], [f.prize, { ...f.prize.record.data, amount: { currency: 'USD', minorUnits: 125, exponent: 2 } }]]) {
      const record = { ...base.record, entityId: randomUUID(), snapshotId: randomUUID(), data };
      const encoded = canonicalJson(record);
      await pool.query('INSERT INTO lde.subjects (tenant_id,entity_id,kind,event_id) VALUES ($1,$2,$3,$4)', [record.tenantId, record.entityId, record.kind, record.eventId]);
      await assert.rejects(pool.query('INSERT INTO lde.revisions (tenant_id,entity_id,kind,event_id,snapshot_id,revision,previous_snapshot_id,recorded_at,canonical_record,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [record.tenantId, record.entityId, record.kind, record.eventId, record.snapshotId, 1, null, record.recordedAt, encoded, createHash('sha256').update(encoded).digest('hex')]), (error) => error.code === '23514');
    }
  });
  await t.test('record contents are bound parameters, not executable SQL', async () => {
    const text = "'); DROP TABLE lde.tenants CASCADE; -- synthetic test text";
    const snapshot = initialSnapshot('motion', { tenantId: f.tenantId, entityId: randomUUID(), eventId: null }, { text });
    await appendSnapshot(pool, snapshot, command());
    assert.equal((await readSnapshot(pool, f.tenantId, snapshot.record.snapshotId)).record.data.text, text);
    assert.ok((await pool.query('SELECT count(*)::int AS count FROM lde.tenants')).rows[0].count > 0);
  });
  await t.test('non-owner role has default-deny row security before E04 policies exist', async () => {
    // The parent suite already enforces a disposable loopback-only lde_ci database.
    await pool.query('CREATE ROLE lde_e03_test_reader NOLOGIN NOBYPASSRLS');
    try {
      await pool.query('GRANT USAGE ON SCHEMA lde TO lde_e03_test_reader');
      await pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA lde TO lde_e03_test_reader');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE lde_e03_test_reader');
        assert.equal((await client.query('SELECT count(*)::int AS count FROM lde.revisions')).rows[0].count, 0);
        assert.equal((await client.query('SELECT count(*)::int AS count FROM lde.command_receipts')).rows[0].count, 0);
        await client.query('ROLLBACK');
      } finally { await client.query('ROLLBACK'); client.release(); }
    } finally {
      await pool.query('DROP OWNED BY lde_e03_test_reader');
      await pool.query('DROP ROLE lde_e03_test_reader');
    }
  });
}
