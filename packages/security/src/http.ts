import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { AccessError } from '../../identity/src/broker.js';
import { identifier, enumeration } from '../../contracts/src/validation.js';
import { MAX_OBJECT_BYTES, MIME_TYPES, ProtectedDataError } from './envelope.js';
import type { ProtectedObjectStore } from './store.js';
import { securityLogLine } from './logging.js';

class RequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function body(request: IncomingMessage, maximum: number): Promise<Buffer> {
  const encoding = request.headers['content-encoding'];
  if (encoding && encoding !== 'identity') throw new RequestError(415, 'unsupported_encoding');
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new RequestError(413, 'body_too_large');
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []; let length = 0; let failed = false;
    const clear = () => { for (const part of parts) part.fill(0); parts.length = 0; };
    request.on('data', (part: Buffer) => {
      if (failed) return; length += part.length;
      if (length > maximum) { failed = true; clear(); reject(new RequestError(413, 'body_too_large')); return; }
      parts.push(Buffer.from(part));
    });
    request.once('end', () => { if (!failed) { const bytes = Buffer.concat(parts); clear(); resolve(bytes); } });
    request.once('error', () => { failed = true; clear(); reject(new RequestError(400, 'invalid_request')); });
    request.once('aborted', () => { failed = true; clear(); reject(new RequestError(400, 'invalid_request')); });
  });
}
export type ObjectHttpRuntime = Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> }>;
export function createObjectHttp(store: ProtectedObjectStore, identity: IdentityRuntime, origin: string,
  log: (line: string) => void = (line) => console.log(line)): ObjectHttpRuntime {
  return Object.freeze({ handle: async (request, response) => {
    if (!request.url?.startsWith('/api/tenants/')) return false;
    let url: URL; try { url = new URL(request.url, origin); } catch { return false; }
    const upload = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/objects\/([^/]+)$/.exec(url.pathname);
    const operation = /^\/api\/tenants\/([^/]+)\/objects\/([^/]+)\/(ticket|content|revoke|status)$/.exec(url.pathname);
    if (!upload && !operation) return false;
    const requestId = randomUUID();
    let inputBytes: Buffer | undefined;
    const send = (status: number, data: unknown, bytes?: Buffer, contentType?: string) => {
      const payload = bytes ?? Buffer.from(JSON.stringify(data));
      log(securityLogLine({ event: 'protected-object-request', requestId, status, result: status < 400 ? 'completed' : status === 503 ? 'unavailable' : [401, 403, 404].includes(status) ? 'denied' : 'invalid' }));
      response.writeHead(status, {
        'content-type': contentType ?? 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
        'content-length': payload.length, ...(bytes ? { 'content-disposition': 'attachment; filename="protected-asset"' } : {}),
      });
      response.end(payload, () => { payload.fill(0); });
    };
    try {
      const method = request.method;
      if (method !== 'GET' && method !== 'POST') throw new RequestError(405, 'method_not_allowed');
      if (method === 'POST' && (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site')) throw new RequestError(403, 'origin_denied');
      const signedIn = await identity.authenticate(request);
      if (upload) {
        if (method !== 'POST' || url.search) throw new RequestError(405, 'method_not_allowed');
        const tenantId = identifier('tenant')(upload[1]); const eventId = identifier('event')(upload[2]);
        const purpose = enumeration(['identity-document', 'judge-note', 'finance-document', 'production-asset'] as const)(upload[3]);
        const contentType = enumeration(MIME_TYPES)(request.headers['content-type']);
        inputBytes = await body(request, MAX_OBJECT_BYTES);
        const result = await store.upload(signedIn.token, { tenantId, eventId, purpose, contentType }, inputBytes);
        send(202, result);
      } else if (operation) {
        const tenantId = identifier('tenant')(operation[1]); const objectId = identifier('protected-object')(operation[2]);
        const action = operation[3];
        if (action === 'content') {
          if (method !== 'GET' || [...url.searchParams.keys()].join(',') !== 'ticket') throw new RequestError(400, 'invalid_request');
          const result = await store.download(signedIn.token, tenantId, objectId, url.searchParams.get('ticket') ?? '');
          send(200, null, result.bytes, result.contentType);
        } else if (action === 'status') {
          if (method !== 'GET' || url.search) throw new RequestError(405, 'method_not_allowed');
          send(200, await store.status(signedIn.token, tenantId, objectId));
        } else {
          if (method !== 'POST' || url.search) throw new RequestError(405, 'method_not_allowed');
          if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'json_required');
          inputBytes = await body(request, 2);
          if (inputBytes.toString('utf8') !== '{}') throw new RequestError(400, 'invalid_request');
          if (action === 'ticket') send(200, { ticket: await store.issueDownload(signedIn.token, tenantId, objectId), expiresInSeconds: 60 });
          else { await store.revoke(signedIn.token, tenantId, objectId); send(200, { revoked: true }); }
        }
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (error instanceof RequestError) send(error.status, { error: error.code });
      else if (error instanceof AccessError && error.status === 401) send(401, { error: 'authentication_required' });
      else if (error instanceof AccessError || code === '42501') send(404, { error: 'object_unavailable' });
      else if (code === '54000') send(413, { error: 'storage_quota_exceeded' });
      else if (code === 'invalid_contract') send(400, { error: 'invalid_request' });
      else if (error instanceof ProtectedDataError) send(503, { error: 'protected_data_unavailable' });
      else send(503, { error: 'storage_unavailable' });
    } finally { inputBytes?.fill(0); }
    return true;
  } });
}
