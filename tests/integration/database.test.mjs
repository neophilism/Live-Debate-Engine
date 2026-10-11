import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { applyMigrations, loadMigrations, migration, schemaCompatible } from '../../dist/packages/database/src/migrations.js';

// This suite intentionally fails rather than silently skips when its disposable DB is absent.
const connection = process.env.TEST_DATABASE_URL;
if (!connection || process.env.NODE_ENV !== 'test') throw new Error('A disposable local lde_ci database and NODE_ENV=test are required');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/lde_ci') throw new Error('Refusing destructive integration setup outside local lde_ci');

test('real PostgreSQL migrations, atomicity, history and concurrency', async (t) => {
  const pool = new pg.Pool(databaseConfig(connection, { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }));
  t.after(() => pool.end());
  await pool.query('DROP SCHEMA IF EXISTS engine_meta CASCADE; DROP SCHEMA IF EXISTS lde CASCADE');
  const entries = await loadMigrations();
  await t.test('fresh migration applies and schema is compatible', async () => {
    assert.equal(await applyMigrations(pool, entries), entries.length);
    assert.equal(await schemaCompatible(pool, entries), true);
  });
  await t.test('rerun and simultaneous migration calls are idempotent', async () => {
    assert.deepEqual(await Promise.all([applyMigrations(pool, entries), applyMigrations(pool, entries)]), [0, 0]);
  });
  await t.test('changed applied migration is refused', async () => {
    const changed = [migration(entries[0].name, `${entries[0].sql}\n-- changed`), ...entries.slice(1)];
    await assert.rejects(applyMigrations(pool, changed), /differs/);
  });
  await t.test('failed SQL rolls back both DDL and migration history', async () => {
    const name = `${String(entries.length + 1).padStart(4, '0')}_failure.sql`;
    const invalid = migration(name, 'CREATE TABLE lde.rollback_probe (id int); SELECT * FROM lde.table_that_does_not_exist;');
    await assert.rejects(applyMigrations(pool, [...entries, invalid]));
    const table = await pool.query("SELECT to_regclass('lde.rollback_probe') AS name");
    assert.equal(table.rows[0].name, null);
    assert.equal(await schemaCompatible(pool, entries), true);
  });
  await t.test('pending manifest is not considered ready', async () => {
    const next = migration(`${String(entries.length + 1).padStart(4, '0')}_next.sql`, 'SELECT 1;');
    assert.equal(await schemaCompatible(pool, [...entries, next]), false);
  });
});
