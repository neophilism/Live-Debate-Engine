import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import pg from 'pg';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { createIdentityRuntime } from '../../dist/packages/identity/src/http.js';
import { withCredential } from '../../dist/packages/identity/src/broker.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';
import { ProtectedObjectStore, rotateObjectKey } from '../../dist/packages/security/src/store.js';
import { FileKeyProvider, generateKeyDocument } from '../../dist/packages/security/src/keys.js';
import { createObjectHttp } from '../../dist/packages/security/src/http.js';
import { createApi } from '../../dist/apps/api/src/server.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';
import { authenticatorCode, browser } from '../helpers/identity-fixtures.mjs';

export async function runStorageCases(t, admin, connection) {
  const roleNames = ['lde_storage_auth_test', 'lde_storage_app_test']; const pools = [];
  for (const [index, role] of roleNames.entries()) {
    await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT ${index === 0 ? 'lde_identity' : 'lde_runtime'} TO ${role}`);
    const url = new URL(connection); url.username = role;
    if (url.password) {
      const statement = await admin.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) AS sql', [role, decodeURIComponent(url.password)]);
      await admin.query(statement.rows[0].sql);
    }
    pools.push(new pg.Pool({ ...databaseConfig(url.toString(), { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), max: 3 }));
  }
  const [identityPool, runtimePool] = pools;
  t.after(async () => { for (const pool of pools) await pool.end(); for (const role of roleNames) await admin.query(`DROP ROLE ${role}`); });
  const directory = await mkdtemp(path.join(tmpdir(), 'lde-vault-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const keyPath = path.join(directory, 'keys.json'); const keyDocument = structuredClone(generateKeyDocument());
  const saveKeys = async () => writeFile(keyPath, JSON.stringify(keyDocument), { mode: 0o600 }); await saveKeys();
  const keys = new FileKeyProvider(keyPath); const store = new ProtectedObjectStore(runtimePool, keys);
  const logs = []; const mails = []; let identity; let objects;
  const server = createApi({ readiness: async () => ({ ready: true, reason: 'schema_compatible' }),
    identity: { handle: (...args) => identity.handle(...args) }, objects: { handle: (...args) => objects.handle(...args) } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  identity = await createIdentityRuntime({ pool: identityPool, runtimePool, config: { origin, secret: randomBytes(48).toString('base64url'), environment: 'test' }, sendMail: async (mail) => mails.push(mail) });
  objects = createObjectHttp(store, identity, origin, (line) => logs.push(JSON.parse(line)));
  const f = fixtureSet(uuid(91001), 92000); const other = fixtureSet(uuid(91002), 93000);
  for (const fixture of [f, other]) {
    await admin.query('INSERT INTO lde.tenants(id) VALUES($1)', [fixture.tenantId]);
    for (const item of fixture.created) await appendSnapshot(admin, item, { principalId: uuid(900), expectedRevision: 0, idempotencyKey: randomUUID() });
  }
  async function register(number, role) {
    await admin.query('DELETE FROM lde_auth."rateLimit"');
    const client = browser(origin); const email = `storage-${number}@example.invalid`; const password = 'Storage-Synthetic-Password-12345!';
    const created = await client.call('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: `Synthetic storage ${number}` } });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const mail = mails.find((item) => item.to === email && item.kind === 'verify-email'); const url = new URL(mail.url);
    await client.call(url.pathname + url.search);
    assert.equal((await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })).status, 200);
    if (role !== 'audience') {
      const enabled = await client.call('/api/auth/two-factor/enable', { method: 'POST', body: { password } }); assert.equal(enabled.status, 200);
      const verified = await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(enabled.data.totpURI) } }); assert.equal(verified.status, 200);
    }
    const principalId = created.data.user.id;
    await administerAccess(admin, 'membership', { principalId, tenantId: f.tenantId, status: 'active', expiresAt: null, reason: 'Synthetic storage fixture membership' });
    await administerAccess(admin, 'role', { principalId, tenantId: f.tenantId, eventId: f.eventId, role, expiresAt: null, revoked: 'no', reason: 'Synthetic scoped storage role' });
    const session = await identity.provider.api.getSession({ headers: new Headers({ cookie: client.jar.header() }) });
    return { client, principalId, token: session.session.token, sessionId: session.session.id };
  }
  const owner = await register(1, 'audience'); const outsider = await register(2, 'audience'); const producer = await register(3, 'producer'); const judge = await register(4, 'judge'); const finance = await register(5, 'finance');
  const worker = await administerAccess(admin, 'issue-service', { principalId: randomUUID(), tenantId: f.tenantId, eventId: f.eventId, profile: 'upload-scanner', actions: ['object.scan'], expiresAt: new Date(Date.now() + 600000).toISOString(), reason: 'Synthetic scoped quarantine processing' });
  const cleanFixture = { id: 'fixture-only-v1', scan: async () => ({ verdict: 'clean', engine: 'fixture-only-v1' }) };
  const rawUpload = (user, purpose, data, extra = {}) => fetch(`${origin}/api/tenants/${f.tenantId}/events/${f.eventId}/objects/${purpose}`, {
    method: 'POST', headers: { cookie: user.client.jar.header(), origin, 'content-type': 'text/plain', ...extra }, body: data });
  const objectPath = (id, operation, tenantId = f.tenantId) => `/api/tenants/${tenantId}/objects/${id}/${operation}`;
  let file; let ticket;
  await t.test('real upload is encrypted before durable storage and inaccessible until quarantine release', async () => {
    const response = await rawUpload(owner, 'identity-document', 'PRIVATE-STORAGE-FIXTURE'); assert.equal(response.status, 202); file = await response.json();
    assert.equal(file.state, 'quarantined');
    const row = (await admin.query('SELECT * FROM lde_storage.objects WHERE tenant_id=$1 AND id=$2', [f.tenantId, file.objectId])).rows[0];
    assert.ok(!JSON.stringify(row).includes('PRIVATE-STORAGE-FIXTURE')); assert.equal(row.owner_id, owner.principalId);
    assert.equal((await owner.client.call(objectPath(file.objectId, 'status'))).data.state, 'quarantined');
    assert.equal((await owner.client.call(objectPath(file.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    await assert.rejects(runtimePool.query('SELECT * FROM lde_storage.objects'), (error) => error.code === '42501');
    await assert.rejects(identityPool.query('SELECT * FROM lde_storage.objects'), (error) => error.code === '42501');
  });
  await t.test('only a scoped scanner releases immutable bytes; scanner outages preserve quarantine', async () => {
    await assert.rejects(store.scan(producer.token, f.tenantId, file.objectId, cleanFixture));
    assert.equal(await store.scan(worker.credential, f.tenantId, file.objectId, { id: 'unavailable-fixture', scan: async () => { throw new Error('private scanner error must not leak'); } }), 'quarantined');
    assert.equal(await store.scan(worker.credential, f.tenantId, file.objectId, cleanFixture), 'released');
    const link = await owner.client.call(objectPath(file.objectId, 'ticket'), { method: 'POST', body: {} }); assert.equal(link.status, 200, JSON.stringify(link.data)); ticket = link.data.ticket;
    const download = await fetch(`${origin}${objectPath(file.objectId, 'content')}?ticket=${ticket}`, { headers: { cookie: owner.client.jar.header() } });
    assert.equal(download.status, 200); assert.equal(await download.text(), 'PRIVATE-STORAGE-FIXTURE');
    assert.match(download.headers.get('content-disposition'), /^attachment/); assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  });
  await t.test('links are not bearer authority; wrong session, actor, object, tenant and revoked membership fail', async () => {
    assert.equal((await fetch(`${origin}${objectPath(file.objectId, 'content')}?ticket=${ticket}`)).status, 401);
    assert.equal((await outsider.client.call(`${objectPath(file.objectId, 'content')}?ticket=${ticket}`)).status, 404);
    assert.equal((await producer.client.call(objectPath(file.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    assert.equal((await owner.client.call(`${objectPath(file.objectId, 'content', other.tenantId)}?ticket=${ticket}`)).status, 404);
    assert.equal((await owner.client.call(`${objectPath(randomUUID(), 'content')}?ticket=${ticket}`)).status, 404);
    await administerAccess(admin, 'membership', { principalId: owner.principalId, tenantId: f.tenantId, status: 'revoked', expiresAt: null, reason: 'Synthetic immediate object access revocation' });
    assert.equal((await owner.client.call(`${objectPath(file.objectId, 'content')}?ticket=${ticket}`)).status, 404);
    await administerAccess(admin, 'membership', { principalId: owner.principalId, tenantId: f.tenantId, status: 'active', expiresAt: null, reason: 'Synthetic fixture membership restoration' });
  });
  await t.test('own judge notes and financial access remain separate from production authority', async () => {
    const note = await (await rawUpload(judge, 'judge-note', 'JUDGE-PRIVATE-FIXTURE')).json();
    await store.scan(worker.credential, f.tenantId, note.objectId, cleanFixture);
    assert.equal((await judge.client.call(objectPath(note.objectId, 'ticket'), { method: 'POST', body: {} })).status, 200);
    assert.equal((await producer.client.call(objectPath(note.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    assert.equal((await finance.client.call(objectPath(note.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    const financial = await (await rawUpload(owner, 'finance-document', 'FINANCIAL-PRIVATE-FIXTURE')).json();
    await store.scan(worker.credential, f.tenantId, financial.objectId, cleanFixture);
    assert.equal((await finance.client.call(objectPath(financial.objectId, 'ticket'), { method: 'POST', body: {} })).status, 200);
    assert.equal((await producer.client.call(objectPath(financial.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    assert.equal((await rawUpload(owner, 'production-asset', 'Unauthorized media')).status, 404);
    assert.equal((await rawUpload(producer, 'sealed-ballot', 'Not a ballot upload route')).status, 400);
  });
  await t.test('rejected files and stale scanner results cannot become released', async () => {
    const item = await (await rawUpload(owner, 'identity-document', 'REJECTED-FIXTURE')).json();
    assert.equal(await store.scan(worker.credential, f.tenantId, item.objectId, { id: 'fixture-rejected', scan: async () => ({ verdict: 'rejected', engine: 'fixture-rejected' }) }), 'rejected');
    await assert.rejects(store.scan(worker.credential, f.tenantId, item.objectId, cleanFixture));
    assert.equal((await owner.client.call(objectPath(item.objectId, 'ticket'), { method: 'POST', body: {} })).status, 404);
    const race = await (await rawUpload(owner, 'identity-document', 'RACE-FIXTURE')).json();
    await assert.rejects(store.scan(worker.credential, f.tenantId, race.objectId, { id: 'revocation-race', scan: async () => {
      await store.revoke(owner.token, f.tenantId, race.objectId); return { verdict: 'clean', engine: 'revocation-race' };
    } }));
    assert.equal((await store.status(owner.token, f.tenantId, race.objectId)).state, 'revoked');
  });
  await t.test('rotation requires operator authority and invalidates prior links without changing content', async () => {
    await assert.rejects(rotateObjectKey(runtimePool, keys, f.tenantId, file.objectId, 'Unauthorized rotation fixture'));
    const old = keyDocument.keys.find((key) => key.purpose === 'identity-document'); old.status = 'decrypt-only';
    keyDocument.keys.push({ ...old, id: 'identity-test-rotation-v2', status: 'active', material: randomBytes(32).toString('base64url') }); await saveKeys();
    await rotateObjectKey(admin, keys, f.tenantId, file.objectId, 'Synthetic planned key rollover');
    assert.equal((await owner.client.call(`${objectPath(file.objectId, 'content')}?ticket=${ticket}`)).status, 404);
    const next = await store.issueDownload(owner.token, f.tenantId, file.objectId); assert.equal((await store.download(owner.token, f.tenantId, file.objectId, next)).bytes.toString(), 'PRIVATE-STORAGE-FIXTURE');
    keyDocument.keys.find((key) => key.id === 'identity-test-rotation-v2').status = 'revoked'; await saveKeys();
    await assert.rejects(store.download(owner.token, f.tenantId, file.objectId, next));
    keyDocument.keys.find((key) => key.id === 'identity-test-rotation-v2').status = 'active'; await saveKeys();
  });
  await t.test('CSRF, oversized upload, type tricks and session revocation are enforced through actual HTTP', async () => {
    assert.equal((await rawUpload(owner, 'identity-document', 'blocked', { origin: 'https://attacker.example' })).status, 403);
    assert.equal((await rawUpload(owner, 'identity-document', Buffer.alloc(1048577))).status, 413);
    assert.equal((await rawUpload(owner, 'identity-document', 'blocked', { 'content-encoding': 'gzip' })).status, 415);
    assert.equal((await rawUpload(owner, 'identity-document', 'blocked', { 'content-type': 'text/html' })).status, 400);
    const issued = await store.issueDownload(owner.token, f.tenantId, file.objectId);
    await identity.provider.api.revokeSession({ headers: new Headers({ cookie: owner.client.jar.header() }), body: { token: owner.token } });
    assert.equal((await owner.client.call(`${objectPath(file.objectId, 'content')}?ticket=${issued}`)).status, 401);
    assert.equal((await runtimePool.query("SELECT current_setting('lde.credential',true) AS value")).rows[0].value ?? '', '');
  });
  await t.test('database enforces ciphertext-size quotas and rejects hidden envelope payloads', async () => {
    const context = { version: 1, tenantId: f.tenantId, eventId: f.eventId, objectId: randomUUID(), ownerId: outsider.principalId, purpose: 'identity-document', contentType: 'text/plain', byteLength: 1 };
    const envelope = { version: 1, algorithm: 'A256GCM-envelope-v1', keyId: 'identity-document-v1', payload: { iv: 'A'.repeat(16), tag: 'A'.repeat(22), ciphertext: 'A'.repeat(300) }, wrappedKey: { iv: 'A'.repeat(16), tag: 'A'.repeat(22), ciphertext: 'A'.repeat(43) } };
    await assert.rejects(withCredential(runtimePool, outsider.token, (client) => client.query('SELECT lde_storage.put_object($1,$2)', [JSON.stringify(context), JSON.stringify(envelope)])), (error) => error.code === '23514');
    envelope.payload.ciphertext = 'AA'; envelope.extraPayload = 'Hidden data outside measured bytes';
    await assert.rejects(withCredential(runtimePool, outsider.token, (client) => client.query('SELECT lde_storage.put_object($1,$2)', [JSON.stringify(context), JSON.stringify(envelope)])), (error) => error.code === '23514');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM lde_storage.objects WHERE tenant_id=$1 AND id=$2', [f.tenantId, context.objectId])).rows[0].n, 0);
  });
  await t.test('audits are durable and immutable; safe application logs exclude payloads and tickets', async () => {
    const audit = await admin.query('SELECT * FROM lde_storage.audit WHERE tenant_id=$1 ORDER BY id', [f.tenantId]);
    for (const op of ['uploaded', 'scan-unavailable', 'scan-clean', 'ticket-issued', 'read', 'revoked', 'key-rotated']) assert.ok(audit.rows.some((row) => row.operation === op), op);
    assert.ok(audit.rows.every((row) => row.database_actor));
    await assert.rejects(admin.query('DELETE FROM lde_storage.audit'), (error) => error.code === '55000');
    await assert.rejects(withCredential(runtimePool, producer.token, (client) => client.query('SELECT * FROM lde_storage.audit')), (error) => error.code === '42501');
    const encoded = JSON.stringify(logs); for (const secret of ['PRIVATE-STORAGE-FIXTURE', 'JUDGE-PRIVATE-FIXTURE', 'FINANCIAL-PRIVATE-FIXTURE', ticket, owner.token]) assert.ok(!encoded.includes(secret));
    assert.ok(logs.every((row) => Object.keys(row).sort().join(',') === 'event,requestId,result,status'));
  });
}
