import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { AccessError } from '../../identity/src/broker.js';
import { identifier, integer } from '../../contracts/src/validation.js';
import { securityLogLine } from '../../security/src/logging.js';
import type { CompetitionStore } from './store.js';

export class HttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
export async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json') throw new HttpError(415, 'json_required');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') throw new HttpError(415, 'unsupported_encoding');
  const size = request.headers['content-length'];
  if (size && (!/^\d+$/.test(size) || Number(size) > 131072)) throw new HttpError(413, 'body_too_large');
  return new Promise((resolve, reject) => {
    let length = 0; let failed = false; const chunks: Buffer[] = [];
    const clear = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0; };
    request.on('data', (part: Buffer) => {
      if (failed) return; length += part.length;
      if (length > 131072) { failed = true; clear(); reject(new HttpError(413, 'body_too_large')); }
      else chunks.push(Buffer.from(part));
    });
    request.once('end', () => {
      if (failed) return; const bytes = Buffer.concat(chunks); clear();
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
      catch { reject(new HttpError(400, 'invalid_request')); } finally { bytes.fill(0); }
    });
    for (const event of ['error', 'aborted']) request.once(event, () => { failed = true; clear(); reject(new HttpError(400, 'invalid_request')); });
  });
}
export type CompetitionHttpRuntime = Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> }>;
export function createCompetitionHttp(store: CompetitionStore, identity: IdentityRuntime, origin: string,
  log: (line: string) => void = (line) => console.log(line)): CompetitionHttpRuntime {
  return Object.freeze({ handle: async (request, response) => {
    let url: URL; try { url = new URL(request.url ?? '/', origin); } catch { return false; }
    const rules = /^\/api\/tenants\/([^/]+)\/rulesets(?:\/([^/]+)(?:\/(publish))?)?$/.exec(url.pathname);
    const contract = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/contract(?:\/(offer|acknowledge))?$/.exec(url.pathname);
    if (!rules && !contract) return false;
    const requestId = randomUUID();
    const send = (status: number, data: unknown) => {
      const payload = JSON.stringify(data);
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'content-length': Buffer.byteLength(payload) });
      response.end(payload);
      // A telemetry sink failure cannot undo the durable audit or send a second response.
      try { log(securityLogLine({ event: 'material-contract-request', requestId, status, result: status < 400 ? 'completed' : status === 503 ? 'unavailable' : [401, 403, 404].includes(status) ? 'denied' : 'invalid' })); } catch { /* Durable mutation audit is recorded in the transaction. */ }
    };
    try {
      if (!['GET', 'POST'].includes(request.method ?? '')) throw new HttpError(405, 'method_not_allowed');
      if (request.method === 'POST' && (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'origin_denied');
      const actor = await identity.authenticate(request); const tenantId = identifier('tenant')((rules ?? contract)?.[1]);
      if (request.method === 'GET') {
        const keys = [...url.searchParams.keys()];
        if (keys.length > 2 || new Set(keys).size !== keys.length || keys.some((key) => key !== 'before' && !(contract && key === 'snapshot'))) throw new HttpError(400, 'invalid_request');
        const beforeText = url.searchParams.get('before');
        if (beforeText !== null && !/^[1-9][0-9]{0,9}$/.test(beforeText)) throw new HttpError(400, 'invalid_request');
        const before = integer(1)(beforeText === null ? 2147483647 : Number(beforeText));
        if (rules && !rules[3]) send(200, await store.rulesets(actor.token, tenantId, rules[2] ?? null, before));
        else if (contract && !contract[3]) send(200, await store.workspace(actor.token, tenantId, identifier('event')(contract[2]), before, url.searchParams.get('snapshot')));
        else throw new HttpError(405, 'method_not_allowed');
      } else {
        if (url.search) throw new HttpError(400, 'invalid_request');
        const input = await readJson(request);
        if (rules?.[2]) {
          const entityId = identifier('entity')(rules[2]);
          send(200, rules[3] === 'publish' ? await store.publishRuleset(actor.token, tenantId, entityId, input) : await store.saveRuleset(actor.token, tenantId, entityId, input));
        } else if (contract) {
          const eventId = identifier('event')(contract[2]);
          send(200, contract[3] === 'offer' ? await store.offerContract(actor.token, tenantId, eventId, input) : contract[3] === 'acknowledge' ? await store.acknowledge(actor.token, tenantId, eventId, input) : await store.saveContract(actor.token, tenantId, eventId, input));
        } else throw new HttpError(405, 'method_not_allowed');
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (error instanceof HttpError) send(error.status, { error: error.code });
      else if (error instanceof AccessError && error.status === 401) send(401, { error: 'authentication_required' });
      else if (error instanceof AccessError || code === '42501') send(404, { error: 'material_unavailable' });
      else if (['40001', '40P01', '55P03', '55000', '23505'].includes(String(code))) send(409, { error: 'material_conflict', recovery: 'Refresh and review the current version. A recorded amendment may be required.' });
      else if (code === '54000') send(413, { error: 'material_limit_exceeded' });
      else if (code === 'invalid_contract' || ['22023', '22P02', '23514', '23503', '23502'].includes(String(code))) send(400, { error: 'invalid_material_request' });
      else send(503, { error: 'material_unavailable' });
    }
    return true;
  } });
}

