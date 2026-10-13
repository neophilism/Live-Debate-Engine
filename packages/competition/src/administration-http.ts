import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccessError } from '../../identity/src/broker.js';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { identifier } from '../../contracts/src/validation.js';
import { securityLogLine } from '../../security/src/logging.js';
import type { AdministrationStore } from './administration-store.js';

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json') throw new HttpError(415, 'json_required');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') {
    throw new HttpError(415, 'unsupported_encoding');
  }
  const size = request.headers['content-length'];
  if (size && (!/^\d+$/.test(size) || Number(size) > 131072)) throw new HttpError(413, 'body_too_large');
  return new Promise((resolve, reject) => {
    let length = 0;
    let failed = false;
    const chunks: Buffer[] = [];
    const clear = () => {
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
    };
    request.on('data', (part: Buffer) => {
      if (failed) return;
      length += part.length;
      if (length > 131072) {
        failed = true;
        clear();
        reject(new HttpError(413, 'body_too_large'));
      } else {
        chunks.push(Buffer.from(part));
      }
    });
    request.once('end', () => {
      if (failed) return;
      const bytes = Buffer.concat(chunks);
      clear();
      try {
        resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      } catch {
        reject(new HttpError(400, 'invalid_request'));
      } finally {
        bytes.fill(0);
      }
    });
    for (const event of ['error', 'aborted']) {
      request.once(event, () => {
        failed = true;
        clear();
        reject(new HttpError(400, 'invalid_request'));
      });
    }
  });
}

type AdministrationOperations = Pick<
  AdministrationStore,
  'saveSeries' | 'saveMotion' | 'publishMotion' | 'saveEvent' | 'publishEvent' | 'amendPublishedMotion'
>;

export type AdministrationHttpRuntime = Readonly<{
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}>;

/** Credential-bound E08 write routes. Every successful response is the durable database result. */
export function createAdministrationHttp(
  store: AdministrationOperations,
  identity: IdentityRuntime,
  origin: string,
  log: (line: string) => void = (line) => console.log(line),
): AdministrationHttpRuntime {
  return Object.freeze({
    handle: async (request, response) => {
      let url: URL;
      try {
        url = new URL(request.url ?? '/', origin);
      } catch {
        return false;
      }
      const series = /^\/api\/tenants\/([^/]+)\/series\/([^/]+)$/.exec(url.pathname);
      const motion = /^\/api\/tenants\/([^/]+)\/motions\/([^/]+)(?:\/(publish))?$/.exec(url.pathname);
      const event = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)(?:\/(publish))?$/.exec(url.pathname);
      const amendment = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/motions\/([^/]+)\/amend$/.exec(url.pathname);
      if (!series && !motion && !event && !amendment) return false;

      const requestId = randomUUID();
      const send = (status: number, data: unknown) => {
        const payload = JSON.stringify(data);
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
          'content-length': Buffer.byteLength(payload),
        });
        response.end(payload);
        try {
          log(
            securityLogLine({
              event: 'administration-request',
              requestId,
              status,
              result:
                status < 400
                  ? 'completed'
                  : status === 503
                    ? 'unavailable'
                    : [401, 403, 404].includes(status)
                      ? 'denied'
                      : 'invalid',
            }),
          );
        } catch {
          // Durable mutation audit is recorded in the database transaction.
        }
      };

      try {
        if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        if (url.search) throw new HttpError(400, 'invalid_request');
        if (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'origin_denied');
        }
        const actor = await identity.authenticate(request);
        const input = await readJson(request);
        if (series) {
          send(200, await store.saveSeries(actor.token, identifier('tenant')(series[1]), identifier('series')(series[2]), input));
        } else if (motion) {
          send(
            200,
            motion[3]
              ? await store.publishMotion(actor.token, identifier('tenant')(motion[1]), identifier('motion')(motion[2]), input)
              : await store.saveMotion(actor.token, identifier('tenant')(motion[1]), identifier('motion')(motion[2]), input),
          );
        } else if (amendment) {
          send(
            200,
            await store.amendPublishedMotion(
              actor.token,
              identifier('tenant')(amendment[1]),
              identifier('event')(amendment[2]),
              identifier('motion')(amendment[3]),
              input,
            ),
          );
        } else if (event) {
          send(
            200,
            event[3]
              ? await store.publishEvent(actor.token, identifier('tenant')(event[1]), identifier('event')(event[2]), input)
              : await store.saveEvent(actor.token, identifier('tenant')(event[1]), identifier('event')(event[2]), input),
          );
        }
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (error instanceof HttpError) send(error.status, { error: error.code });
        else if (error instanceof AccessError && error.status === 401) send(401, { error: 'authentication_required' });
        else if (error instanceof AccessError || code === '42501') send(404, { error: 'administration_unavailable' });
        else if (['40001', '40P01', '55P03', '55000', '23505'].includes(String(code))) {
          send(409, {
            error: 'administration_conflict',
            recovery: 'Refresh the current records and retry with their exact revisions.',
          });
        } else if (code === '54000') send(413, { error: 'administration_limit_exceeded' });
        else if (
          error instanceof TypeError ||
          error instanceof RangeError ||
          ['22023', '22P02', '23514', '23503', '23502'].includes(String(code))
        ) {
          send(400, { error: 'invalid_administration_request' });
        } else {
          send(503, { error: 'administration_unavailable' });
        }
      }
      return true;
    },
  });
}
