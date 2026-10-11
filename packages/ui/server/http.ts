import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { IdentityRuntime } from '../../identity/src/http.js';
import { withCredential, AccessError } from '../../identity/src/broker.js';
import { identifier } from '../../contracts/src/validation.js';
import { ACTIONS } from '../../contracts/src/access.js';
import { resolveBrand } from '../src/brands.js';
import type { InterfaceConfig } from '../src/types.js';

const pagePaths = new Set(['/', '/sign-in', '/register', '/forgot-password', '/reset-password', '/challenge', '/security', '/workspace', '/files']);
const header = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
export type UiRuntime = Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> }>;
export async function createUiRuntime(options: Readonly<{ assetDirectory: string; brandId: string; identity: IdentityRuntime; pool: Pool; storageEnabled: boolean }>): Promise<UiRuntime> {
  if (!isAbsolute(options.assetDirectory)) throw new Error('Absolute UI asset directory required');
  const config: InterfaceConfig = { brand: resolveBrand(options.brandId), features: { identity: true, storage: options.storageEnabled }, stage: 'foundation' };
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  for (const [file, type] of [['app.js', 'text/javascript; charset=utf-8'], ['app.css', 'text/css; charset=utf-8']]) {
    if (!file || !type) throw new Error('Invalid asset manifest');
    const bytes = await readFile(join(options.assetDirectory, file));
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error('Invalid UI asset');
    assets.set(`/assets/${file}`, { bytes, type });
  }
  const html = Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Live Debate Engine</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div><noscript>This application needs JavaScript for secure account and event interactions. No votes or changes have been submitted.</noscript></body></html>');
  return Object.freeze({ handle: async (request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) return false;
    let url: URL; try { url = new URL(request.url, 'http://localhost'); } catch { return false; }
    const fileList = /^\/api\/tenants\/([^/]+)\/events\/([^/]+)\/objects$/.exec(url.pathname);
    const recognized = pagePaths.has(url.pathname) || url.pathname === '/api/interface' || url.pathname === '/api/workspaces' || !!fileList || url.pathname.startsWith('/assets/');
    if (!recognized) return false;
    const send = (status: number, bytes: Buffer, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { ...header, 'content-type': type, 'content-length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    const json = (status: number, data: unknown) => send(status, Buffer.from(JSON.stringify(data)));
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.setHeader('allow', 'GET, HEAD'); json(405, { error: 'method_not_allowed' }); return true; }
    if (url.pathname.startsWith('/assets/')) {
      const asset = assets.get(url.pathname);
      if (!asset || url.search) json(404, { error: 'not_found' }); else send(200, asset.bytes, asset.type);
      return true;
    }
    if (pagePaths.has(url.pathname)) { send(200, html, 'text/html; charset=utf-8'); return true; }
    if (url.pathname === '/api/interface') { if (url.search) json(400, { error: 'invalid_request' }); else json(200, config); return true; }
    try {
      const queryKeys = [...url.searchParams.keys()];
      if (queryKeys.length > 1 || (queryKeys.length === 1 && queryKeys[0] !== 'after')) throw new Error('Invalid cursor');
      const after = url.searchParams.get('after');
      const identity = await options.identity.authenticate(request);
      if (url.pathname === '/api/workspaces') {
        const cursor = after?.split('~');
        if (cursor && cursor.length !== 2) throw new Error('Invalid cursor');
        const tenant = cursor ? identifier('tenant')(cursor[0]) : null; const event = cursor ? identifier('event')(cursor[1]) : null;
        const result = await withCredential(options.pool, identity.token, async (client, actor) => {
          const rows = await client.query<{ tenant_id: string; event_id: string; title: string; format: string; mode: string; capabilities: string[] }>(`WITH latest AS (
            SELECT DISTINCT ON(tenant_id,entity_id) tenant_id,entity_id,event_id,canonical_record::jsonb AS record
            FROM lde.revisions WHERE kind='event' AND ($1::uuid IS NULL OR (tenant_id,entity_id)>($1,$2))
            ORDER BY tenant_id,entity_id,revision DESC)
            SELECT tenant_id,event_id,record->'data'->>'title' AS title,record->'data'->>'format' AS format,record->'data'->>'mode' AS mode,
            ARRAY(SELECT action FROM unnest($3::text[]) action WHERE lde_security.has_access(action,tenant_id,event_id,$4)) AS capabilities
            FROM latest ORDER BY tenant_id,entity_id LIMIT 101`, [tenant, event, ACTIONS, actor.principalId]);
          return rows.rows;
        });
        const items = result.slice(0, 100).map((row) => ({ tenantId: row.tenant_id, eventId: row.event_id, title: row.title, format: row.format, mode: row.mode, capabilities: row.capabilities }));
        const last = items.at(-1); json(200, { items, nextCursor: result.length > 100 && last ? `${last.tenantId}~${last.eventId}` : null });
      } else if (fileList) {
        if (!options.storageEnabled) { json(503, { error: 'storage_unavailable' }); return true; }
        const tenant = identifier('tenant')(fileList[1]); const event = identifier('event')(fileList[2]);
        const cursor = after === null ? null : identifier('protected-object')(after);
        const result = await withCredential(options.pool, identity.token, async (client) => client.query<{ id: string; purpose: string; content_type: string; byte_length: number; state: string; generation: number; created_at: Date; can_revoke: boolean }>('SELECT * FROM lde_storage.list_objects($1,$2,$3)', [tenant, event, cursor]));
        const items = result.rows.slice(0, 100).map((row) => ({ id: row.id, purpose: row.purpose, contentType: row.content_type, byteLength: row.byte_length, state: row.state, generation: row.generation, createdAt: row.created_at.toISOString(), canRevoke: row.can_revoke }));
        json(200, { items, nextCursor: result.rows.length > 100 ? items.at(-1)?.id ?? null : null });
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (error instanceof AccessError) json(error.status, { error: error.status === 401 ? 'authentication_required' : 'access_denied' });
      else if (code === '42501') json(403, { error: 'access_denied' });
      else if (code === 'invalid_contract' || (error instanceof Error && error.message === 'Invalid cursor')) json(400, { error: 'invalid_request' });
      else json(503, { error: 'workspace_unavailable' });
    }
    return true;
  } });
}
