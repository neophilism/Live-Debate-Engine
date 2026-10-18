import { administrationJourney } from './administration-cases.mjs';
import { AdministrationStore } from '../../dist/packages/competition/src/administration-store.js';
import { createAdministrationHttp } from '../../dist/packages/competition/src/administration-http.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';
import test from 'node:test';
import { runCompetitionBrowserCases } from './competition-cases.mjs';
import { CompetitionStore } from '../../dist/packages/competition/src/store.js';
import { createCompetitionHttp } from '../../dist/packages/competition/src/http.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { applyMigrations, loadMigrations } from '../../dist/packages/database/src/migrations.js';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { createIdentityRuntime } from '../../dist/packages/identity/src/http.js';
import { withCredential } from '../../dist/packages/identity/src/broker.js';
import { createUiRuntime } from '../../dist/packages/ui/src/http.js';
import { createApi } from '../../dist/apps/api/src/server.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';
import { authenticatorCode } from '../helpers/identity-fixtures.mjs';

const connection = process.env.TEST_DATABASE_URL;
if (!connection || process.env.NODE_ENV !== 'test') throw new Error('Browser integration requires disposable loopback lde_ci and NODE_ENV=test');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/lde_ci') throw new Error('Refusing browser integration setup outside local lde_ci');

async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), []);
}

