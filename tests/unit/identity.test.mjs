import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, stat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { identityConfig } from '../../dist/packages/identity/src/config.js';
import { identityMailer } from '../../dist/packages/identity/src/mail.js';

const secret = randomBytes(48).toString('base64url');
const config = identityConfig('https://debates.example', secret, 'production');
const message = { to: 'fixture@example.invalid', kind: 'verify-email', url: 'https://debates.example/api/auth/verify-email?token=synthetic-test-only' };
test('identity configuration requires a canonical secure origin and sufficient secret material', () => {
  assert.ok(Object.isFrozen(config));
  for (const value of ['http://debates.example', 'https://debates.example/', 'https://user:password@debates.example', 'https://debates.example?x=1', 'https://debates.example#x', '//example']) assert.throws(() => identityConfig(value, secret, 'production'));
  for (const value of ['', 'abc', 'A'.repeat(64), `${secret}\n`]) assert.throws(() => identityConfig(config.origin, value, 'production'));
  assert.throws(() => identityConfig('http://127.0.0.1:3000', secret, 'production'));
  assert.equal(identityConfig('http://127.0.0.1:3000', secret, 'development').origin, 'http://127.0.0.1:3000');
});
test('mail modes are explicit and local file delivery cannot be enabled on production/public origins', () => {
  for (const env of [{}, { LDE_IDENTITY_MAIL_MODE: 'local-file' }, { LDE_IDENTITY_MAIL_MODE: 'resend' }]) assert.throws(() => identityMailer(config, env));
  assert.throws(() => identityMailer(identityConfig('https://debates.example', secret, 'development'), { LDE_IDENTITY_MAIL_MODE: 'local-file' }));
});
test('fixed HTTPS mail transport uses bounded requests and stable idempotency without accepting arbitrary destinations', async () => {
  const calls = [];
  const deliver = identityMailer(config, { LDE_IDENTITY_MAIL_MODE: 'resend', RESEND_API_KEY: `re_${'t'.repeat(30)}`, LDE_IDENTITY_MAIL_FROM: 'debates@example.invalid' }, async (url, request) => { calls.push({ url, request }); return new Response('{}', { status: 200 }); });
  await deliver(message); await deliver(message);
  assert.equal(calls[0].url, 'https://api.resend.com/emails'); assert.equal(calls[0].request.redirect, 'error');
  assert.equal(calls[0].request.headers['idempotency-key'], calls[1].request.headers['idempotency-key']);
  assert.deepEqual(JSON.parse(calls[0].request.body).to, [message.to]); assert.ok(calls[0].request.signal);
  for (const invalid of [{ ...message, url: 'https://attacker.invalid/token' }, { ...message, to: 'recipient@example.invalid\r\nBcc:x@y.invalid' }, { ...message, kind: 'other' }]) await assert.rejects(deliver(invalid));
  assert.equal(calls.length, 2);
});
test('provider delivery failures do not expose tokens or provider response bodies', async () => {
  const deliver = identityMailer(config, { LDE_IDENTITY_MAIL_MODE: 'resend', RESEND_API_KEY: `re_${'t'.repeat(30)}`, LDE_IDENTITY_MAIL_FROM: 'debates@example.invalid' }, async () => new Response('private diagnostic', { status: 403 }));
  await assert.rejects(deliver(message), (error) => error.message === 'Identity mail delivery unavailable');
});
test('local messages are private files with opaque names and symlink destinations are refused', async (t) => {
  const initial = process.cwd(); const directory = await mkdtemp(path.join(tmpdir(), 'lde-mail-'));
  t.after(async () => { process.chdir(initial); await rm(directory, { recursive: true, force: true }); }); process.chdir(directory);
  const local = identityConfig('http://127.0.0.1:3000', secret, 'test');
  const deliver = identityMailer(local, { LDE_IDENTITY_MAIL_MODE: 'local-file' });
  const localMessage = { ...message, url: 'http://127.0.0.1:3000/reset-password?token=synthetic' };
  await deliver(localMessage);
  const files = await readdir('.lde-mail'); assert.equal(files.length, 1); assert.doesNotMatch(files[0], /fixture|synthetic/);
  assert.deepEqual(JSON.parse(await readFile(path.join('.lde-mail', files[0]), 'utf8')), localMessage);
  if (process.platform !== 'win32') {
    assert.equal((await stat('.lde-mail')).mode & 0o777, 0o700); assert.equal((await stat(path.join('.lde-mail', files[0]))).mode & 0o777, 0o600);
    await rm('.lde-mail', { recursive: true }); await symlink(tmpdir(), '.lde-mail'); await assert.rejects(deliver(localMessage));
  }
});
