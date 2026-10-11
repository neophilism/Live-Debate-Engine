import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { describeAccessPolicy } from '../../dist/packages/contracts/src/access.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';
import { createIdentityRuntime } from '../../dist/packages/identity/src/http.js';
import { withCredential, withAuthorizedCredential, withWorkerCredential, assertDatabaseRole, AccessError } from '../../dist/packages/identity/src/broker.js';
import { createApi } from '../../dist/apps/api/src/server.js';
import { fixtureSet, uuid } from '../helpers/domain-fixtures.mjs';
import { authenticatorCode, browser } from '../helpers/identity-fixtures.mjs';

export async function runIdentityCases(t, admin, connection) {
  const roles = ['lde_identity_test', 'lde_runtime_test'];
  const pools = [];
  for (const [index, role] of roles.entries()) {
    await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT ${index === 0 ? 'lde_identity' : 'lde_runtime'} TO ${role}`);
    const url = new URL(connection); url.username = role; url.password = '';
    // The disposable CI server uses a password; local development may use peer/trust.
    const password = decodeURIComponent(new URL(connection).password);
    if (password) {
      const statement = await admin.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) AS sql', [role, password]);
      await admin.query(statement.rows[0].sql); url.password = password;
    }
    pools.push(new pg.Pool({ ...databaseConfig(url.toString(), { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), max: index === 0 ? 5 : 1 }));
  }
  const [identityPool, runtimePool] = pools;
  t.after(async () => { for (const pool of pools) await pool.end(); for (const role of roles) await admin.query(`DROP ROLE ${role}`); });
  const mail = []; const secret = randomBytes(48).toString('base64url');
  // Reserve a loopback listener, then construct the provider with its exact origin.
  let runtime;
  const api = createApi({ readiness: async () => ({ ready: true, reason: 'schema_compatible' }), identity: { handle: async (...args) => runtime.handle(...args) } });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  t.after(async () => { api.closeAllConnections(); await new Promise((resolve) => api.close(resolve)); });
  const origin = `http://127.0.0.1:${api.address().port}`;
  runtime = await createIdentityRuntime({ pool: identityPool, runtimePool, config: { origin, secret, environment: 'test' }, sendMail: async (message) => { mail.push(message); } });
  const user = browser(origin); const otherBrowser = browser(origin);
  const email = 'identity-flow@example.invalid'; const password = 'Synthetic-MFA-Test-Password-123!';
  let principalId; let token; let totpURI; let backupCodes; let firstCookie; let f; let other;
  const clearRate = async () => admin.query('DELETE FROM lde_auth."rateLimit"');
  const enroll = async (client) => {
    const enabled = await client.call('/api/auth/two-factor/enable', { method: 'POST', body: { password } });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
    const verified = await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(enabled.data.totpURI) } });
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    return enabled.data;
  };

  await t.test('schema matches the installed provider and runtime roles are not owners or bypass roles', async () => {
    const plan = await getMigrations(runtime.provider.options);
    assert.equal(plan.toBeCreated.length, 0); assert.equal(plan.toBeAdded.length, 0); assert.equal(plan.toBeAddedIndexes.length, 0);
    await assertDatabaseRole(identityPool, 'identity'); await assertDatabaseRole(runtimePool, 'runtime');
    await assert.rejects(assertDatabaseRole(admin, 'runtime'), /Unsafe/);
    await assert.rejects(runtimePool.query('SELECT * FROM lde_auth.session'), (error) => error.code === '42501');
    await assert.rejects(identityPool.query('SELECT * FROM lde.revisions'), (error) => error.code === '42501');
    await assert.rejects(runtimePool.query('SELECT lde_security.provider_record_proof($1,$2,$3)', [randomUUID(), randomUUID(), 'totp']), (error) => error.code === '42501');
  });
  await t.test('the actual server launcher enables guarded identity routes with separate non-owner pools', async () => {
    const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
    const urls = roles.map((role) => { const url = new URL(connection); url.username = role; return url.href; });
    const child = spawn(process.execPath, ['dist/apps/api/src/main.js'], { env: {
      PATH: process.env.PATH, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), LDE_ALLOW_INSECURE_LOCAL_DB: '1',
      DATABASE_URL: urls[1], LDE_IDENTITY_DATABASE_URL: urls[0], LDE_IDENTITY_ENABLED: '1',
      LDE_IDENTITY_ORIGIN: `http://127.0.0.1:${port}`, LDE_IDENTITY_SECRET: secret, LDE_IDENTITY_MAIL_MODE: 'local-file',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    const exit = once(child, 'exit'); let diagnostic = '';
    child.stderr.on('data', (part) => { diagnostic += part.toString(); });
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Launcher did not become ready')), 8000);
        child.once('exit', () => { clearTimeout(timeout); reject(new Error(diagnostic || 'Launcher exited')); });
        child.stdout.on('data', (part) => { if (part.toString().includes('"event":"listening"')) { clearTimeout(timeout); resolve(); } });
      });
      const readiness = await fetch(`http://127.0.0.1:${port}/api/ready`); assert.equal(readiness.status, 200);
      assert.equal((await readiness.json()).competitionReady, false);
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/session`)).status, 401);
    } finally { child.kill('SIGTERM'); const [code] = await exit; assert.equal(code, 0, diagnostic); }
  });
  await t.test('signup verifies email before issuing a usable session and does not self-assign roles', async () => {
    const created = await user.call('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: 'Synthetic test user', role: 'organizer', twoFactorEnabled: true } });
    assert.equal(created.status, 200, JSON.stringify(created.data)); principalId = created.data.user.id;
    assert.equal(Object.hasOwn(created.data, 'token'), false);
    assert.equal((await user.call('/api/session')).status, 401);
    assert.equal((await user.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })).status, 403);
    assert.ok(mail.some((item) => item.kind === 'verify-email' && item.to === email));
    const verification = new URL(mail.find((item) => item.kind === 'verify-email' && item.to === email).url);
    const verified = await user.call(`${verification.pathname}${verification.search}`); assert.equal(verified.status, 302); assert.equal(new URL(verified.headers.get('location')).origin, origin);
    const signedIn = await user.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data)); assert.equal(Object.hasOwn(signedIn.data, 'token'), false);
    assert.match(signedIn.headers.getSetCookie().join(';'), /HttpOnly/i);
    const status = await user.call('/api/session'); assert.equal(status.data.assurance, 'single-factor');
    const count = await admin.query('SELECT count(*)::int AS n FROM lde_security.role_grants WHERE principal_id=$1', [principalId]); assert.equal(count.rows[0].n, 0);
    firstCookie = user.jar.header();
    f = fixtureSet(uuid(7001), 7100, principalId); other = fixtureSet(uuid(7002), 8100, principalId);
    for (const fixtures of [f, other]) {
      await admin.query('INSERT INTO lde.tenants(id) VALUES($1)', [fixtures.tenantId]);
      for (const snapshot of fixtures.created) await appendSnapshot(admin, snapshot, { principalId, expectedRevision: 0, idempotencyKey: randomUUID() });
    }
    await admin.query('INSERT INTO lde_security.memberships(tenant_id,principal_id) VALUES($1,$2)', [f.tenantId, principalId]);
    for (const role of ['moderator', 'judge', 'organizer']) await admin.query('INSERT INTO lde_security.role_grants(id,tenant_id,principal_id,event_id,role) VALUES($1,$2,$3,$4,$5)', [randomUUID(), f.tenantId, principalId, role === 'organizer' ? null : f.eventId, role]);
    await admin.query('INSERT INTO lde_security.resource_owners(tenant_id,entity_id,kind,principal_id) VALUES($1,$2,$3,$4)', [f.tenantId, f.scorecard.record.entityId, 'scorecard', principalId]);
  });
  await t.test('staff is denied before MFA; valid enrollment rotates the session and binds only the verified session', async () => {
    await clearRate();
    assert.equal((await user.call(`/api/tenants/${f.tenantId}/events/${f.eventId}/access`)).status, 403);
    const factors = await enroll(user); totpURI = factors.totpURI; backupCodes = factors.backupCodes;
    const status = await user.call('/api/session'); assert.equal(status.status, 200); assert.equal(status.data.assurance, 'mfa');
    assert.equal((await fetch(`${origin}/api/session`, { headers: { cookie: firstCookie } })).status, 401);
    const result = await runtime.provider.api.getSession({ headers: new Headers({ cookie: user.jar.header() }) }); token = result.session.token;
    const access = await user.call(`/api/tenants/${f.tenantId}/events/${f.eventId}/access`);
    assert.equal(access.status, 200, JSON.stringify(access.data)); assert.ok(access.data.capabilities.includes('session.control'));
    assert.equal(access.data.capabilities.includes('ballot.read-sealed'), false);
    assert.equal(access.data.capabilities.includes('payout.approve'), false);
    assert.equal((await user.call(`/api/tenants/${other.tenantId}/events/${other.eventId}/access`)).status, 403);
  });
  await t.test('actual RLS reveals authorized event/own scorecard but not another tenant or sealed ballots', async () => {
    await withCredential(runtimePool, token, async (client) => {
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.event.record.snapshotId])).rowCount, 1);
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.scorecard.record.snapshotId])).rowCount, 1);
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.ballot.record.snapshotId])).rowCount, 0);
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE tenant_id=$1', [other.tenantId])).rowCount, 0);
      await client.query("SELECT set_config('lde.principal_id',$1,true),set_config('lde.tenant_id',$2,true),set_config('lde.role','finance',true)", [randomUUID(), other.tenantId]);
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE tenant_id=$1', [other.tenantId])).rowCount, 0);
    });
    assert.equal((await runtimePool.query('SELECT * FROM lde.revisions')).rowCount, 0);
    await assert.rejects(withCredential(runtimePool, 'A'.repeat(43), async () => true), AccessError);
    await assert.rejects(withAuthorizedCredential(runtimePool, token, 'payout.approve', { tenantId: f.tenantId, eventId: f.eventId }, async () => true), AccessError);
  });

  await t.test('operator grants are audited, revocable, and inaccessible to runtime/provider roles', async () => {
    const request = { principalId, tenantId: f.tenantId, eventId: f.eventId, role: 'finance', expiresAt: null, revoked: 'no', reason: 'Synthetic operator authorization test' };
    await assert.rejects(administerAccess(runtimePool, 'role', request));
    await assert.rejects(administerAccess(identityPool, 'role', request));
    await administerAccess(admin, 'role', request);
    await withAuthorizedCredential(runtimePool, token, 'payout.approve', { tenantId: f.tenantId, eventId: f.eventId }, async () => true);
    await administerAccess(admin, 'role', { ...request, revoked: 'yes' });
    await assert.rejects(withAuthorizedCredential(runtimePool, token, 'payout.approve', { tenantId: f.tenantId, eventId: f.eventId }, async () => true), AccessError);
    const log = await admin.query("SELECT actor,action,reason FROM lde_security.administrative_audit WHERE principal_id=$1 ORDER BY id", [principalId]);
    assert.equal(log.rows.length, 2); assert.equal(log.rows[0].reason, request.reason);
    await assert.rejects(admin.query('DELETE FROM lde_security.administrative_audit'), (error) => error.code === '55000');
    const serviceId = randomUUID();
    const issued = await administerAccess(admin, 'issue-service', { principalId: serviceId, tenantId: f.tenantId, eventId: f.eventId, profile: 'transcription-worker', actions: ['transcript.append'], expiresAt: new Date(Date.now() + 300000).toISOString(), reason: 'Synthetic narrowed transcription service' });
    assert.match(issued.credential, /^svc_[A-Za-z0-9_-]{43}$/);
    await withWorkerCredential(runtimePool, `Bearer ${issued.credential}`, 'transcript.append', { tenantId: f.tenantId, eventId: f.eventId }, async () => true);
    await administerAccess(admin, 'revoke-service', { credentialId: issued.credentialId, reason: 'Synthetic credential revocation check' });
    await assert.rejects(withWorkerCredential(runtimePool, `Bearer ${issued.credential}`, 'transcript.append', { tenantId: f.tenantId, eventId: f.eventId }, async () => true), AccessError);
  });
  await t.test('SQL permission registry agrees with the shared application policy', async () => {
    const rows = await admin.query('SELECT * FROM lde_security.access_rules ORDER BY action');
    for (const row of rows.rows) assert.deepEqual({ scope: row.scope, roles: row.roles, services: row.profiles, ownership: row.ownership, sensitive: row.sensitive }, describeAccessPolicy()[row.action]);
    assert.equal(rows.rowCount, Object.keys(describeAccessPolicy()).length);
  });
  await t.test('HTTP rejects origin spoofing, trusted-device bypass, raw bearer sessions and oversized bodies', async () => {
    assert.equal((await user.call('/api/auth/sign-out', { method: 'POST', body: {}, headers: { origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await user.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI), trustDevice: true } })).status, 400);
    const raw = await fetch(`${origin}/api/session`, { headers: { authorization: `Bearer ${token}`, 'x-principal-id': principalId } }); assert.equal(raw.status, 401);
    const large = await user.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'x'.repeat(20000) } }); assert.equal(large.status, 413);
    assert.equal((await user.call('/api/auth/get-session')).status, 404);
  });
  await t.test('fresh sign-in needs a second-factor challenge; enrollment flag alone grants no session', async () => {
    await clearRate();
    const login = await otherBrowser.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200); assert.equal(login.data.twoFactorRedirect, true);
    assert.equal((await otherBrowser.call('/api/session')).status, 401);
    const bad = await otherBrowser.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: 'invalid' } }); assert.equal(bad.status, 401);
    const verified = await otherBrowser.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI) } });
    assert.equal(verified.status, 200, JSON.stringify(verified.data)); assert.equal((await otherBrowser.call('/api/session')).data.assurance, 'mfa');
    assert.equal(Object.hasOwn(verified.data, 'token'), false);
  });
  await t.test('revocation and membership changes are visible on pooled connections and subsequent RLS statements', async () => {
    await withCredential(runtimePool, token, async (client) => {
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.event.record.snapshotId])).rowCount, 1);
      await admin.query("UPDATE lde_security.memberships SET status='revoked' WHERE tenant_id=$1 AND principal_id=$2", [f.tenantId, principalId]);
      assert.equal((await client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.event.record.snapshotId])).rowCount, 0);
    });
    assert.equal((await user.call(`/api/tenants/${f.tenantId}/events/${f.eventId}/access`)).status, 403);
    await admin.query("UPDATE lde_security.memberships SET status='active' WHERE tenant_id=$1 AND principal_id=$2", [f.tenantId, principalId]);
    const sessions = await otherBrowser.call('/api/sessions'); assert.ok(sessions.data.sessions.length >= 2);
    assert.ok(sessions.data.sessions.every((row) => !Object.hasOwn(row, 'token')));
    const first = (await user.call('/api/session')).data.sessionId;
    assert.equal((await otherBrowser.call(`/api/sessions/${first}/revoke`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await user.call('/api/session')).status, 401);
    await assert.rejects(withCredential(runtimePool, token, async () => true), AccessError);
  });
  await t.test('scoped worker credentials cannot approve payouts, cross events, or survive revocation', async () => {
    const principal = randomUUID(); const raw = `svc_${randomBytes(32).toString('base64url')}`; const credentialId = randomUUID();
    await admin.query("INSERT INTO lde_security.principals(id,kind) VALUES($1,'service')", [principal]);
    await admin.query('INSERT INTO lde_security.memberships(tenant_id,principal_id) VALUES($1,$2)', [f.tenantId, principal]);
    await admin.query("INSERT INTO lde_security.service_credentials(id,secret_digest,principal_id,tenant_id,event_id,epoch,profile,actions,expires_at) VALUES($1,$2,$3,$4,$5,1,'tally-worker',$6,now()+interval '1 hour')", [credentialId, createHash('sha256').update(raw).digest(), principal, f.tenantId, f.eventId, ['ballot.read-sealed', 'payout.approve']]);
    const scope = { tenantId: f.tenantId, eventId: f.eventId };
    const read = await withWorkerCredential(runtimePool, `Bearer ${raw}`, 'ballot.read-sealed', scope, (client) => client.query('SELECT * FROM lde.revisions WHERE snapshot_id=$1', [f.ballot.record.snapshotId])); assert.equal(read.rowCount, 1);
    await assert.rejects(withWorkerCredential(runtimePool, `Bearer ${raw}`, 'payout.approve', scope, async () => true), AccessError);
    await assert.rejects(withWorkerCredential(runtimePool, `Bearer ${raw}`, 'ballot.read-sealed', { tenantId: other.tenantId, eventId: other.eventId }, async () => true), AccessError);
    await admin.query('UPDATE lde_security.service_credentials SET revoked_at=now() WHERE id=$1', [credentialId]);
    await assert.rejects(withWorkerCredential(runtimePool, `Bearer ${raw}`, 'ballot.read-sealed', scope, async () => true), AccessError);
  });
  await t.test('backup recovery revokes other sessions and does not regain privileged MFA authority', async () => {
    await clearRate();
    const recovery = browser(origin);
    assert.equal((await recovery.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })).data.twoFactorRedirect, true);
    const result = await recovery.call('/api/auth/two-factor/verify-backup-code', { method: 'POST', body: { code: backupCodes[0] } });
    assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal((await recovery.call('/api/session')).data.assurance, 'single-factor');
    assert.equal((await recovery.call(`/api/tenants/${f.tenantId}/events/${f.eventId}/access`)).status, 403);
    assert.equal((await otherBrowser.call('/api/session')).status, 401);
    const reused = await recovery.call('/api/auth/two-factor/verify-backup-code', { method: 'POST', body: { code: backupCodes[0] } }); assert.equal(reused.status, 401);
    assert.equal((await recovery.call('/api/auth/two-factor/disable', { method: 'POST', body: { password } })).status, 200);
    await clearRate(); totpURI = (await enroll(recovery)).totpURI; assert.equal((await recovery.call('/api/session')).data.assurance, 'mfa');
    // A real password reset must revoke every existing provider session.
    const requested = await recovery.call('/api/auth/request-password-reset', { method: 'POST', body: { email, redirectTo: `${origin}/reset-password` } }); assert.equal(requested.status, 200);
    const resetMail = mail.findLast((item) => item.kind === 'reset-password'); assert.ok(resetMail);
    const resetUrl = new URL(resetMail.url); const resetToken = resetUrl.searchParams.get('token') ?? resetUrl.pathname.split('/').pop();
    const reset = await recovery.call('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, newPassword: 'New-Synthetic-Password-456!' } });
    assert.equal(reset.status, 200, JSON.stringify(reset.data)); assert.equal((await recovery.call('/api/session')).status, 401);
  });
  await t.test('real sign-in rate limiting and MFA lockouts reject excessive attempts', async () => {
    await clearRate(); const client = browser(origin);
    for (let index = 0; index < 10; index += 1) assert.equal((await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'Intentionally-wrong-password!' } })).status, 401);
    assert.equal((await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'Intentionally-wrong-password!' } })).status, 429);
    await clearRate(); const signIn = await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'New-Synthetic-Password-456!' } }); assert.equal(signIn.data.twoFactorRedirect, true);
    for (let index = 0; index < 5; index += 1) {
      const attempt = await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: 'not-a-valid-code' } }); assert.equal(attempt.status, 401);
    }
    const locked = await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI) } }); assert.equal(locked.status, 429);
    assert.equal((await client.call('/api/session')).status, 401);
    // Simulate expiry of the provider's persisted lock window, not a production override.
    await admin.query(`UPDATE lde_auth."twoFactor" SET "lockedUntil"=now()-interval '1 second' WHERE "userId"=$1`, [principalId]);
    await clearRate();
  });
  await t.test('password changes require fresh MFA and revoke other sessions even when a client requests otherwise', async () => {
    await clearRate(); const current = browser(origin); const victim = browser(origin);
    for (const client of [current, victim]) {
      const signed = await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'New-Synthetic-Password-456!' } });
      assert.equal(signed.data.twoFactorRedirect, true);
      const factor = await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI) } });
      assert.equal(factor.status, 200, JSON.stringify(factor.data));
    }
    const providerSession = await runtime.provider.api.getSession({ headers: new Headers({ cookie: current.jar.header() }) });
    await admin.query("UPDATE lde_security.mfa_proofs SET verified_at=now()-interval '16 minutes' WHERE session_id=$1", [providerSession.session.id]);
    const change = { currentPassword: 'New-Synthetic-Password-456!', newPassword: 'Changed-Synthetic-Password-789!', revokeOtherSessions: false };
    assert.equal((await current.call('/api/auth/change-password', { method: 'POST', body: change })).status, 403);
    await clearRate(); assert.equal((await current.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI) } })).status, 200);
    const changed = await current.call('/api/auth/change-password', { method: 'POST', body: change }); assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal((await victim.call('/api/session')).status, 401);
    assert.equal((await current.call('/api/session')).data.assurance, 'single-factor');
    await administerAccess(admin, 'principal', { principalId, status: 'disabled', reason: 'Synthetic disabled principal test' });
    assert.equal((await current.call('/api/session')).status, 401);
    assert.ok((await admin.query('SELECT count(*)::int AS n FROM lde_auth.session WHERE "userId"=$1', [principalId])).rows[0].n === 0);
  });

}
