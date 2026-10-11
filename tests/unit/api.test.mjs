import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApi } from '../../dist/apps/api/src/server.js';

async function withApi(t, options) {
  const server = createApi(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('liveness never implies competition readiness or leaks release input', async (t) => {
  const base = await withApi(t, { release: 'not-a-sha/private-data', readiness: async () => ({ ready: false, reason: 'database_unconfigured' }) });
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.competitionReady, false);
  assert.equal(data.release, null);
  assert.equal(data.stage, 'foundation');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
test('schema-ready is distinct from event-production readiness', async (t) => {
  const base = await withApi(t, { readiness: async () => ({ ready: true, reason: 'schema_compatible' }) });
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ready: true, reason: 'schema_compatible', competitionReady: false });
});
test('unconfigured and failed readiness return 503 without driver details', async (t) => {
  const base = await withApi(t, { readiness: async () => { throw new Error('postgresql://private:secret@private.invalid/db'); } });
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private|secret|postgresql/);
});
test('HEAD, unknown routes and disallowed methods are controlled', async (t) => {
  const base = await withApi(t, { readiness: async () => ({ ready: false, reason: 'database_unconfigured' }) });
  const head = await fetch(`${base}/api/health`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/not-a-route`)).status, 404);
  const post = await fetch(`${base}/api/health`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
