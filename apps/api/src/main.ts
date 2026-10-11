import { resolve } from 'node:path';
import { createUiRuntime } from '../../../packages/ui/server/http.js';
import { FileKeyProvider } from '../../../packages/security/src/keys.js';
import { ProtectedObjectStore } from '../../../packages/security/src/store.js';
import { createObjectHttp } from '../../../packages/security/src/http.js';
import pg from 'pg';
import { databaseConfig } from '../../../packages/database/src/config.js';
import { loadMigrations, schemaCompatible } from '../../../packages/database/src/migrations.js';
import { createApi } from './server.js';
import { identityConfig } from '../../../packages/identity/src/config.js';
import { identityMailer } from '../../../packages/identity/src/mail.js';
import { createIdentityRuntime, type IdentityRuntime } from '../../../packages/identity/src/http.js';

const env = process.env;
const pools: pg.Pool[] = [];
try {
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) throw new Error('Invalid environment');
  const portText = env.PORT ?? '3000';
  if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('Invalid port');
  const host = env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) throw new Error('Invalid bind address');
  const migrations = await loadMigrations();
  const pool = env.DATABASE_URL ? new pg.Pool(databaseConfig(env.DATABASE_URL, env)) : null;
  if (pool) { pools.push(pool); pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' }))); }
  let identity: IdentityRuntime | undefined;
  if (env.LDE_IDENTITY_ENABLED && !['0', '1'].includes(env.LDE_IDENTITY_ENABLED)) throw new Error('Invalid identity flag');
  if (env.LDE_IDENTITY_ENABLED === '1') {
    if (!pool || !env.LDE_IDENTITY_DATABASE_URL) throw new Error('Separate identity and runtime databases required');
    // The serving process must never receive the release/operator credential.
    if (env.DATABASE_URL_UNPOOLED) throw new Error('Remove migration credentials from the runtime environment');
    const config = identityConfig(env.LDE_IDENTITY_ORIGIN ?? '', env.LDE_IDENTITY_SECRET ?? '', env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development');
    const providerPool = new pg.Pool(databaseConfig(env.LDE_IDENTITY_DATABASE_URL, env)); pools.push(providerPool);
    providerPool.on('error', () => console.error(JSON.stringify({ event: 'identity_pool_error' })));
    identity = await createIdentityRuntime({ pool: providerPool, runtimePool: pool, config, sendMail: identityMailer(config, env) });
  }
  if (env.LDE_STORAGE_KEY_FILE && (!identity || !pool)) throw new Error('Identity required for protected storage');
  const keys = env.LDE_STORAGE_KEY_FILE ? new FileKeyProvider(env.LDE_STORAGE_KEY_FILE) : null;
  if (keys) await keys.active('asset-ticket');
  const objects = keys && pool && identity ? createObjectHttp(new ProtectedObjectStore(pool, keys), identity, env.LDE_IDENTITY_ORIGIN ?? '') : null;
  if (env.LDE_UI_ENABLED && !['0', '1'].includes(env.LDE_UI_ENABLED)) throw new Error('Invalid UI flag');
  if (env.LDE_UI_ENABLED === '1' && (!identity || !pool)) throw new Error('Identity required for interface');
  const ui = env.LDE_UI_ENABLED === '1' && identity && pool ? await createUiRuntime({ assetDirectory: resolve('dist/ui'), brandId: env.LDE_UI_BRAND ?? 'engine', identity, pool, storageEnabled: !!objects }) : null;
  const api = createApi({
    ...(ui ? { ui } : {}),
    ...(objects ? { objects } : {}),
    ...(identity ? { identity } : {}),
    ...(env.RENDER_GIT_COMMIT ? { release: env.RENDER_GIT_COMMIT } : {}),
    readiness: async () => {
      if (!pool) return { ready: false, reason: 'database_unconfigured' };
      try {
        const ready = await schemaCompatible(pool, migrations);
        return { ready, reason: ready ? 'schema_compatible' : 'schema_mismatch' };
      } catch { return { ready: false, reason: 'database_unavailable' }; }
    },
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    api.close(() => { void (identity?.drain() ?? Promise.resolve()).finally(() => Promise.all(pools.map((item) => item.end()))).finally(() => clearTimeout(deadline)); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  api.on('error', () => { console.error(JSON.stringify({ event: 'server_error' })); process.exitCode = 1; stop(); });
  api.listen(Number(portText), host, () => console.log(JSON.stringify({ event: 'listening', port: Number(portText), stage: 'foundation' })));
} catch {
  // Configuration and driver errors may contain credentials; never print raw errors.
  console.error(JSON.stringify({ event: 'startup_failed', hint: 'Validate environment configuration and migration manifest' }));
  process.exitCode = 1;
  await Promise.all(pools.map((item) => item.end().catch(() => {})));
}
