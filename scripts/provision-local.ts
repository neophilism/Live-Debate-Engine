import pg from 'pg';
import { databaseConfig } from '../packages/database/src/config.js';
import { assertDatabaseRole } from '../packages/identity/src/broker.js';

let admin: pg.Pool | undefined;
try {
  if (process.env.NODE_ENV !== 'development' || process.env.LDE_ALLOW_INSECURE_LOCAL_DB !== '1') throw new Error('Local development only');
  const connection = new URL(process.env.DATABASE_URL_UNPOOLED ?? '');
  if (connection.hostname !== '127.0.0.1' || connection.port !== '55432' || connection.pathname !== '/lde_dev' || connection.username !== 'lde_dev') throw new Error('Refusing nonlocal bootstrap');
  const env = process.env;
  const credentials = [
    [new URL(env.DATABASE_URL ?? ''), 'lde_app_local', 'lde_runtime'],
    [new URL(env.LDE_IDENTITY_DATABASE_URL ?? ''), 'lde_auth_local', 'lde_identity'],
  ] as const;
  admin = new pg.Pool(databaseConfig(connection.href, env));
  admin.on('error', () => console.error('Local database connection error'));
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    for (const [url, username, base] of credentials) {
      if (url.host !== connection.host || url.pathname !== connection.pathname || url.username !== username || !/^[a-f0-9]{48}$/.test(url.password)) throw new Error('Invalid local credential');
      const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [username]);
      if (existing.rowCount === 0) {
        const sql = await client.query<{ sql: string }>("SELECT format('CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',$1::text,$2::text) AS sql", [username, decodeURIComponent(url.password)]);
        await client.query(sql.rows[0]?.sql ?? '');
      }
      const grant = await client.query<{ sql: string }>("SELECT format('GRANT %I TO %I',$1::text,$2::text) AS sql", [base, username]);
      await client.query(grant.rows[0]?.sql ?? '');
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  for (const [url, , base] of credentials) {
    const check = new pg.Pool(databaseConfig(url.href, env));
    try { await assertDatabaseRole(check, base === 'lde_runtime' ? 'runtime' : 'identity'); } finally { await check.end(); }
  }
  console.log('Local non-owner identity/runtime roles verified. Production unchanged.');
} catch { console.error('Local provisioning failed. Check target, migrations and private configuration; no credentials printed.'); process.exitCode = 1; }
finally { await admin?.end(); }
