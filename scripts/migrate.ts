import pg from 'pg';
import { databaseConfig } from '../packages/database/src/config.js';
import { applyMigrations, loadMigrations } from '../packages/database/src/migrations.js';

let pool: pg.Pool | undefined;
try {
  const connection = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connection) throw new Error('Database URL required');
  pool = new pg.Pool(databaseConfig(connection, process.env));
  pool.on('error', () => console.error(JSON.stringify({ event: 'migration_connection_error' })));
  const applied = await applyMigrations(pool, await loadMigrations());
  console.log(JSON.stringify({ event: 'migrations_applied', count: applied }));
} catch {
  console.error(JSON.stringify({ event: 'migration_failed', hint: 'Check approved target, credentials, manifest and database availability; no automatic destructive rollback' }));
  process.exitCode = 1;
} finally { await pool?.end(); }
