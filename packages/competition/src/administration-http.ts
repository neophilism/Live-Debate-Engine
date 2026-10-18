import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { AccessError } from '../../identity/src/broker.js';
import { identifier, integer } from '../../contracts/src/validation.js';
import { HttpError, readJson } from './http.js';
import type { AdministrationStore } from './administration-store.js';
export type AdministrationHttpRuntime = Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> }>;
export function createAdministrationHttp(store: AdministrationStore, identity: IdentityRuntime, origin: string): AdministrationHttpRuntime {
  return Object.freeze({ handle: async (request, response) => {
    let url: URL; try { url = new URL(request.url ?? '/', origin); } catch { return false; }
    const route = /^\/api\/tenants\/([^/]+)\/administration\/(series|motions|events)(?:\/([^/]+)(?:\/(publish|amend)(?:\/([^/]+))?)?)?$/.exec(url.pathname);
    if (!route) return false;
    const send = (status: number, value: unknown) => {
      const body = JSON.stringify(value);
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'content-length': Buffer.byteLength(body), 'x-request-id': randomUUID() });
      response.end(body);
    };
    try {
      if (!['GET', 'POST'].includes(request.method ?? '')) throw new HttpError(405, 'method_not_allowed');
      if (request.method === 'POST' && (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'origin_denied');
      const actor = await identity.authenticate(request);
      const tenant = identifier('tenant')(route[1]);
      const kind = route[2] === 'series' ? 'series' : route[2] === 'motions' ? 'motion' : 'event';
      const entity = route[3] === undefined ? null : identifier('entity')(route[3]);
      if (request.method === 'GET') {
        if (entity !== null || route[4]) throw new HttpError(405, 'method_not_allowed');
        const keys = [...url.searchParams.keys()];
        if (new Set(keys).size !== keys.length || keys.some(k => !['entity', 'before', 'beforeRevision'].includes(k))) throw new HttpError(400, 'invalid_request');
        const selected = url.searchParams.get('entity'); const before = url.searchParams.get('before'); const revisionText = url.searchParams.get('beforeRevision');
        if ((selected && before) || (revisionText !== null && (!selected || !/^[1-9][0-9]{0,9}$/.test(revisionText)))) throw new HttpError(400, 'invalid_request');
        send(200, await store.records(actor.token, tenant, kind, selected === null ? null : identifier('entity')(selected), before === null ? null : identifier('entity')(before), integer(1)(revisionText === null ? 2147483647 : Number(revisionText))));
      } else {
        if (url.search || entity === null) throw new HttpError(400, 'invalid_request');
        const action = route[4];
        if ((kind === 'series' && action) || (action === 'amend' && (kind !== 'event' || !route[5])) || (route[5] && action !== 'amend')) throw new HttpError(405, 'method_not_allowed');
        const body = await readJson(request);
        if (kind === 'series') send(200, await store.saveSeries(actor.token, tenant, entity, body));
        else if (kind === 'motion') send(200, action === 'publish' ? await store.publishMotion(actor.token, tenant, entity, body) : await store.saveMotion(actor.token, tenant, entity, body));
        else if (action === 'amend') send(200, await store.amendPublishedMotion(actor.token, tenant, entity, identifier('motion')(route[5]), body));
        else send(200, action === 'publish' ? await store.publishEvent(actor.token, tenant, entity, body) : await store.saveEvent(actor.token, tenant, entity, body));
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (error instanceof HttpError) send(error.status, { error: error.code });
      else if (error instanceof AccessError && error.status === 401) send(401, { error: 'authentication_required' });
      else if (error instanceof AccessError || code === '42501') send(404, { error: 'administration_unavailable' });
      else if (['40001', '40P01', '55P03', '55000', '23505'].includes(code)) send(409, { error: 'administration_conflict' });
      else if (error instanceof TypeError || error instanceof RangeError || ['invalid_contract', '22023', '22P02', '23514', '23503', '23502'].includes(code)) send(400, { error: 'invalid_administration_request' });
      else send(503, { error: 'administration_unavailable' });
    }
    return true;
  } });
}

