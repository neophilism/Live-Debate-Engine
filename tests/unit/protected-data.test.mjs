import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sealObject, openObject, rewrapObject, MAX_OBJECT_BYTES, ProtectedDataError } from '../../dist/packages/security/src/envelope.js';
import { FileKeyProvider, generateKeyDocument, parseKeys } from '../../dist/packages/security/src/keys.js';
import { issueTicket, verifyTicket } from '../../dist/packages/security/src/tickets.js';
import { securityLogLine } from '../../dist/packages/security/src/logging.js';
import { matchesDeclaredType, ClamAvScanner } from '../../dist/packages/security/src/uploads.js';
import { createServer } from 'node:net';
import { once } from 'node:events';

const context = (bytes) => ({ version: 1, tenantId: randomUUID(), eventId: randomUUID(), objectId: randomUUID(), ownerId: randomUUID(), purpose: 'identity-document', contentType: 'text/plain', byteLength: bytes.length });
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lde-keys-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'keys.json'); const document = structuredClone(generateKeyDocument());
  const save = async () => writeFile(file, JSON.stringify(document), { mode: 0o600 }); await save();
  return { directory, file, document, save, keys: new FileKeyProvider(file) };
}
test('purpose-bound envelope has randomized authenticated encryption and no plaintext', async (t) => {
  const { keys } = await fixture(t); const bytes = Buffer.from('Private synthetic identity detail'); const scope = context(bytes);
  const encrypted = await sealObject(bytes, scope, keys); const second = await sealObject(bytes, scope, keys);
  assert.notEqual(encrypted.payload.iv, second.payload.iv); assert.notEqual(encrypted.payload.ciphertext, second.payload.ciphertext);
  assert.ok(!JSON.stringify(encrypted).includes(bytes.toString()));
  assert.deepEqual(await openObject(encrypted, scope, keys), bytes);
});
test('all metadata substitution and ciphertext/tag/wrap tampering fails authentication', async (t) => {
  const { keys } = await fixture(t); const bytes = Buffer.from('synthetic protected text'); const scope = context(bytes); const encrypted = await sealObject(bytes, scope, keys);
  for (const change of [{ tenantId: randomUUID() }, { eventId: randomUUID() }, { ownerId: randomUUID() }, { objectId: randomUUID() }, { purpose: 'finance-document' }, { contentType: 'application/pdf' }, { byteLength: bytes.length - 1 }]) {
    await assert.rejects(openObject(encrypted, { ...scope, ...change }, keys), ProtectedDataError);
  }
  for (const section of ['payload', 'wrappedKey']) for (const field of ['iv', 'tag', 'ciphertext']) {
    const altered = structuredClone(encrypted); const packet = altered[section][field];
    altered[section][field] = (packet[0] === 'A' ? 'B' : 'A') + packet.slice(1);
    await assert.rejects(openObject(altered, scope, keys), ProtectedDataError);
  }
});
test('key retirement allows migration; rotation authenticates and revocation blocks old ciphertext immediately', async (t) => {
  const { keys, document, save } = await fixture(t); const bytes = Buffer.from('key rotation fixture'); const scope = context(bytes);
  const encrypted = await sealObject(bytes, scope, keys); const old = document.keys.find((key) => key.purpose === scope.purpose);
  old.status = 'decrypt-only'; document.keys.push({ ...old, id: 'identity-v2', status: 'active', material: randomBytes(32).toString('base64url') }); await save();
  const rotated = await rewrapObject(encrypted, scope, keys); assert.equal(rotated.keyId, 'identity-v2'); assert.deepEqual(rotated.payload, encrypted.payload);
  old.status = 'revoked'; await save(); await assert.rejects(openObject(encrypted, scope, keys), ProtectedDataError);
  assert.deepEqual(await openObject(rotated, scope, keys), bytes);
  assert.deepEqual(await openObject(await sealObject(bytes, scope, keys), scope, keys), bytes);
});
test('unknown keys, reused material, duplicate active keys and non-private/symlink keyfiles fail closed', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.keys.resolve('finance-document', 'identity-document-v1'), ProtectedDataError);
  const duplicate = structuredClone(f.document); duplicate.keys[1].material = duplicate.keys[0].material;
  assert.throws(() => parseKeys(duplicate));
  const active = structuredClone(f.document); active.keys.push({ ...active.keys[0], id: 'new-duplicate', material: randomBytes(32).toString('base64url') });
  assert.throws(() => parseKeys(active));
  await chmod(f.file, 0o644); await assert.rejects(f.keys.active('identity-document'), ProtectedDataError); await chmod(f.file, 0o600);
  const link = path.join(f.directory, 'link.json'); await symlink(f.file, link); await assert.rejects(new FileKeyProvider(link).active('identity-document'), ProtectedDataError);
  await writeFile(f.file, '{"private":"unparseable'); await assert.rejects(f.keys.active('identity-document'), ProtectedDataError);
});
test('size bounds and strict serialization reject malformed envelopes', async (t) => {
  const { keys } = await fixture(t); const bytes = Buffer.alloc(MAX_OBJECT_BYTES, 65); const scope = context(bytes);
  const encrypted = await sealObject(bytes, scope, keys); assert.deepEqual(await openObject(encrypted, scope, keys), bytes);
  await assert.rejects(sealObject(Buffer.alloc(MAX_OBJECT_BYTES + 1), { ...scope, byteLength: MAX_OBJECT_BYTES + 1 }, keys));
  await assert.rejects(openObject({ ...encrypted, grant: 'public' }, scope, keys));
  await assert.rejects(openObject({ ...encrypted, payload: { ...encrypted.payload, ciphertext: '====' } }, scope, keys));
});
test('asset tickets bind session, tenant, object and generation; expire, authenticate and revoke', async (t) => {
  const { keys, document, save } = await fixture(t); const now = Date.now();
  const claims = { version: 1, purpose: 'asset-download', objectId: randomUUID(), tenantId: randomUUID(), eventId: randomUUID(), principalId: randomUUID(), sessionId: randomUUID(), epoch: 1, generation: 2, issuedAt: now, expiresAt: now + 60000 };
  const token = await issueTicket(claims, now, keys); assert.deepEqual(await verifyTicket(token, now, keys), claims);
  await assert.rejects(verifyTicket(token, now + 60000, keys)); await assert.rejects(verifyTicket(token, now - 1, keys));
  await assert.rejects(issueTicket({ ...claims, expiresAt: now + 60001 }, now, keys));
  const pieces = token.split('.'); pieces[2] = Buffer.from(JSON.stringify({ ...claims, principalId: randomUUID() })).toString('base64url');
  await assert.rejects(verifyTicket(pieces.join('.'), now, keys));
  document.keys.find((key) => key.purpose === 'asset-ticket').status = 'revoked'; await save(); await assert.rejects(verifyTicket(token, now, keys));
});
test('logs allow only bounded safe fields and never accept arbitrary errors or URLs', () => {
  const event = { event: 'protected-object-request', requestId: randomUUID(), status: 403, result: 'denied' };
  assert.deepEqual(JSON.parse(securityLogLine(event)), event);
  for (const key of ['error', 'url', 'ticket', 'credential', 'body', 'email', 'filename']) assert.throws(() => securityLogLine({ ...event, [key]: 'secret' }));
});
test('declared content types are bounded and checked, not trusted by extension', () => {
  assert.equal(matchesDeclaredType(Buffer.from('hello'), 'text/plain'), true);
  assert.equal(matchesDeclaredType(Buffer.from('{"ok":1}'), 'application/json'), true);
  assert.equal(matchesDeclaredType(Buffer.from('not-json'), 'application/json'), false);
  assert.equal(matchesDeclaredType(Buffer.from('<script>fake image</script>'), 'image/png'), false);
  assert.equal(matchesDeclaredType(Buffer.from([255, 0, 1]), 'text/plain'), false);
  assert.equal(matchesDeclaredType(Buffer.alloc(0), 'text/plain'), false);
});
test('ClamAV adapter streams framed bytes and only explicit clean responses release content', async (t) => {
  const f = await fixture(t); const socketPath = path.join(f.directory, 'scan.sock'); let mode = 'clean'; let observed;
  const server = createServer((socket) => {
    let received = Buffer.alloc(0);
    socket.on('data', (part) => {
      received = Buffer.concat([received, part]);
      if (received.equals(Buffer.from('zVERSION\0'))) { socket.end('ClamAV 1.4.3/27000/Sun Oct 11 00:00:00 2026\0'); return; }
      const header = Buffer.from('zINSTREAM\0'); if (!received.subarray(0, header.length).equals(header)) return;
      const chunks = []; let offset = header.length;
      while (offset + 4 <= received.length) {
        const length = received.readUInt32BE(offset); offset += 4;
        if (length === 0) {
          observed = Buffer.concat(chunks);
          if (mode === 'timeout') return;
          if (mode === 'two-records') { socket.write('stream: OK\0'); setTimeout(() => socket.end('stream: Synthetic.Test FOUND\0'), 5); return; }
          socket.end(mode === 'clean' ? 'stream: OK\0' : mode === 'rejected' ? 'stream: Synthetic.Test FOUND\0' : 'stream: error\0'); return;
        }
        if (offset + length > received.length) return;
        chunks.push(received.subarray(offset, offset + length)); offset += length;
      }
    });
  });
  server.listen(socketPath); await once(server, 'listening'); t.after(() => new Promise((resolve) => server.close(resolve)));
  const scanner = new ClamAvScanner(socketPath, 100); const bytes = Buffer.from('synthetic stream protocol fixture');
  assert.equal((await scanner.scan(bytes, 'text/plain')).verdict, 'clean'); assert.deepEqual(observed, bytes);
  mode = 'rejected'; assert.equal((await scanner.scan(bytes, 'text/plain')).verdict, 'rejected');
  mode = 'invalid'; assert.equal((await scanner.scan(bytes, 'text/plain')).verdict, 'unavailable');
  mode = 'two-records'; assert.equal((await scanner.scan(bytes, 'text/plain')).verdict, 'unavailable');
  mode = 'timeout'; assert.equal((await scanner.scan(bytes, 'text/plain')).verdict, 'unavailable');
  assert.equal((await new ClamAvScanner(path.join(f.directory, 'missing.sock')).scan(bytes, 'text/plain')).verdict, 'unavailable');
  assert.throws(() => new ClamAvScanner('https://attacker.example/scan'));
});
test('key management CLI preserves private files, rotates explicit purposes and never prints material', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(path.join(tmpdir(), 'lde-keycli-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'keys.json'); const script = new URL('../../dist/scripts/storage-admin.js', import.meta.url);
  const call = (...args) => spawnSync(process.execPath, [script.pathname, ...args], { env: { PATH: process.env.PATH, LDE_STORAGE_KEY_FILE: file }, encoding: 'utf8' });
  assert.equal(call('keys-init').status, 0); const { readFile, stat } = await import('node:fs/promises'); const initial = JSON.parse(await readFile(file, 'utf8'));
  assert.equal((await stat(file)).mode & 0o777, 0o600); assert.equal(call('keys-init').status, 1);
  const rotated = call('keys-rotate', 'finance-document'); assert.equal(rotated.status, 0, rotated.stderr);
  const next = JSON.parse(await readFile(file, 'utf8')); assert.equal(next.keys.length, initial.keys.length + 1);
  assert.equal(next.keys.find((key) => key.id === 'finance-document-v1').status, 'decrypt-only');
  assert.equal(call('keys-revoke', 'finance-document-v1').status, 0);
  const keys = new FileKeyProvider(file); await assert.rejects(keys.resolve('finance-document', 'finance-document-v1'));
  const active = await keys.active('finance-document'); assert.notEqual(active.id, 'finance-document-v1');
  for (const key of next.keys) assert.ok(!rotated.stdout.includes(key.material));
  assert.equal(call('keys-rotate', 'not-a-purpose').status, 1);
});
