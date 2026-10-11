import pg from 'pg';
import { databaseConfig } from '../../../packages/database/src/config.js';
import { loadMigrations, schemaCompatible } from '../../../packages/database/src/migrations.js';
import { createApi } from './server.js';

const env = process.env;
try {
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) throw new Error('Invalid environment');
  const portText = env.PORT ?? '3000';
  if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('Invalid port');
  const host = env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) throw new Error('Invalid bind address');
  const migrations = await loadMigrations();
  const pool = env.DATABASE_URL ? new pg.Pool(databaseConfig(env.DATABASE_URL, env)) : null;
  pool?.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  const api = createApi({
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
    api.close(() => { void (pool?.end() ?? Promise.resolve()).finally(() => clearTimeout(deadline)); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  api.on('error', () => { console.error(JSON.stringify({ event: 'server_error' })); process.exitCode = 1; stop(); });
  api.listen(Number(portText), host, () => console.log(JSON.stringify({ event: 'listening', port: Number(portText), stage: 'foundation' })));
} catch {
  // Configuration and driver errors may contain credentials; never print raw errors.
  console.error(JSON.stringify({ event: 'startup_failed', hint: 'Validate environment configuration and migration manifest' }));
  process.exitCode = 1;
}
