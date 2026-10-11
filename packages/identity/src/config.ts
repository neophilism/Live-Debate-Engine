export type IdentityEnvironment = 'development' | 'test' | 'production';
export type IdentityConfig = Readonly<{ origin: string; secret: string; environment: IdentityEnvironment }>;

export function identityConfig(origin: string, secret: string, environment: IdentityEnvironment): IdentityConfig {
  if (!['development', 'test', 'production'].includes(environment)) throw new Error('Invalid identity environment');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error('Invalid identity origin'); }
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.protocol !== 'https:' && !(environment !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) {
    throw new Error('Identity requires one canonical HTTPS origin (loopback HTTP is local only)');
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret) || new Set(secret).size < 16) throw new Error('A high-entropy identity secret is required');
  return Object.freeze({ origin, secret, environment });
}
