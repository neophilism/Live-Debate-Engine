import type { PoolConfig } from 'pg';

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;
// pg 8.16 supports this documented option; @types/pg 8.15.5 omits it.
export type VerifiedPoolConfig = PoolConfig & { enableChannelBinding: true };

/** Never let URI sslmode options override explicit certificate verification. */
export function databaseConfig(connectionString: string, env: DatabaseEnvironment = {}): VerifiedPoolConfig {
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) throw new Error('Invalid environment');
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid database URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/' || !url.pathname) {
    throw new Error('Invalid database URL');
  }
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Unsupported duplicate database URL option');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const insecure = env.LDE_ALLOW_INSECURE_LOCAL_DB === '1';
  if (insecure && (!local || env.NODE_ENV === 'production')) throw new Error('Plaintext database connections are restricted to local development');
  const mode = url.searchParams.get('sslmode');
  if (mode && !['require', 'verify-full'].includes(mode) && !(mode === 'disable' && insecure)) throw new Error('Unsupported database TLS mode');
  // The driver can prefer channel binding, not enforce require. Do not silently downgrade.
  const binding = url.searchParams.get('channel_binding');
  if (binding && binding !== 'prefer') throw new Error('Unsupported mandatory or disabled channel-binding policy');
  for (const key of keys) {
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
