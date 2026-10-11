import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import pg from 'pg';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { applyMigrations, loadMigrations } from '../../dist/packages/database/src/migrations.js';
import { createIdentityRuntime } from '../../dist/packages/identity/src/http.js';
import { createUiRuntime } from '../../dist/packages/ui/server/http.js';
import { createObjectHttp } from '../../dist/packages/security/src/http.js';
import { ProtectedObjectStore } from '../../dist/packages/security/src/store.js';
import { generateKeyDocument, FileKeyProvider } from '../../dist/packages/security/src/keys.js';
import { createApi } from '../../dist/apps/api/src/server.js';

/** Destructive setup is allowed ONLY for the disposable loopback test database. */
export async function uiFixture(t) {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection || process.env.NODE_ENV !== 'test') throw new Error('Disposable local test database required');
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/lde_ci') throw new Error('Refusing non-local browser test database');
  const admin = new pg.Pool(databaseConfig(connection, { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }));
  await admin.query('DROP SCHEMA IF EXISTS lde_storage CASCADE; DROP SCHEMA IF EXISTS lde_security CASCADE; DROP SCHEMA IF EXISTS lde_auth CASCADE; DROP SCHEMA IF EXISTS lde CASCADE; DROP SCHEMA IF EXISTS engine_meta CASCADE');
  await applyMigrations(admin, await loadMigrations());
  const roles = ['lde_ui_identity_test', 'lde_ui_runtime_test']; const pools = [];
  for (const [index, name] of roles.entries()) {
    await admin.query(`CREATE ROLE ${name} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT ${index === 0 ? 'lde_identity' : 'lde_runtime'} TO ${name}`);
    const target = new URL(connection); target.username = name;
    if (target.password) { const sql = (await admin.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) AS sql', [name, decodeURIComponent(target.password)])).rows[0].sql; await admin.query(sql); }
    pools.push(new pg.Pool(databaseConfig(target.toString(), { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' })));
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'lde-ui-'));
  const keyFile = path.join(directory, 'keys.json'); await writeFile(keyFile, JSON.stringify(generateKeyDocument()), { mode: 0o600 });
  const keys = new FileKeyProvider(keyFile); const store = new ProtectedObjectStore(pools[1], keys);
  const servers = []; const runtimes = []; const mails = [];
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    for (const runtime of runtimes) await runtime.drain();
    for (const pool of pools) await pool.end();
    for (const role of roles) await admin.query(`DROP ROLE ${role}`);
    await admin.end(); await rm(directory, { recursive: true, force: true });
  });
  async function start(brandId = 'engine') {
    let identity; let ui; let objects;
    const server = createApi({ readiness: async () => ({ ready: true, reason: 'schema_compatible' }), identity: { handle: (...args) => identity.handle(...args) }, objects: { handle: (...args) => objects.handle(...args) }, ui: { handle: (...args) => ui.handle(...args) } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    const origin = `http://127.0.0.1:${server.address().port}`;
    identity = await createIdentityRuntime({ pool: pools[0], runtimePool: pools[1], config: { origin, secret: randomBytes(48).toString('base64url'), environment: 'test' }, sendMail: async (mail) => { mails.push(mail); } }); runtimes.push(identity);
    objects = createObjectHttp(store, identity, origin, () => {});
    ui = await createUiRuntime({ assetDirectory: path.resolve('dist/ui'), brandId, identity, pool: pools[1], storageEnabled: true });
    return { origin, identity };
  }
  return { admin, store, mails, start, runtimePool: pools[1] };
}
