import type { PoolConfig } from 'pg';

export type DatabaseEnvironment = Readonly<{
  NODE_ENV?: string;
  LDE_ALLOW_INSECURE_LOCAL_DB?: string;
}>;

/** Never let URI sslmode options override explicit certificate verification. */
export function databaseConfig(connectionString: string, env: DatabaseEnvironment = {}): PoolConfig {
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid database URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/' || !url.pathname) {
    throw new Error('Invalid database URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const insecure = env.LDE_ALLOW_INSECURE_LOCAL_DB === '1';
  if (insecure && (!local || env.NODE_ENV === 'production')) throw new Error('Plaintext database connections are restricted to local development');
  const mode = url.searchParams.get('sslmode');
  if (mode && !['require', 'verify-full'].includes(mode) && !(mode === 'disable' && insecure)) throw new Error('Unsupported database TLS mode');
  // Connection parameters cannot introduce additional host, certificate or filesystem settings.
  for (const key of [...url.searchParams.keys()]) {
    if (!['sslmode', 'channel_binding'].includes(key)) throw new Error('Unsupported database URL option');
    url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    ssl: insecure ? false : { rejectUnauthorized: true },
    enableChannelBinding: true,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 12000,
    application_name: 'live-debate-engine',
  };
}
