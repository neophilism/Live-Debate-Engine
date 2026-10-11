import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import axe from 'axe-core';
import { uiFixture } from '../helpers/ui-fixture.mjs';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';
import { authenticatorCode, browser as httpBrowser } from '../helpers/identity-fixtures.mjs';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, timeout = 8000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await pause(30); } throw new Error('Expected UI state was not reached'); }
async function visible(page, text) { await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible' }); }
async function audit(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  assert.deepEqual(result.violations.map((row) => ({ id: row.id, nodes: row.nodes.map((node) => node.target) })), []);
}

test('real browser account, security, scoped workspaces and protected files under two neutral brands', { timeout: 180000 }, async (t) => {
  const f = await uiFixture(t); const { origin, identity } = await f.start('forum-house');
  const runtime = await chromium.launch({ headless: true, ...(process.env.LDE_CHROMIUM_PATH ? { executablePath: process.env.LDE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  t.after(() => runtime.close());
  const context = await runtime.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const page = await context.newPage();
  page.setDefaultTimeout(8000); const failures = []; page.on('pageerror', (error) => failures.push(error.message));
  const email = 'interface-owner@example.invalid'; let password = 'Synthetic-Interface-Password-12345!'; let principalId; let secret; let fileId;
  const fixture = fixtureSet(uuid(740001), 750000); const other = fixtureSet(uuid(740002), 760000);
  for (const scope of [fixture, other]) { await f.admin.query('INSERT INTO lde.tenants(id) VALUES($1)', [scope.tenantId]); for (const snapshot of scope.created) await appendSnapshot(f.admin, snapshot, { principalId: uuid(900), expectedRevision: 0, idempotencyKey: randomUUID() }); }
  await mkdir('artifacts/ui', { recursive: true });

  // Fail immediately when the browser cannot reach the local test server; do not cascade setup failures.
  await page.goto(origin);
  await t.test('public UI uses strict local assets, keyboard entry and accessible labels', async () => {
    await page.goto(origin); await page.getByRole('link', { name: 'Forum House Competition workspace home' }).waitFor();
    await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').innerText(), 'Skip to content');
    await page.keyboard.press('Enter'); assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content');
    await audit(page); await page.screenshot({ path: 'artifacts/ui/forum-home.png', fullPage: true });
    const html = await fetch(origin); const body = await html.text(); assert.match(html.headers.get('content-security-policy'), /script-src 'self'/); assert.ok(!body.includes('unsafe-inline'));
    for (const target of ['/assets/app.js.map', '/assets/../../.env', '/assets/%2e%2e%2f.env', '/assets/app.js?token=x']) { const response = await fetch(`${origin}${target}`); assert.equal(response.status, 404, target); }
    assert.equal((await fetch(`${origin}/api/workspaces`)).status, 401);
    assert.equal((await fetch(`${origin}/api/interface?brand=civic-exchange`)).status, 400);
    const source = await (await fetch(`${origin}/assets/app.js`)).text(); assert.ok(!source.includes('PRIVATE-STORAGE-FIXTURE'));
  });
  await t.test('keyboard-accessible registration performs real email verification and login', async () => {
    await page.getByRole('link', { name: 'Create an account', exact: true }).click();
    assert.equal(await page.locator(':focus').getAttribute('id'), 'page-title');
    await audit(page); await page.getByLabel('Your name', { exact: true }).fill('Synthetic Interface Owner');
    await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click(); await visible(page, 'Check your inbox for a verification link.');
    const mail = await until(() => f.mails.find((item) => item.to === email && item.kind === 'verify-email'));
    await page.goto(mail.url); await page.getByRole('heading', { name: 'Welcome back', level: 1 }).waitFor();
    await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await visible(page, 'No accessible events yet');
    principalId = (await f.admin.query('SELECT id FROM lde_auth."user" WHERE email=$1', [email])).rows[0].id;
    await administerAccess(f.admin, 'membership', { principalId, tenantId: fixture.tenantId, status: 'active', expiresAt: null, reason: 'Synthetic interface membership' });
    await administerAccess(f.admin, 'role', { principalId, tenantId: fixture.tenantId, eventId: fixture.eventId, role: 'producer', expiresAt: null, revoked: 'no', reason: 'Synthetic interface producer assignment' });
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click(); await visible(page, 'No accessible events yet');
    const cookies = await context.cookies(); assert.ok(cookies.filter((item) => item.name.includes('session_token')).every((item) => item.httpOnly));
    assert.equal(await page.evaluate(() => localStorage.length), 0); assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  });
  await t.test('authenticator enrollment grants only verified current-session staff access', async () => {
    await page.getByRole('link', { name: 'Account security', exact: true }).click(); await page.getByLabel('Confirm password to enroll').waitFor();
    await page.getByLabel('Confirm password to enroll').fill(password); await page.getByRole('button', { name: 'Set up authenticator' }).click();
    await page.getByLabel('Authenticator setup key').waitFor(); secret = await page.getByLabel('Authenticator setup key').inputValue();
    assert.match(secret, /^[A-Z2-7]+$/i); assert.ok((await page.getByLabel('Single-use recovery codes').inputValue()).length > 20);
    await audit(page);
    await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(`otpauth://totp/test?secret=${secret}`)); await page.getByRole('button', { name: 'Verify authenticator', exact: true }).click();
    await page.getByRole('button', { name: 'I saved my recovery codes' }).click(); await visible(page, 'An authenticator is enrolled');
    assert.equal(await page.getByLabel('Authenticator setup key').count(), 0);
    await page.getByRole('link', { name: 'Workspace', exact: true }).click(); await page.getByRole('link', { name: 'Open preparation files', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open preparation files', exact: true }).count(), 1);
    await audit(page); await page.screenshot({ path: 'artifacts/ui/forum-workspace.png', fullPage: true });
    const events = await page.evaluate(async () => (await fetch('/api/workspaces')).json()); assert.equal(events.items.length, 1); assert.equal(events.items[0].tenantId, fixture.tenantId);
  });
  await t.test('real upload, quarantined state, authorized scan and download flow work through UI', async () => {
    await page.getByRole('link', { name: 'Open preparation files', exact: true }).click(); await page.getByLabel('Choose a document').waitFor();
    await page.getByLabel('Document purpose', { exact: true }).selectOption('production-asset');
    await page.getByLabel('Choose a document').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic browser-file contents, not real personal information.') });
    await page.getByRole('button', { name: 'Upload document' }).click(); await visible(page, 'Document accepted into quarantine.'); await visible(page, 'Awaiting safety check');
    const row = (await f.admin.query('SELECT id FROM lde_storage.objects WHERE tenant_id=$1 AND owner_id=$2', [fixture.tenantId, principalId])).rows[0]; fileId = row.id;
    assert.equal(await page.getByRole('button', { name: new RegExp(`Download Production asset ${fileId.slice(-8)}`) }).isDisabled(), true);
    const service = await administerAccess(f.admin, 'issue-service', { principalId: randomUUID(), tenantId: fixture.tenantId, eventId: fixture.eventId, profile: 'upload-scanner', actions: ['object.scan'], expiresAt: new Date(Date.now() + 600000).toISOString(), reason: 'Synthetic browser scanner fixture' });
    assert.equal(await f.store.scan(service.credential, fixture.tenantId, fileId, { id: 'fixture-not-live-antivirus', scan: async () => ({ verdict: 'clean', engine: 'fixture-not-live-antivirus' }) }), 'released');
    await page.getByRole('button', { name: 'Refresh files', exact: true }).click(); await visible(page, 'Available');
    await audit(page); await page.screenshot({ path: 'artifacts/ui/forum-files.png', fullPage: true });
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: `Download Production asset ${fileId.slice(-8)}`, exact: true }).click(); const result = await download;
    assert.equal((await readFile(await result.path())).toString(), 'Synthetic browser-file contents, not real personal information.');
    const list = await page.evaluate(async ({ tenantId, eventId }) => (await fetch(`/api/tenants/${tenantId}/events/${eventId}/objects`)).json(), fixture);
    assert.equal(list.items.length, 1); assert.ok(!JSON.stringify(list).includes('envelope')); assert.ok(!JSON.stringify(list).includes('ciphertext'));
  });
  await t.test('file revocation dialog supports Escape, keyboard confirmation and retained state', async () => {
    const button = page.getByRole('button', { name: `Revoke Production asset ${fileId.slice(-8)}`, exact: true }); await button.click(); await page.getByRole('dialog').waitFor(); await audit(page);
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await button.evaluate((node) => document.activeElement === node), true);
    await button.click(); await page.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').innerText(), 'Revoke access'); await page.keyboard.press('Enter');
    await visible(page, 'File access revoked.'); await visible(page, 'Access revoked');
    assert.equal(await page.getByRole('button', { name: `Download Production asset ${fileId.slice(-8)}`, exact: true }).isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 }); await audit(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'artifacts/ui/forum-files-mobile.png', fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 });
  });
  await t.test('second browser must complete MFA; session revocation actually removes its access', async () => {
    await f.admin.query('DELETE FROM lde_auth."rateLimit"');
    const second = await runtime.newContext(); const p2 = await second.newPage();
    await p2.goto(`${origin}/sign-in`); await p2.getByLabel('Email address', { exact: true }).fill(email); await p2.getByLabel('Password', { exact: true }).fill(password); await p2.getByRole('button', { name: 'Sign in', exact: true }).click();
    await p2.getByRole('heading', { name: 'Verify your authenticator', level: 1 }).waitFor();
    await p2.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(`otpauth://totp/test?secret=${secret}`)); await p2.getByRole('button', { name: 'Verify code' }).click(); await p2.getByRole('link', { name: 'Open preparation files' }).waitFor();
    await page.getByRole('link', { name: 'Account security', exact: true }).click(); await page.getByRole('button', { name: /End session / }).waitFor();
    await page.getByRole('button', { name: /End session / }).click(); await page.getByRole('dialog').getByRole('button', { name: 'End session', exact: true }).click();
    await until(async () => !(await page.getByRole('dialog').count()));
    assert.equal(await p2.evaluate(async () => (await fetch('/api/session')).status), 401); await second.close();
    await audit(page); await page.screenshot({ path: 'artifacts/ui/forum-security.png', fullPage: true });
  });
  await t.test('password recovery UI scrubs URL token and revokes previous sessions', async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByRole('button', { name: 'Request reset link' }).click(); await visible(page, 'If an eligible account exists');
    const mail = await until(() => f.mails.find((item) => item.to === email && item.kind === 'reset-password')); await page.goto(mail.url); await page.getByLabel('New password', { exact: true }).waitFor();
    assert.ok(!page.url().includes('token=')); await audit(page);
    password = 'A-New-Synthetic-Interface-Password-54321!'; await page.getByLabel('New password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Save new password' }).click(); await visible(page, 'Your password was changed.');
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM lde_auth.session WHERE "userId"=$1', [principalId])).rows[0].n, 0);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  });
  await t.test('another neutral brand uses exactly the same bundle and passes mobile/keyboard checks', async () => {
    const civic = await f.start('civic-exchange'); const separate = await runtime.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const p = await separate.newPage();
    await p.goto(civic.origin); await p.getByRole('link', { name: 'Civic Exchange Competition workspace home' }).waitFor(); await audit(p);
    assert.ok(!(await p.locator('body').innerText()).includes('Forum House')); assert.ok(!(await p.locator('body').innerText()).includes('UBC'));
    const [one, two] = await Promise.all([fetch(`${origin}/assets/app.js`).then((v) => v.text()), fetch(`${civic.origin}/assets/app.js`).then((v) => v.text())]); assert.equal(one, two);
    await p.keyboard.press('Tab'); assert.equal(await p.locator(':focus').innerText(), 'Skip to content'); await p.keyboard.press('Enter');
    await p.screenshot({ path: 'artifacts/ui/civic-home-mobile.png', fullPage: true });
    await p.getByRole('link', { name: 'Create an account', exact: true }).click(); await audit(p); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await p.emulateMedia({ forcedColors: 'active' }); await p.screenshot({ path: 'artifacts/ui/civic-register-forced-colors.png', fullPage: true }); await separate.close();
  });
  await t.test('metadata endpoints deny unrelated accounts and reject cursor/host selection tricks', async () => {
    await f.admin.query('DELETE FROM lde_auth."rateLimit"'); const outsider = httpBrowser(origin); const mailAddress = 'interface-outsider@example.invalid';
    await outsider.call('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Synthetic outsider', email: mailAddress, password } });
    const mail = await until(() => f.mails.find((item) => item.to === mailAddress && item.kind === 'verify-email')); const uri = new URL(mail.url); await outsider.call(uri.pathname + uri.search);
    await outsider.call('/api/auth/sign-in/email', { method: 'POST', body: { email: mailAddress, password } });
    assert.deepEqual((await outsider.call('/api/workspaces')).data.items, []);
    assert.equal((await outsider.call(`/api/tenants/${fixture.tenantId}/events/${fixture.eventId}/objects`)).status, 403);
    assert.equal((await outsider.call('/api/workspaces?after=bad')).status, 400);
    assert.equal((await outsider.call('/api/workspaces?after=a&after=b')).status, 400);
    const session = await identity.provider.api.getSession({ headers: new Headers({ cookie: outsider.jar.header() }) }); assert.ok(session);
    assert.deepEqual(failures, []);
  });
});
