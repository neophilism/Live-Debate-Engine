import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { AccessError } from '../../identity/src/broker.js';
import { identifier } from '../../contracts/src/validation.js';
import { HttpError, readJson } from './http.js';
import type { RosterStore } from './roster-store.js';
/** Credential-bound draft operations; never activates competition assignments. */
export function createRosterHttp(store: RosterStore, identity: IdentityRuntime, origin: string) {
  return Object.freeze({ handle: async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    let url: URL; try { url = new URL(request.url ?? '/', origin); } catch { return false; }
    const route = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/roster(?:\/(draft|reviews)(?:\/([^/]+))?)?$/.exec(url.pathname);
    if (!route) return false;
    const send = (status: number, value: unknown) => {
      const bytes = JSON.stringify(value); response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'content-length': Buffer.byteLength(bytes) }); response.end(bytes);
    };
    try {
      if (!['GET', 'POST'].includes(request.method ?? '')) throw new HttpError(405, 'method_not_allowed');
      const queryKeys = [...url.searchParams.keys()];
      if (new Set(queryKeys).size !== queryKeys.length || queryKeys.some(k => k !== 'before') || (request.method !== 'GET' && url.search)) throw new HttpError(400, 'invalid_request');
      if (request.method === 'POST' && (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'origin_denied');
      const actor = await identity.authenticate(request); const tenant = identifier('tenant')(route[1]); const event = identifier('event')(route[2]);
      if (request.method === 'GET' && route[3] === undefined) send(200, await store.workspace(actor.token, tenant, event, url.searchParams.get('before') === null ? null : identifier('principal')(url.searchParams.get('before'))));
      else if (request.method === 'POST' && route[3] === 'draft' && route[4] === undefined) send(200, await store.saveDraft(actor.token, tenant, event, await readJson(request)));
      else if (request.method === 'POST' && route[3] === 'reviews' && route[4] !== undefined) send(200, await store.review(actor.token, tenant, event, identifier('principal')(route[4]), await readJson(request)));
      else throw new HttpError(405, 'method_not_allowed');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (error instanceof HttpError) send(error.status, { error: error.code });
      else if (error instanceof AccessError && error.status === 401) send(401, { error: 'authentication_required' });
      else if (error instanceof AccessError || code === '42501') send(404, { error: 'roster_unavailable' });
      else if (['40001', '40P01', '55P03', '55000', '23505'].includes(code)) send(409, { error: 'roster_review_or_revision_conflict' });
      else if (error instanceof TypeError || error instanceof RangeError || ['invalid_contract', '22023', '22P02', '23514', '23503', '23502', '22007', '22008'].includes(code)) send(400, { error: 'invalid_roster_request' });
      else send(503, { error: 'roster_unavailable' });
    }
    return true;
  } });
}