test('Actual browser, identity, SQL and two-brand competition journeys', { timeout: 300000 }, async (t) => {
  const admin = new pg.Pool(databaseConfig(connection, { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }));
  const pools = []; const servers = []; let browser;
  const roles = ['lde_ui_identity', 'lde_ui_runtime'];
  t.after(async () => {
    await browser?.close();
    for (const { api, runtime } of servers) { await runtime.drain(); api.closeAllConnections(); await new Promise((resolve) => api.close(resolve)); }
    for (const pool of pools) await pool.end();
    for (const role of roles) await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  });
  await admin.query('DROP SCHEMA IF EXISTS lde_competition CASCADE; DROP SCHEMA IF EXISTS lde_storage CASCADE; DROP SCHEMA IF EXISTS lde_security CASCADE; DROP SCHEMA IF EXISTS lde_auth CASCADE; DROP SCHEMA IF EXISTS engine_meta CASCADE; DROP SCHEMA IF EXISTS lde CASCADE');
  await applyMigrations(admin, await loadMigrations());
  for (const [index, role] of roles.entries()) {
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT ${index === 0 ? 'lde_identity' : 'lde_runtime'} TO ${role}`);
    const url = new URL(connection); url.username = role;
    if (target.password) { const sql = await admin.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) AS sql', [role, decodeURIComponent(target.password)]); await admin.query(sql.rows[0].sql); }
    pools.push(new pg.Pool({ ...databaseConfig(url.toString(), { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), max: index === 0 ? 5 : 1 }));
  }
  async function serve(brand) {
    let runtime; let competition; let administration; const mail = []; const store = new CompetitionStore(pools[1]);
    const ui = await createUiRuntime(brand, true);
    const api = createApi({ ui, administration: { handle: (...args) => administration.handle(...args) }, readiness: async () => ({ ready: true, reason: 'schema_compatible' }), identity: { handle: async (...args) => runtime.handle(...args) }, competition: { handle: (...args) => competition.handle(...args) } });
    api.listen(0, '127.0.0.1'); await once(api, 'listening');
    const origin = `http://127.0.0.1:${api.address().port}`;
    runtime = await createIdentityRuntime({ pool: pools[0], runtimePool: pools[1], config: { origin, secret: randomBytes(48).toString('base64url'), environment: 'test' }, sendMail: async (message) => { mail.push(message); } });
    competition = createCompetitionHttp(store, runtime, origin, () => {});
    administration = createAdministrationHttp(new AdministrationStore(pools[1]), runtime, origin);
    const server = { api, runtime, origin, mail, store }; servers.push(server); return server;
  }
  const harbor = await serve('harbor'); const cedar = await serve('cedar');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/browser', { recursive: true });
  let principal; let secret;
  const email = 'ui-flow@example.invalid'; const password = 'Synthetic-UI-Password-123!';
  const f = fixtureSet(uuid(601), 6100);
  await admin.query('INSERT INTO lde.tenants(id) VALUES($1)', [f.tenantId]);
  for (const snapshot of f.created) await appendSnapshot(admin, snapshot, { idempotencyKey: randomUUID(), principalId: uuid(6900), expectedRevision: 0 });

  await t.test('two reference brands, secure asset delivery, mobile layout and component accessibility', async () => {
    for (const [server, name] of [[harbor, 'Harbor Forum'], [cedar, 'Cedar Assembly']]) {
      const response = await page.goto(server.origin); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make room for a better conversation.');
      assert.ok((await page.title()).includes(name)); assert.ok(response.headers()['content-security-policy'].includes("script-src 'self'"));
      assert.ok(!response.headers()['content-security-policy'].includes('unsafe-inline'));
      assert.equal(response.headers()['cache-control'], 'no-store');
      await audit(page); await page.screenshot({ path: `artifacts/browser/${server === harbor ? 'harbor' : 'cedar'}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 360, height: 800 }); await audit(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: `artifacts/browser/${server === harbor ? 'harbor' : 'cedar'}-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${server.origin}/components`); await expect(page.getByRole('timer')).toHaveText('00:30'); await audit(page);
      assert.equal((await page.request.get(`${server.origin}/assets/ui.js.map`)).status(), 404);
      assert.equal((await page.request.get(`${server.origin}/packages/identity/src/provider.ts`)).status(), 404);
    }
  });
  await t.test('keyboard skip link, labeled registration and explicit validation feedback', async () => {
    await page.goto(`${harbor.origin}/register`); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account');
    await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.locator('#main')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByLabel('Display name', { exact: true })).toBeFocused();
    await page.keyboard.type('Synthetic UI user'); await page.keyboard.press('Tab'); await page.keyboard.type(email);
    await page.keyboard.press('Tab'); await page.keyboard.type(password); await page.keyboard.press('Tab'); await page.keyboard.type(`${password}different`);
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Passwords do not match'); await expect(page.getByRole('alert')).toBeFocused();
    await audit(page); await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    assert.equal((await page.request.get(`${harbor.origin}/api/session`)).status(), 401);
    assert.equal((await page.request.get(`${harbor.origin}/api/workspaces`)).status(), 401);
  });
  await t.test('real email verification and sign-in create no implicit competition role', async () => {
    await harbor.runtime.drain(); const message = harbor.mail.find((item) => item.kind === 'verify-email' && item.to === email); assert.ok(message);
    await page.goto(message.url); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(`${harbor.origin}/app`);
    const session = await (await page.request.get(`${harbor.origin}/api/session`)).json(); principal = session.principalId; assert.equal(session.assurance, 'single-factor');
    await page.getByRole('link', { name: 'My workspaces', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No workspaces assigned' })).toBeVisible(); await audit(page);
  });
  await t.test('server-only assignments require MFA and do not expose another identity or tenant', async () => {
    await admin.query('INSERT INTO lde_security.memberships(tenant_id,principal_id) VALUES($1,$2)', [f.tenantId, principal]);
    await admin.query("INSERT INTO lde_security.role_grants(id,tenant_id,principal_id,event_id,role) VALUES($1,$2,$3,$4,'judge')", [randomUUID(), f.tenantId, principal, f.eventId]);
    await page.getByRole('button', { name: 'Refresh permissions' }).click(); await expect(page.getByText('Verification needed', { exact: true })).toBeVisible();
    const assignments = await (await page.request.get(`${harbor.origin}/api/workspaces?principalId=${uuid(1)}`)).json();
    assert.equal(assignments.workspaces.length, 1); assert.equal(assignments.workspaces[0].tenantId, f.tenantId); assert.deepEqual(assignments.workspaces[0].capabilities, []);
    await page.getByRole('link', { name: 'Open event', exact: false }).click(); await expect(page.getByRole('alert')).toContainText('not available');
    assert.equal((await page.request.get(`${harbor.origin}/api/tenants/${f.tenantId}/events/${f.eventId}/access`)).status(), 403);
  });
  await t.test('authenticator enrollment/challenge works through real browser forms without web-storage secrets', async () => {
    await page.goto(`${harbor.origin}/security`); const enrollment = page.getByRole('region', { name: 'Set up an authenticator', exact: true });
    await enrollment.getByLabel('Current password', { exact: true }).fill(password); await enrollment.getByRole('button', { name: 'Start authenticator setup' }).click();
    await expect(page.getByTestId('authenticator-secret')).toBeVisible(); secret = await page.getByTestId('authenticator-secret').innerText();
    assert.ok(/^[A-Z2-7]+$/.test(secret)); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(`otpauth://totp/Test?secret=${secret}`));
    await page.getByRole('button', { name: 'Verify authenticator', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Authenticator verified' })).toBeVisible(); await expect(page.getByTestId('authenticator-secret')).toHaveCount(0); await audit(page);
    await page.goto(`${harbor.origin}/workspaces`); await expect(page.getByText('Permission verified', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Open event', exact: false }).click(); await expect(page.getByRole('table')).toContainText('scorecard / read-own');
    await expect(page.getByRole('table')).not.toContainText('ballot / read-sealed'); await audit(page);
    await page.screenshot({ path: 'artifacts/browser/judge-workspace.png', fullPage: true });
  });
  await t.test('revocation is reflected immediately, not hidden by a UI refresh cache', async () => {
    await admin.query("UPDATE lde_security.memberships SET status='revoked' WHERE tenant_id=$1 AND principal_id=$2", [f.tenantId, principal]);
    await page.goto(`${harbor.origin}/workspaces`); await expect(page.getByRole('heading', { name: 'No workspaces assigned' })).toBeVisible();
    const cookies = await context.cookies(); const cookie = cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    const session = await harbor.runtime.provider.api.getSession({ headers: new Headers({ cookie }) });
    await withCredential(pools[1], session.session.token, async (client) => { assert.equal((await client.query('SELECT * FROM lde_security.my_workspaces()')).rowCount, 0); });
    await admin.query("UPDATE lde_security.memberships SET status='active' WHERE tenant_id=$1 AND principal_id=$2", [f.tenantId, principal]);
    await page.getByRole('button', { name: 'Refresh permissions' }).click(); await expect(page.getByText('Permission verified', { exact: true })).toBeVisible();
  });
  await t.test('failure feedback does not fabricate an empty or successful workspace', async () => {
    await page.route('**/api/workspaces*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
    await page.reload(); await expect(page.getByRole('alert')).toContainText('temporarily unavailable'); await expect(page.getByRole('heading', { name: 'No workspaces assigned' })).toHaveCount(0); await audit(page);
    await page.unroute('**/api/workspaces*');
  });
  await t.test('session revocation and fresh sign-in challenge work without exposing raw credentials', async () => {
    await admin.query('DELETE FROM lde_auth."rateLimit"');
    await page.goto(`${harbor.origin}/security`); await page.getByRole('button', { name: 'End this session', exact: true }).click(); await expect(page).toHaveURL(`${harbor.origin}/sign-in`);
    assert.equal((await page.request.get(`${harbor.origin}/api/workspaces`)).status(), 401);
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verify your sign-in');
    await page.getByLabel('Authenticator code').fill(authenticatorCode(`otpauth://totp/Test?secret=${secret}`)); await page.getByRole('button', { name: 'Verify sign-in', exact: true }).click(); await expect(page).toHaveURL(`${harbor.origin}/app`);
    const session = await (await page.request.get(`${harbor.origin}/api/session`)).json(); assert.equal(Object.hasOwn(session, 'token'), false); assert.equal(session.assurance, 'mfa');
  });
  await t.test('password reset uses its real private link, clears it from address bar and revokes old sessions', async () => {
    await admin.query('DELETE FROM lde_auth."rateLimit"'); await page.goto(`${harbor.origin}/reset-request`);
    await page.getByLabel('Email address').fill(email); await page.getByRole('button', { name: 'Send reset link' }).click(); await expect(page.getByRole('status')).toContainText('If the account exists'); await harbor.runtime.drain();
    const reset = harbor.mail.findLast((item) => item.kind === 'reset-password'); assert.ok(reset); await page.goto(reset.url);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible(); await expect(page).toHaveURL(`${harbor.origin}/reset-password`);
    await page.getByLabel('Password', { exact: true }).fill('New-Synthetic-Password-456!'); await page.getByLabel('Confirm password', { exact: true }).fill('New-Synthetic-Password-456!');
    await page.getByRole('button', { name: 'Reset password', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Previous sessions have been revoked');
    assert.equal((await page.request.get(`${harbor.origin}/api/session`)).status(), 401); await audit(page);
  });
  await t.test('second neutral brand has the same accessible account journey and no authority from branding', async () => {
    await admin.query('DELETE FROM lde_auth."rateLimit"'); await page.goto(`${cedar.origin}/register`); await audit(page);
    await page.getByLabel('Display name').fill('Second synthetic user'); await page.getByLabel('Email address').fill('cedar@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill(password); await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Check your email'); await cedar.runtime.drain();
    await page.goto(cedar.mail.find((item) => item.kind === 'verify-email').url); await page.getByLabel('Email address').fill('cedar@example.invalid'); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(`${cedar.origin}/app`);
    await page.goto(`${cedar.origin}/workspaces`); await expect(page.getByRole('heading', { name: 'No workspaces assigned' })).toBeVisible(); await audit(page);
    await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`${cedar.origin}/security`); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account security'); await audit(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
  });
  await t.test('E07 actual material contract journeys', (nested) => runCompetitionBrowserCases(nested, { admin, appPool: pools[1], browser, harbor, cedar, audit }));
  await t.test('E08 real organizer administration, history, ambiguity and stale-revision journeys', async () => {
    await admin.query('DELETE FROM lde_auth."rateLimit"');
    await administerAccess(admin, 'role', { principalId: principal, tenantId: f.tenantId, eventId: null, role: 'organizer', expiresAt: null, revoked: 'no', reason: 'Synthetic organizer browser fixture' });
    const organizerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    try {
      const organizerPage = await organizerContext.newPage();
      await organizerPage.goto(`${harbor.origin}/sign-in`); await organizerPage.getByLabel('Email address').fill(email); await organizerPage.getByLabel('Password', { exact: true }).fill('New-Synthetic-Password-456!');
      await organizerPage.getByRole('button', { name: 'Sign in', exact: true }).click(); await organizerPage.getByLabel('Authenticator code').fill(authenticatorCode(`otpauth://totp/Test?secret=${secret}`));
      await organizerPage.getByRole('button', { name: 'Verify sign-in', exact: true }).click(); await expect(organizerPage).toHaveURL(`${harbor.origin}/app`);
      await administrationJourney({ page: organizerPage, origin: harbor.origin, tenant: f.tenantId, expect, audit, grantEvent: eventId => administerAccess(admin, 'role', {
        principalId: principal, tenantId: f.tenantId, eventId, role: 'organizer', expiresAt: null, revoked: 'no', reason: 'Synthetic explicit event organizer assignment',
      }) });
      await organizerPage.screenshot({ path: 'artifacts/browser/organizer-administration.png', fullPage: true });
    } finally { await organizerContext.close(); }
  });

});


