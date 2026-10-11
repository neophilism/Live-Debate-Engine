import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMigrations, migration, validateMigrationOrder, verifyApplied } from '../../dist/packages/database/src/migrations.js';

const first = migration('0001_one.sql', 'SELECT 1;');
test('manifest loads ordered checksummed SQL', async () => {
  const entries = await loadMigrations();
  assert.ok(entries.length >= 1);
  assert.ok(Object.isFrozen(entries));
  assert.match(entries[0].checksum, /^[a-f0-9]{64}$/);
});
test('SQL edits change checksums', () => assert.notEqual(first.checksum, migration(first.name, 'SELECT 2;').checksum));
test('path traversal and empty SQL are rejected', () => {
  assert.throws(() => migration('../0001_bad.sql', 'SELECT 1;'));
  assert.throws(() => migration('0001_bad.sql', ' '));
});
test('SQL cannot escape transaction wrapper', () => assert.throws(() => migration('0001_bad.sql', 'COMMIT;\nSELECT 1;'), /transaction/));
test('missing, duplicate and out-of-order versions are rejected', () => {
  assert.throws(() => validateMigrationOrder([]));
  assert.throws(() => validateMigrationOrder([first, first]));
  assert.throws(() => validateMigrationOrder([migration('0002_two.sql', 'SELECT 2;')]));
});
test('tampered checksum and database history are rejected', () => {
  assert.throws(() => validateMigrationOrder([{ ...first, checksum: '0'.repeat(64) }]));
  assert.throws(() => verifyApplied([first], [{ name: first.name, checksum: '0'.repeat(64) }]));
  assert.throws(() => verifyApplied([first], [first, migration('0002_two.sql', 'SELECT 2;')]));
  assert.doesNotThrow(() => verifyApplied([first], []));
  assert.doesNotThrow(() => verifyApplied([first], [first]));
});
