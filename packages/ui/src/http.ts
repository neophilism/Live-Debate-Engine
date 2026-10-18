import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { selectBrand } from './branding.js';
const pages = new Set(['/', '/app', '/sign-in', '/register', '/verify-email', '/reset-request', '/reset-password', '/security', '/workspaces', '/workspace', '/components', '/rulesets', '/contract', '/administration']);
export type UiRuntime = Readonly<{ handle: (request: IncomingMessage, response: ServerResponse) => boolean }>;
export async function createUiRuntime(brandId: string, identityEnabled: boolean): Promise<UiRuntime> {
  const brand = selectBrand(brandId);
  // Fixed paths, not caller-supplied filesystem paths. No node_modules, maps or sources served.
  const js = await readFile(new URL('../../../ui/assets/ui.js', import.meta.url));
  const css = await readFile(new URL('../../../ui/assets/ui.css', import.meta.url));
  const html = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${brand.name} | Debate workspace</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/ui.css"><script src="/assets/ui.js" defer></script></head><body><div id="app"><main class="loading-page"><h1>${brand.name}</h1><p>Loading your debate workspace...</p></main></div><noscript><p>This workspace requires JavaScript for authenticated forms. No request has been sent.</p></noscript></body></html>`);
  const config = Buffer.from(JSON.stringify({ brand: brand.id, identityEnabled, stage: 'foundation', competitionReady: false }));
  function handle(request: IncomingMessage, response: ServerResponse): boolean {
    const target = request.url ?? '';
    if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return false;
    let path: string;
    try { path = new URL(target, 'http://localhost').pathname; } catch { return false; }
    const content = pages.has(path) ? { data: html, type: 'text/html; charset=utf-8' }
      : path === '/assets/ui.js' ? { data: js, type: 'text/javascript; charset=utf-8' }
      : path === '/assets/ui.css' ? { data: css, type: 'text/css; charset=utf-8' }
      : path === '/api/ui-config' ? { data: config, type: 'application/json; charset=utf-8' } : null;
    if (!content) return false;
    const allowed = request.method === 'GET' || request.method === 'HEAD';
    response.writeHead(allowed ? 200 : 405, {
      'content-type': content.type, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      ...(allowed ? { 'content-length': content.data.length } : { allow: 'GET, HEAD' }),
    });
    response.end(allowed && request.method !== 'HEAD' ? content.data : undefined); return true;
  }
  return Object.freeze({ handle });
}

