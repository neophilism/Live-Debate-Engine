import type { AdministrationHttpRuntime } from '../../../packages/competition/src/administration-http.js';
import type { CompetitionHttpRuntime } from '../../../packages/competition/src/http.js';
import type { UiRuntime } from '../../../packages/ui/src/http.js';
import { createServer, type Server } from 'node:http';
import type { ObjectHttpRuntime } from '../../../packages/security/src/http.js';
import type { IdentityRuntime } from '../../../packages/identity/src/http.js';
import { ENGINE_VERSION, type HealthResponse, type Readiness } from '../../../packages/contracts/src/index.js';

export type ApiOptions = Readonly<{ readiness: () => Promise<Readiness>; release?: string; identity?: IdentityRuntime; objects?: ObjectHttpRuntime; ui?: UiRuntime; administration?: AdministrationHttpRuntime; competition?: CompetitionHttpRuntime }>;

export function createApi(options: ApiOptions): Server {
  const release = options.release && /^[a-f0-9]{40}$/.test(options.release) ? options.release : null;
  const health: HealthResponse = Object.freeze({ status: 'alive', product: 'Live Debate Engine', version: ENGINE_VERSION, release, stage: 'foundation', competitionReady: false });
  const server = createServer(async (request, response) => {
    if (options.administration && await options.administration.handle(request, response)) return;
    if (options.competition && await options.competition.handle(request, response)) return;
    if (options.objects && await options.objects.handle(request, response)) return;
    if (options.identity && await options.identity.handle(request, response)) return;
    if (options.ui?.handle(request, response)) return;
    const send = (status: number, body: object) => {
      const json = JSON.stringify(body);
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
        'content-length': Buffer.byteLength(json),
      });
      response.end(request.method === 'HEAD' ? undefined : json);
    };
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.setHeader('allow', 'GET, HEAD');
      send(405, { error: 'method_not_allowed' });
      return;
    }
    let pathname: string;
    try { pathname = new URL(request.url ?? '/', 'http://localhost').pathname; }
    catch { send(400, { error: 'invalid_request' }); return; }
    if (pathname === '/api/health') { send(200, health); return; }
    if (pathname === '/api/ready') {
      try {
        const status = await options.readiness();
        send(status.ready ? 200 : 503, { ready: status.ready, reason: status.reason, competitionReady: false });
      } catch { send(503, { ready: false, reason: 'database_unavailable', competitionReady: false }); }
      return;
    }
    send(404, { error: 'not_found' });
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  return server;
}

