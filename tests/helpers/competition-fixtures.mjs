import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { browser, authenticatorCode } from './identity-fixtures.mjs';
import { fixtureSet, uuid } from './domain-fixtures.mjs';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { initialSnapshot, nextSnapshot, referenceOf, snapshotOf } from '../../dist/packages/contracts/src/snapshot.js';
import { sourceManualProfile } from '../../dist/packages/competition/src/model.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';

/** Synthetic, ephemeral identities through the real provider. Never use with a production database. */
export async function competitionFixture({ admin, origin, identity, mails, store, seed = 110000 }) {
  const f = fixtureSet(uuid(seed), seed + 100);
  await admin.query('INSERT INTO lde.tenants(id) VALUES($1)', [f.tenantId]);
  for (const snapshot of f.created) await appendSnapshot(admin, snapshot, { principalId: uuid(900), expectedRevision: 0, idempotencyKey: randomUUID() });
  async function register(name, role) {
    await admin.query('DELETE FROM lde_auth."rateLimit"');
    const client = browser(origin); const email = `material-${seed}-${name}@example.invalid`; const password = 'Synthetic-Competition-Password-123!';
    const result = await client.call('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: `Synthetic ${name}` } });
    assert.equal(result.status, 200, JSON.stringify(result.data)); await identity.drain();
    const message = mails.findLast((m) => m.to === email && m.kind === 'verify-email'); assert.ok(message);
    const url = new URL(message.url); await client.call(url.pathname + url.search);
    assert.equal((await client.call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })).status, 200);
    let totpURI;
    if (!['debater', 'audience'].includes(role)) {
      const enabled = await client.call('/api/auth/two-factor/enable', { method: 'POST', body: { password } }); assert.equal(enabled.status, 200, JSON.stringify(enabled.data)); totpURI = enabled.data.totpURI;
      assert.equal((await client.call('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: authenticatorCode(totpURI) } })).status, 200);
    }
    const principalId = result.data.user.id;
    await administerAccess(admin, 'membership', { principalId, tenantId: f.tenantId, status: 'active', expiresAt: null, reason: 'Synthetic material fixture membership' });
    await administerAccess(admin, 'role', { principalId, tenantId: f.tenantId, eventId: f.eventId, role, expiresAt: null, revoked: 'no', reason: 'Synthetic material event role' });
    if (role === 'organizer') await administerAccess(admin, 'role', { principalId, tenantId: f.tenantId, eventId: null, role, expiresAt: null, revoked: 'no', reason: 'Synthetic ruleset management role' });
    const session = await identity.provider.api.getSession({ headers: new Headers({ cookie: client.jar.header() }) });
    return { client, principalId, token: session.session.token, sessionId: session.session.id, email, password, totpURI };
  }
  const organizer = await register('organizer', 'organizer'); const a = await register('for', 'debater'); const b = await register('against', 'debater');
  const outsider = await register('spectator', 'audience');
  const rulesetEntity = randomUUID();
  const rules = await store.saveRuleset(organizer.token, f.tenantId, rulesetEntity, { commandId: randomUUID(), expectedRevision: 0, data: sourceManualProfile() });
  const ruleset = snapshotOf(rules.current.snapshot);
  await store.publishRuleset(organizer.token, f.tenantId, rulesetEntity, { commandId: randomUUID(), snapshotId: ruleset.record.snapshotId });
  const event = nextSnapshot(f.event, { ...f.event.record.data, rulesetRef: referenceOf(ruleset) });
  await appendSnapshot(admin, event, { principalId: organizer.principalId, expectedRevision: f.event.record.revision, idempotencyKey: randomUUID() });
  const assignments = [];
  for (const [user, participant, team] of [[a, f.participant, f.team], [b, f.participant2, f.team2]]) {
    await admin.query('INSERT INTO lde_security.resource_owners(tenant_id,entity_id,kind,principal_id) VALUES($1,$2,\'participant\',$3)', [f.tenantId, participant.record.entityId, user.principalId]);
    const assignment = initialSnapshot('assignment', { tenantId: f.tenantId, eventId: f.eventId, entityId: randomUUID() }, { principalId: user.principalId, role: 'debater', teamRef: referenceOf(team) });
    await appendSnapshot(admin, assignment, { principalId: organizer.principalId, expectedRevision: 0, idempotencyKey: randomUUID() }); assignments.push(assignment);
  }
  const data = {
    materialVersion: 2, eventRef: referenceOf(event), motionRef: referenceOf(f.motion), rulesetRef: referenceOf(ruleset), forTeamRef: referenceOf(f.team), againstTeamRef: referenceOf(f.team2),
    prizeBudget: { currency: 'USD', minorUnits: '2000000', exponent: 2 }, startsAt: new Date(Date.now() + 172800000).toISOString(), timeZone: 'America/New_York', publication: 'live', embargoUntil: null,
    acknowledgmentDeadline: new Date(Date.now() + 86400000).toISOString(), amendmentReason: null,
    speakers: [[f.participant, assignments[0], 'for'], [f.participant2, assignments[1], 'against']].map(([participant, assignment, side]) => ({ participantRef: referenceOf(participant), assignmentRef: referenceOf(assignment), side, order: 1, openingSeconds: 420, closingSeconds: 180, prizeShareBps: null })),
  };
  return { f, organizer, a, b, outsider, ruleset, rulesetEntity, event, assignments, data, register };
}
