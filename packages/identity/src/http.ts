import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { ACTIONS } from '../../contracts/src/access.js';
import { identifier } from '../../contracts/src/validation.js';
import { AccessError, assertDatabaseRole, requireAccess, withCredential, type Actor } from './broker.js';
import { createIdentity, type IdentityOptions, type IdentityProvider } from './provider.js';

const authPaths = new Map<string, readonly string[]>([
  ['/sign-up/email', ['POST']], ['/sign-in/email', ['POST']], ['/sign-out', ['POST']],
  ['/send-verification-email', ['POST']], ['/verify-email', ['GET']],
  ['/request-password-reset', ['POST']], ['/reset-password', ['POST']], ['/change-password', ['POST']],
  ['/two-factor/enable', ['POST']], ['/two-factor/verify-totp', ['POST']], ['/two-factor/verify-backup-code', ['POST']],
  ['/two-factor/disable', ['POST']], ['/two-factor/generate-backup-codes', ['POST']],
]);
const MAX_BODY = 16384;
class HttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function transportHeaders(request: IncomingMessage): Headers {
  const result = new Headers();
  for (const name of ['cookie', 'origin', 'content-type', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'user-agent']) {
    const value = request.headers[name];
    if (typeof value === 'string') result.set(name, value);
  }
  const peer = request.socket.remoteAddress;
  result.set('x-lde-peer-address', peer && isIP(peer) ? peer : '127.0.0.1');
  return result;
}
function bodyBytes(request: IncomingMessage): Promise<Buffer> {
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') throw new HttpError(415, 'unsupported_encoding');
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new HttpError(413, 'body_too_large');
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []; let size = 0; let failed = false;
    request.on('data', (part: Buffer) => {
      if (failed) return;
      size += part.length;
      if (size > MAX_BODY) { failed = true; parts.length = 0; reject(new HttpError(413, 'body_too_large')); return; }
      parts.push(part);
    });
    request.once('end', () => { if (!failed) resolve(Buffer.concat(parts)); });
    request.once('error', () => reject(new HttpError(400, 'invalid_request')));
    request.once('aborted', () => reject(new HttpError(400, 'invalid_request')));
  });
}
function send(response: ServerResponse, status: number, value: unknown, cookies?: readonly string[]): void {
  const data = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'content-length': Buffer.byteLength(data), ...(cookies?.length ? { 'set-cookie': [...cookies] } : {}),
  });
  response.end(data);
}

export type IdentityRuntime = Readonly<{
  provider: IdentityProvider;
  drain: () => Promise<void>;
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
}>;

