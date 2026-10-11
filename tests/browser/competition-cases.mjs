import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { competitionFixture } from '../helpers/competition-fixtures.mjs';

/** Real browser + real identity/API/PostgreSQL. No simulated contract responses. */
export async function runCompetitionBrowserCases(t, { admin, appPool, browser, harbor, cedar, audit }) {
  const x = await competitionFixture({ admin, origin: harbor.origin, identity: harbor.runtime, mails: harbor.mail, store: harbor.store, seed: 220000 });
  const contexts = []; const errors = [];
  async function userPage(server, user, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' }); contexts.push(context);
    await context.addCookies(user.client.jar.header().split('; ').map((pair) => { const equals = pair.indexOf('='); return { name: pair.slice(0, equals), value: pair.slice(equals + 1), url: server.origin, httpOnly: true, sameSite: 'Lax' }; }));
    const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', (e) => errors.push(e.message)); return page;
  }
  t.after(async () => { for (const context of contexts) await context.close(); });
  const organizer = await userPage(harbor, x.organizer); const a = await userPage(harbor, x.a); const b = await userPage(harbor, x.b);
  const url = `${harbor.origin}/contract?tenant=${x.f.tenantId}&event=${x.f.eventId}`;
  const api = `/api/tenants/${x.f.tenantId}/events/${x.f.eventId}/contract`;
  const getState = async () => (await x.organizer.client.call(api)).data;
  async function offer(page) {
    const panel = page.getByRole('region', { name: 'Offer the reviewed contract', exact: true });
    await panel.getByRole('checkbox').check(); await panel.getByRole('button', { name: 'Offer contract to participants' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'This contract revision was offered.' })).toBeVisible();
  }
  async function acknowledge(page) {
    const panel = page.getByRole('region', { name: 'Your individual acknowledgment', exact: true });
    await panel.getByRole('checkbox').focus(); await page.keyboard.press('Space');
    await panel.getByRole('button', { name: 'Acknowledge this contract revision' }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Your individual acknowledgment was recorded' })).toBeVisible();
  }
  let first;
  await t.test('organizer discovers material workflows without client-assigned authority', async () => {
    await organizer.goto(`${harbor.origin}/workspace?tenant=${x.f.tenantId}`);
    await organizer.getByRole('link', { name: 'Competition rulesets', exact: true }).click();
    await expect(organizer.getByRole('heading', { level: 1 })).toHaveText('Competition rulesets');
    await expect(organizer.getByRole('region', { name: 'Create a ruleset', exact: true })).toBeVisible(); await audit(organizer);
  });
  await t.test('ruleset editing, validation, immutable saving and explicit publication use actual backend records', async () => {
    const editor = organizer.getByRole('region', { name: 'Create a ruleset', exact: true });
    await editor.getByLabel('Ruleset name', { exact: true }).fill('Browser-reviewed ruleset');
    await editor.getByLabel('Criterion 1 weight in basis points').fill('2999'); await editor.getByRole('button', { name: 'Save ruleset draft' }).click();
    await expect(editor.getByRole('alert')).toBeFocused(); await expect(editor.getByLabel('Ruleset name', { exact: true })).toHaveValue('Browser-reviewed ruleset');
    await editor.getByLabel('Criterion 1 weight in basis points').fill('3000'); await editor.getByRole('button', { name: 'Save ruleset draft' }).click();
    await expect(organizer.getByRole('status').filter({ hasText: 'Ruleset draft saved.' })).toBeVisible();
    const panel = organizer.getByRole('region', { name: 'Publish the reviewed revision', exact: true }); await panel.getByRole('checkbox').check();
    await panel.getByRole('button', { name: 'Publish ruleset revision' }).click();
    await expect(organizer.getByRole('status').filter({ hasText: 'Ruleset revision published.' })).toBeVisible();
    const entity = new URL(organizer.url()).searchParams.get('ruleset'); const result = await x.organizer.client.call(`/api/tenants/${x.f.tenantId}/rulesets/${entity}`);
    assert.equal(result.data.current.published, true); assert.equal(result.data.current.snapshot.data.name, 'Browser-reviewed ruleset'); await audit(organizer);
  });
  await t.test('contract builder saves all allocations and deadlines while withholding its draft from participants', async () => {
    await organizer.goto(url); const form = organizer.getByRole('region', { name: 'Prepare a contract', exact: true });
    await expect(form.getByLabel('For team', { exact: true })).toBeVisible();
    await form.getByLabel('For team', { exact: true }).selectOption(x.f.team.record.entityId); await form.getByLabel('Against team', { exact: true }).selectOption(x.f.team2.record.entityId);
    await form.getByLabel('Start time (UTC)').fill(x.data.startsAt.slice(0, 16)); await form.getByLabel('Acknowledgment deadline (UTC)').fill(x.data.acknowledgmentDeadline.slice(0, 16));
    await form.getByLabel('Display time zone').selectOption('America/New_York'); await form.getByLabel('Budget in minor units').fill('2000000');
    await form.getByRole('button', { name: 'Save contract draft' }).click(); await expect(organizer.getByRole('status').filter({ hasText: 'Contract draft saved.' })).toBeVisible();
    first = (await getState()).current; assert.equal(first.snapshot.data.speakers.length, 2); assert.equal(first.published, false);
    await a.goto(url); await expect(a.getByText('No contract version is available to your account.', { exact: false })).toBeVisible(); await expect(a.getByRole('heading', { name: /Frozen contract/ })).toHaveCount(0); await audit(a);
    const hidden = await a.request.get(`${harbor.origin}${api}?snapshot=${first.snapshot.snapshotId}`); assert.equal(hidden.status(), 404);
    await organizer.screenshot({ path: 'artifacts/browser/contract-organizer-draft.png', fullPage: true });
  });
  await t.test('keyboard-accessible individual acknowledgments cannot acknowledge an entire team or authorize operations', async () => {
    await offer(organizer); await a.reload(); await b.goto(url);
    await a.getByText('Read every frozen ruleset field', { exact: true }).click(); await a.getByText('Read every frozen contract field and reference', { exact: true }).click(); await audit(a);
    await a.keyboard.press('Control+Home'); await a.keyboard.press('Tab');
    await acknowledge(a); assert.equal((await getState()).status.acknowledgments, 1); assert.equal((await getState()).status.materialReady, false);
    await acknowledge(b); await organizer.getByRole('button', { name: 'Refresh contract', exact: true }).click();
    await expect(organizer.getByText('Material terms accepted', { exact: true })).toBeVisible(); const status = (await getState()).status;
    assert.equal(status.registrationOpen, false); assert.equal(status.competitionReady, false); await audit(organizer);
    assert.equal(await a.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await a.screenshot({ path: 'artifacts/browser/contract-participant-acknowledged.png', fullPage: true });
  });
  await t.test('material amendments disable readiness and force both participants to acknowledge again', async () => {
    const editor = organizer.getByRole('region', { name: 'Create the next contract revision', exact: true });
    await editor.getByLabel('Reason for amendment').fill('Move the synthetic rehearsal start by one hour.');
    await editor.getByLabel('Start time (UTC)').fill(new Date(Date.parse(x.data.startsAt) + 3600000).toISOString().slice(0, 16));
    await editor.getByRole('button', { name: 'Save contract draft' }).click(); await expect(organizer.getByRole('status').filter({ hasText: 'Contract draft saved.' })).toBeVisible();
    await a.getByRole('button', { name: 'Refresh contract' }).click(); await expect(a.getByRole('status').filter({ hasText: 'A draft is pending.' })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Acknowledge this contract revision' })).toHaveCount(0); assert.equal((await getState()).status.materialReady, false);
    await offer(organizer); await a.reload(); await b.reload(); await acknowledge(a); assert.equal((await getState()).status.materialReady, false); await acknowledge(b);
    assert.equal((await getState()).status.materialReady, true);
    const stale = await x.a.client.call(`${api}/acknowledge`, { method: 'POST', body: { commandId: randomUUID(), snapshotId: first.snapshot.snapshotId, contentHash: first.contentHash, accepted: true } }); assert.equal(stale.status, 409);
  });
  await t.test('concurrent editor conflict is explicit, focused and preserves the unsent form values', async () => {
    await organizer.reload(); const current = (await getState()).current;
    await expect(organizer.getByRole('heading', { name: `Frozen contract revision ${current.snapshot.revision}`, exact: true })).toBeVisible();
    await expect(organizer.getByRole('region', { name: 'Create the next contract revision', exact: true })).toBeVisible();
    await harbor.store.saveContract(x.organizer.token, x.f.tenantId, x.f.eventId, { commandId: randomUUID(), expectedRevision: current.snapshot.revision, data: { ...current.snapshot.data, amendmentReason: 'A separate editor prepared this synthetic revision.' } });
    const editor = organizer.getByRole('region', { name: 'Create the next contract revision', exact: true });
    await editor.getByLabel('Reason for amendment').fill('This stale edit must remain visible for recovery.'); await editor.getByRole('button', { name: 'Save contract draft' }).click();
    await expect(editor.getByRole('alert')).toContainText('material version changed'); await expect(editor.getByRole('alert')).toBeFocused();
    await expect(editor.getByLabel('Reason for amendment')).toHaveValue('This stale edit must remain visible for recovery.'); await audit(organizer);
    await organizer.getByRole('button', { name: 'Refresh contract' }).click(); await expect(organizer.getByRole('heading', { name: 'Frozen contract revision 3', exact: true })).toBeVisible();
    await offer(organizer); await a.reload(); await b.reload(); await acknowledge(a); await acknowledge(b);
  });
  await t.test('history is complete and read-only; mobile layout and expanded materials have no accessibility exclusions', async () => {
    await a.goto(`${url}&snapshot=${first.snapshot.snapshotId}`); await expect(a.getByRole('heading', { name: 'Frozen contract revision 1', exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Acknowledge this contract revision' })).toHaveCount(0); await expect(a.getByRole('link', { name: 'Return to the current contract.' })).toBeVisible();
    await a.setViewportSize({ width: 360, height: 800 }); await a.getByText('Read every frozen ruleset field', { exact: true }).click(); await a.getByText('Read every frozen contract field and reference', { exact: true }).click();
    await audit(a); assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await a.screenshot({ path: 'artifacts/browser/contract-mobile-history.png', fullPage: true });
  });
  await t.test('temporary assignment revocation cannot silently reactivate previous material acceptance', async () => {
    await admin.query("UPDATE lde_security.role_grants SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND event_id=$2 AND principal_id=$3 AND role='debater'", [x.f.tenantId, x.f.eventId, x.a.principalId]);
    await admin.query("UPDATE lde_security.role_grants SET revoked_at=NULL WHERE tenant_id=$1 AND event_id=$2 AND principal_id=$3 AND role='debater'", [x.f.tenantId, x.f.eventId, x.a.principalId]);
    await a.goto(url); await expect(a.getByText('Review or amendment required', { exact: true })).toBeVisible(); await expect(a.getByRole('button', { name: 'Acknowledge this contract revision' })).toHaveCount(0);
    assert.equal((await getState()).status.materialReady, false); await audit(a);
  });
  await t.test('second neutral brand uses the same contract engine and individual acknowledgment flow', async () => {
    const y = await competitionFixture({ admin, origin: cedar.origin, identity: cedar.runtime, mails: cedar.mail, store: cedar.store, seed: 230000 });
    const saved = await cedar.store.saveContract(y.organizer.token, y.f.tenantId, y.f.eventId, { commandId: randomUUID(), expectedRevision: 0, data: y.data });
    await cedar.store.offerContract(y.organizer.token, y.f.tenantId, y.f.eventId, { commandId: randomUUID(), snapshotId: saved.current.snapshot.snapshotId });
    const other = await userPage(cedar, y.a, 360); await other.goto(`${cedar.origin}/contract?tenant=${y.f.tenantId}&event=${y.f.eventId}`);
    await expect(other.getByRole('heading', { level: 1 })).toHaveText('Event competition contract'); assert.ok((await other.title()).includes('Cedar Assembly')); await audit(other); await acknowledge(other);
    assert.equal((await cedar.store.workspace(y.organizer.token, y.f.tenantId, y.f.eventId)).status.acknowledgments, 1);
    assert.ok(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await other.screenshot({ path: 'artifacts/browser/cedar-contract-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); assert.equal((await appPool.query('SELECT * FROM lde.revisions')).rowCount, 0);
  });
}
