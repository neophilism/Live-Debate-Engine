import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAdministrationHttp } from '../../dist/packages/competition/src/administration-http.js';
import { AccessError } from '../../dist/packages/identity/src/broker.js';
const id = '10000000-1111-4111-8111-111111111111';
async function fixture(t) {
  const calls = []; let failure;
  const store = Object.fromEntries(['records', 'saveSeries', 'saveMotion', 'publishMotion', 'saveEvent', 'publishEvent', 'amendPublishedMotion'].map(name => [name, async (...args) => { if (failure) throw failure; calls.push([name, ...args]); return { operation: name }; }]));
  let runtime; const server = createServer(async (req, res) => { if (!await runtime.handle(req, res)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  runtime = createAdministrationHttp(store, { authenticate: async req => { if (req.headers.cookie !== 'fixture=yes') throw new AccessError(401); return { token: 'Synthetic-scoped-credential' }; } }, origin);
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const call = (path, options = {}) => fetch(origin + path, { ...options, headers: { cookie: 'fixture=yes', ...(options.method === 'POST' ? { origin, 'content-type': 'application/json' } : {}), ...options.headers } });
  return { calls, call, origin, fail: error => { failure = error; }, base: `/api/tenants/${id}/administration` };
}
test('administration HTTP routes dispatch only fixed credential-scoped commands', async t => {
  const f = await fixture(t); const body = JSON.stringify({ commandId: id });
  for (const [path, operation] of [[`series/${id}`, 'saveSeries'], [`motions/${id}`, 'saveMotion'], [`motions/${id}/publish`, 'publishMotion'], [`events/${id}`, 'saveEvent'], [`events/${id}/publish`, 'publishEvent'], [`events/${id}/amend/${id}`, 'amendPublishedMotion']]) {
    const response = await f.call(`${f.base}/${path}`, { method: 'POST', body });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).operation, operation); assert.equal(f.calls.at(-1)[1], 'Synthetic-scoped-credential'); assert.equal(f.calls.at(-1)[2], id);
  }
  const response = await f.call(`${f.base}/motions?entity=${id}&beforeRevision=7`);
  assert.equal(response.status, 200); assert.deepEqual(f.calls.at(-1).slice(2), [id, 'motion', id, null, 7]);
});
test('authentication, same-origin policy and bounded JSON fail before dispatch', async t => {
  const f = await fixture(t);
  assert.equal((await f.call(`${f.base}/series`, { headers: { cookie: '' } })).status, 401);
  assert.equal((await f.call(`${f.base}/series/${id}`, { method: 'POST', body: '{}', headers: { origin: 'https://untrusted.invalid' } })).status, 403);
  assert.equal((await f.call(`${f.base}/series/${id}`, { method: 'POST', body: '{}', headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await f.call(`${f.base}/series/${id}`, { method: 'POST', body: '{' })).status, 400);
  assert.equal((await f.call(`${f.base}/series/${id}`, { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.call(`${f.base}/series/${id}`, { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(131073) }) })).status, 413);
  assert.equal(f.calls.length, 0);
});
test('invalid routes, cursor combinations and query parameters never mutate', async t => {
  const f = await fixture(t);
  for (const path of [`series?before=bad`, `series?entity=${id}&before=${id}`, 'events?beforeRevision=0', 'events?beforeRevision=2', 'events?ignored=1', `events?entity=${id}&entity=${id}`]) assert.equal((await f.call(`${f.base}/${path}`)).status, 400, path);
  for (const path of [`series/${id}/publish`, `motions/${id}/amend/${id}`, `events/${id}/publish/${id}`]) assert.equal((await f.call(`${f.base}/${path}`, { method: 'POST', body: '{}' })).status, 405, path);
  assert.equal((await f.call(`${f.base}/events`, { method: 'DELETE' })).status, 405);
  assert.equal(f.calls.length, 0);
});
test('conflicts and unavailable storage cannot appear successful or disclose database diagnostics', async t => {
  const f = await fixture(t);
  for (const [error, status] of [[Object.assign(new Error('private SQL diagnostic'), { code: '40001' }), 409], [new AccessError(403), 404], [new TypeError('private malformed input'), 400], [new Error('private storage diagnostic'), 503]]) {
    f.fail(error); const response = await f.call(`${f.base}/events`); assert.equal(response.status, status); assert.ok(!(await response.text()).includes('private'));
  }
});
