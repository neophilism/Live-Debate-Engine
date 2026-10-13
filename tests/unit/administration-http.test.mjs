import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createAdministrationHttp } from '../../dist/packages/competition/src/administration-http.js';

async function withAdministration(t, store, authenticate = async () => ({ token: 'session-token' })) {
  let runtime;
  const server = createServer(async (request, response) => {
    if (!(await runtime.handle(request, response))) {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const logs = [];
  runtime = createAdministrationHttp(store, { authenticate }, origin, (line) => logs.push(line));
  return { origin, logs };
}

function operations(call) {
  return {
    saveSeries: (...args) => call('saveSeries', args),
    saveMotion: (...args) => call('saveMotion', args),
    publishMotion: (...args) => call('publishMotion', args),
    saveEvent: (...args) => call('saveEvent', args),
    publishEvent: (...args) => call('publishEvent', args),
    amendPublishedMotion: (...args) => call('amendPublishedMotion', args),
  };
}

async function post(origin, path, body = { commandId: randomUUID(), expectedRevision: 0 }, headers = {}) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify(body),
  });
}

test('E08 administration HTTP dispatches only credential-bound same-origin writes', async (t) => {
  const calls = [];
  const { origin, logs } = await withAdministration(t, operations(async (name, args) => {
    calls.push({ name, args });
    return { operation: name };
  }));
  const tenant = randomUUID();
  const series = randomUUID();
  const motion = randomUUID();
  const event = randomUUID();
  const routes = [
    [`/api/tenants/${tenant}/series/${series}`, 'saveSeries'],
    [`/api/tenants/${tenant}/motions/${motion}`, 'saveMotion'],
    [`/api/tenants/${tenant}/motions/${motion}/publish`, 'publishMotion'],
    [`/api/tenants/${tenant}/events/${event}`, 'saveEvent'],
    [`/api/tenants/${tenant}/events/${event}/publish`, 'publishEvent'],
    [`/api/tenants/${tenant}/events/${event}/motions/${motion}/amend`, 'amendPublishedMotion'],
  ];
  for (const [path, operation] of routes) {
    const response = await post(origin, path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { operation });
  }
  assert.deepEqual(calls.map((entry) => entry.name), routes.map((entry) => entry[1]));
  assert.ok(calls.every((entry) => entry.args[0] === 'session-token' && entry.args[1] === tenant));
  assert.equal(calls[0].args[2], series);
  assert.deepEqual(calls[0].args[3], calls[0].args.at(-1));
  assert.equal(calls.at(-1).args[2], event);
  assert.equal(calls.at(-1).args[3], motion);
  assert.equal(logs.length, routes.length);
  assert.ok(logs.every((line) => !line.includes('session-token')));
});

test('E08 administration HTTP rejects cross-site and unauthenticated writes before persistence', async (t) => {
  let calls = 0;
  let authenticates = 0;
  const { origin } = await withAdministration(
    t,
    operations(async () => {
      calls += 1;
      return {};
    }),
    async () => {
      authenticates += 1;
      const error = new Error('unauthenticated');
      error.status = 401;
      error.name = 'AccessError';
      throw error;
    },
  );
  const denied = await post(origin, `/api/tenants/${randomUUID()}/series/${randomUUID()}`, {}, { origin: 'https://attacker.invalid' });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: 'origin_denied' });
  assert.equal(authenticates, 0);
  assert.equal(calls, 0);
});

test('E08 administration HTTP maps invalid, conflicting and unavailable mutations without leaking details', async (t) => {
  const failures = [
    [new TypeError('private validation detail'), 400, 'invalid_administration_request'],
    [Object.assign(new Error('private serialization detail'), { code: '40001' }), 409, 'administration_conflict'],
    [new Error('private database detail'), 503, 'administration_unavailable'],
  ];
  let index = 0;
  const { origin } = await withAdministration(t, operations(async () => {
    throw failures[index++][0];
  }));
  const path = `/api/tenants/${randomUUID()}/series/${randomUUID()}`;
  for (const [, status, code] of failures) {
    const response = await post(origin, path);
    assert.equal(response.status, status);
    const payload = await response.json();
    assert.equal(payload.error, code);
    assert.equal(JSON.stringify(payload).includes('private'), false);
  }
});