export async function createIdentityRuntime(options: IdentityOptions & Readonly<{ runtimePool: Pool }>): Promise<IdentityRuntime> {
  await assertDatabaseRole(options.pool, 'identity');
  await assertDatabaseRole(options.runtimePool, 'runtime');
  const tasks = new Set<Promise<void>>();
  const provider = createIdentity({ ...options, backgroundTask: (task) => {
    const tracked = task.then(() => {}, () => { console.error(JSON.stringify({ event: 'identity_background_delivery_failed' })); });
    tasks.add(tracked); void tracked.finally(() => tasks.delete(tracked));
  } });
  async function current(request: IncomingMessage): Promise<{ token: string; actor: Actor }> {
    const session = await provider.api.getSession({ headers: transportHeaders(request), query: { disableCookieCache: true } });
    if (!session) throw new AccessError(401);
    const actor = await withCredential(options.runtimePool, session.session.token, async (_client, value) => value);
    if (actor.kind !== 'human') throw new AccessError(403);
    return { token: session.session.token, actor };
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    let url: URL;
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error('Invalid target');
      url = new URL(request.url, options.config.origin);
    } catch { send(response, 400, { error: 'invalid_request' }); return true; }
    const authPath = url.pathname.startsWith('/api/auth/') ? url.pathname.slice('/api/auth'.length) : null;
    const tenantAccess = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/access$/.exec(url.pathname);
    const revoke = /^\/api\/sessions\/([^/]+)\/revoke$/.exec(url.pathname);
    if (authPath === null && !tenantAccess && !revoke && !['/api/session', '/api/sessions'].includes(url.pathname)) return false;
    try {
      const method = request.method ?? '';
      if (method !== 'GET') {
        if (method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        if (request.headers.origin !== options.config.origin || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'origin_denied');
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'json_required');
      }
      if (authPath !== null) {
        if (!authPaths.has(authPath) || !authPaths.get(authPath)?.includes(method)) throw new HttpError(404, 'not_found');
        const bytes = method === 'POST' ? await bodyBytes(request) : null;
        const authRequest = new Request(`${options.config.origin}${url.pathname}${url.search}`, { method, headers: transportHeaders(request), ...(bytes ? { body: new Uint8Array(bytes) } : {}) });
        const result = await provider.handler(authRequest);
        const location = result.headers.get('location');
        if (location && result.status >= 300 && result.status < 400) {
          const target = new URL(location, options.config.origin);
          if (target.origin !== options.config.origin) throw new HttpError(403, 'redirect_denied');
          response.writeHead(result.status, { location: target.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'set-cookie': result.headers.getSetCookie() });
          response.end(); return true;
        }
        const data: unknown = await result.json().catch(() => ({ error: 'identity_provider_error' }));
        // Browser identity is cookie-based. Do not turn HttpOnly session secrets into JSON credentials.
        if (data && typeof data === 'object' && !Array.isArray(data)) delete (data as Record<string, unknown>).token;
        send(response, result.status, data, result.headers.getSetCookie()); return true;
      }
      if (method === 'POST') {
        const bytes = await bodyBytes(request);
        if (bytes.length > 0 && bytes.toString('utf8').trim() !== '{}') throw new HttpError(400, 'invalid_request');
      }
      const signedIn = await current(request);
      if (url.pathname === '/api/session') {
        if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        send(response, 200, { principalId: signedIn.actor.principalId, sessionId: signedIn.actor.sessionId, assurance: signedIn.actor.mfaVerifiedAt ? 'mfa' : 'single-factor', mfaVerifiedAt: signedIn.actor.mfaVerifiedAt });
      } else if (url.pathname === '/api/sessions') {
        if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        const sessions = await provider.api.listSessions({ headers: transportHeaders(request) });
        send(response, 200, { sessions: sessions.map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt })) });
      } else if (revoke) {
        if (method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        const sessionId = identifier('session')(revoke[1]);
        const sessions = await provider.api.listSessions({ headers: transportHeaders(request) });
        const found = sessions.find((session) => session.id === sessionId);
        if (found) await provider.api.revokeSession({ headers: transportHeaders(request), body: { token: found.token } });
        send(response, 200, { revoked: true });
      } else if (tenantAccess) {
        if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        const tenantId = identifier('tenant')(tenantAccess[1]); const eventId = identifier('event')(tenantAccess[2]);
        const capabilities = await withCredential(options.runtimePool, signedIn.token, async (client, actor) => {
          await requireAccess(client, 'event.read', { tenantId, eventId });
          const allowed = await client.query<{ action: string }>('SELECT action FROM unnest($1::text[]) AS action WHERE lde_security.has_access(action,$2,$3,$4)', [ACTIONS, tenantId, eventId, actor.principalId]);
          return allowed.rows.map((row) => row.action);
        });
        send(response, 200, { tenantId, eventId, capabilities });
      }
    } catch (error) {
      if (error instanceof AccessError) send(response, error.status, { error: error.status === 401 ? 'authentication_required' : 'access_denied' });
      else if (error instanceof HttpError) send(response, error.status, { error: error.code });
      else if (error instanceof Error && error.name === 'ContractError') send(response, 400, { error: 'invalid_request' });
      else send(response, 503, { error: 'identity_unavailable' });
    }
    return true;
  }
  return Object.freeze({ provider, handle, drain: async () => { await Promise.all([...tasks]); } });
}
