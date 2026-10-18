import { AdministrationStore } from '../../dist/packages/competition/src/administration-store.js';
import { createAdministrationHttp } from '../../dist/packages/competition/src/administration-http.js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { databaseConfig } from '../../dist/packages/database/src/config.js';
import { createIdentityRuntime } from '../../dist/packages/identity/src/http.js';
import { withCredential } from '../../dist/packages/identity/src/broker.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';
import { appendSnapshot } from '../../dist/packages/database/src/snapshots.js';
import { initialSnapshot, nextSnapshot, referenceOf, snapshotOf } from '../../dist/packages/contracts/src/snapshot.js';
import { CompetitionStore } from '../../dist/packages/competition/src/store.js';
import { createCompetitionHttp } from '../../dist/packages/competition/src/http.js';
import { createApi } from '../../dist/apps/api/src/server.js';
import { sourceManualProfile } from '../../dist/packages/competition/src/model.js';
import { competitionFixture } from '../helpers/competition-fixtures.mjs';
import { runAdministrationCases } from './administration-cases.mjs';

export async function runCompetitionCases(t, admin, connection) {
  const names = ['lde_material_auth_test', 'lde_material_app_test']; const pools = [];
  for (const [index, role] of names.entries()) {
    // Caller already reset the explicitly disposable database; recover interrupted test logins.
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`GRANT ${index === 0 ? 'lde_identity' : 'lde_runtime'} TO ${role}`);
    const url = new URL(connection); url.username = role;
    if (url.password) await admin.query((await admin.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) AS sql', [role, decodeURIComponent(url.password)])).rows[0].sql);
    pools.push(new pg.Pool({ ...databaseConfig(url.toString(), { NODE_ENV: 'test', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), max: 5 }));
  }
  const [authPool, appPool] = pools; let identity; let http; let administration; const mails = []; const logs = [];
  const store = new CompetitionStore(appPool);
  const server = createApi({ administration: { handle: (...args) => administration.handle(...args) }, readiness: async () => ({ ready: true, reason: 'schema_compatible' }), identity: { handle: (...args) => identity.handle(...args) }, competition: { handle: (...args) => http.handle(...args) } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  identity = await createIdentityRuntime({ pool: authPool, runtimePool: appPool, config: { origin, secret: randomBytes(48).toString('base64url'), environment: 'test' }, sendMail: async (m) => mails.push(m) });
  http = createCompetitionHttp(store, identity, origin, (line) => logs.push(line));
  administration = createAdministrationHttp(new AdministrationStore(appPool), identity, origin);
  t.after(async () => { await identity.drain(); server.closeAllConnections(); await new Promise((r) => server.close(r)); for (const p of pools) await p.end(); for (const n of names) await admin.query(`DROP ROLE ${n}`); });
  const x = await competitionFixture({ admin, origin, identity, mails, store }); const { f, organizer, a, b, outsider } = x;
  await t.test('E08 immutable credential-bound administration', async (nested) => runAdministrationCases(admin, appPool, x));
  await t.test('E08 real HTTP respects organizer credential scope, revocation and conflicts', async () => {
    const path = `/api/tenants/${f.tenantId}/administration/series`;
    assert.equal((await organizer.client.call(path)).status, 200);
    assert.equal((await outsider.client.call(path)).status, 404);
    assert.equal((await organizer.client.call(path.replace(f.tenantId, randomUUID()))).status, 404);
    const entity = randomUUID();
    const input = { commandId: randomUUID(), expectedRevision: 0, data: { name: 'Synthetic HTTP series', season: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' } };
    const first = await organizer.client.call(`${path}/${entity}`, { method: 'POST', body: input });
    assert.equal(first.status, 200); assert.equal(first.data.current.snapshot.revision, 1);
    const replay = await organizer.client.call(`${path}/${entity}`, { method: 'POST', body: input });
    assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true);
    assert.equal((await organizer.client.call(`${path}/${entity}`, { method: 'POST', body: { ...input, commandId: randomUUID() } })).status, 409);
    assert.equal((await organizer.client.call(`${path}/${entity}`, { method: 'POST', body: { ...input, principalId: organizer.principalId } })).status, 400);
  });
  const endpoint = `/api/tenants/${f.tenantId}/events/${f.eventId}/contract`;
  const post = (u, path, body) => u.client.call(path, { method: 'POST', body });
  const workspace = (u = organizer) => store.workspace(u.token, f.tenantId, f.eventId);
  const save = (data, revision) => store.saveContract(organizer.token, f.tenantId, f.eventId, { commandId: randomUUID(), expectedRevision: revision, data });
  const ack = (u, rec, extra = {}) => store.acknowledge(u.token, f.tenantId, f.eventId, { commandId: randomUUID(), snapshotId: rec.snapshot.snapshotId, contentHash: rec.contentHash, accepted: true, ...extra });
  const offer = (rec) => store.offerContract(organizer.token, f.tenantId, f.eventId, { commandId: randomUUID(), snapshotId: rec.snapshot.snapshotId });
  const sql = (u, query, args) => withCredential(appPool, u.token, (client) => client.query(query, args));
  let current;
  await t.test('published ruleset has a verified immutable hash and database-derived workspace choices', async () => {
    const page = await store.rulesets(organizer.token, f.tenantId, x.rulesetEntity);
    assert.equal(page.records[0].published, true); assert.equal(page.records[0].contentHash, x.ruleset.contentHash);
    const w = await workspace(); assert.equal(w.canManage, true); assert.equal(w.choices.filter((r) => r.snapshot.kind === 'assignment').length, 2);
    assert.equal(w.participantLinks.length, 2); assert.equal(w.current, null); assert.equal(w.status.registrationOpen, false);
  });
  await t.test('real API saves a complete draft; neither raw RLS reads nor participant workspace disclose it', async () => {
    const result = await post(organizer, endpoint, { commandId: randomUUID(), expectedRevision: 0, data: x.data }); assert.equal(result.status, 200, JSON.stringify(result.data)); current = result.data.current;
    assert.equal(current.snapshot.revision, 1); assert.equal((await workspace()).status.materialReady, false);
    assert.equal((await workspace(a)).current, null);
    assert.equal((await sql(a, 'SELECT snapshot_id FROM lde.revisions WHERE snapshot_id=$1', [current.snapshot.snapshotId])).rowCount, 0);
    assert.equal((await sql(organizer, 'SELECT snapshot_id FROM lde.revisions WHERE snapshot_id=$1', [current.snapshot.snapshotId])).rowCount, 1);
    await assert.rejects(ack(a, current)); assert.equal((await workspace()).status.acknowledgments, 0);
  });
  await t.test('direct SQL rejects null, unknown and missing nested material rules even with organizer credentials', async () => {
    const profile = sourceManualProfile(); const variants = [null, {}, { ...profile, ignored: true }, { ...profile, voting: null }, { ...profile, rubric: [] }, { ...profile, standardPrize: { ...profile.standardPrize, audienceShareBps: 4999 } }];
    for (const data of variants) await assert.rejects(sql(organizer, 'SELECT lde_competition.save_ruleset($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify(data), randomUUID()]), (e) => e.code === '22023');
    const bad = structuredClone(x.data); delete bad.speakers[0].openingSeconds;
    for (const data of [null, {}, bad, { ...x.data, eventRef: null }]) await assert.rejects(sql(organizer, 'SELECT lde_competition.save_contract($1,$2,1,$3,$4)', [f.tenantId, f.eventId, JSON.stringify(data), randomUUID()]), (e) => e.code === '22023');
  });
  await t.test('role, tenant and principal spoofing are denied; CSRF, malformed and oversized bodies fail without logs of materials', async () => {
    assert.equal((await post(a, endpoint, { commandId: randomUUID(), expectedRevision: 1, data: x.data })).status, 404);
    assert.equal((await organizer.client.call(endpoint.replace(f.tenantId, randomUUID()))).status, 404);
    assert.equal((await post(organizer, endpoint, { commandId: randomUUID(), expectedRevision: 1, data: x.data, principalId: a.principalId })).status, 400);
    const headers = { cookie: organizer.client.jar.header(), 'content-type': 'application/json' };
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers, body: '{}' })).status, 403);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { ...headers, origin }, body: '{' })).status, 400);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { ...headers, origin }, body: JSON.stringify({ data: 'x'.repeat(131073) }) })).status, 413);
    assert.equal((await organizer.client.call(`${endpoint}?before=0`)).status, 400);
    assert.equal((await fetch(origin + endpoint, { method: 'DELETE', headers })).status, 405);
    assert.ok(!logs.join('\n').includes('2000000')); assert.ok(!logs.join('\n').includes(organizer.token));
  });
  await t.test('material referents, per-side time totals and custom prize shares cannot be invented', async () => {
    for (const mutate of [d => { d.speakers[0].openingSeconds = 1; }, d => { d.speakers[0].participantRef = d.speakers[1].participantRef; }, d => { d.speakers[0].assignmentRef.snapshotId = randomUUID(); }, d => { d.forTeamRef = d.againstTeamRef; }, d => { d.speakers[0].prizeShareBps = 10000; }, d => { d.motionRef.tenantId = randomUUID(); }]) {
      const data = structuredClone(x.data); mutate(data); await assert.rejects(save(data, 1));
    }
    assert.equal((await workspace()).current.snapshot.revision, 1);
  });
  await t.test('publication is explicit; only the individually bound speakers can acknowledge exact hash and version', async () => {
    await offer(current); assert.equal((await workspace(a)).current.published, true);
    assert.equal((await post(outsider, `${endpoint}/acknowledge`, { commandId: randomUUID(), snapshotId: current.snapshot.snapshotId, contentHash: current.contentHash, accepted: true })).status, 404);
    for (const accepted of [false, null]) await assert.rejects(sql(a, 'SELECT lde_competition.acknowledge_contract($1,$2,$3,$4,$5,$6)', [f.tenantId, f.eventId, current.snapshot.snapshotId, current.contentHash, accepted, randomUUID()]));
    await assert.rejects(ack(a, current, { contentHash: 'a'.repeat(64) })); await ack(a, current);
    assert.equal((await workspace()).status.acknowledgments, 1); assert.equal((await workspace()).status.accepted, false);
    assert.equal((await workspace(a)).ownAcknowledgment, true); assert.equal((await workspace(b)).ownAcknowledgment, false);
    await ack(a, current); assert.equal((await workspace()).status.acknowledgments, 1);
    await ack(b, current); const status = (await workspace()).status;
    assert.equal(status.materialReady, true); assert.equal(status.accepted, true); assert.equal(status.registrationOpen, false); assert.equal(status.competitionReady, false);
  });
  await t.test('amendments are append-only, immediately invalidate readiness and require fresh individual acknowledgments', async () => {
    await assert.rejects(save(x.data, 1));
    const amended = { ...x.data, startsAt: new Date(Date.parse(x.data.startsAt) + 3600000).toISOString(), amendmentReason: 'Move the rehearsal start one hour later.' };
    const original = current; current = (await save(amended, 1)).current;
    const draft = await workspace(a); assert.equal(draft.pendingAmendment, true); assert.equal(draft.status.materialReady, false); assert.equal(draft.current.snapshot.snapshotId, original.snapshot.snapshotId);
    await assert.rejects(ack(b, original)); await offer(current);
    assert.equal((await workspace(a)).ownAcknowledgment, false); await ack(a, current); await ack(b, current);
    const history = await workspace(); assert.equal(history.status.materialReady, true); assert.equal(history.history.length, 2); assert.equal(history.history[1].accepted, true);
    assert.equal(history.history[1].contentHash, original.contentHash);
  });
  await t.test('stale edits conflict; concurrent identical commands are idempotent and changed-intent replays are rejected', async () => {
    const data = { ...current.snapshot.data, amendmentReason: 'Review a concurrent revision for the rehearsal.' };
    const command = { commandId: randomUUID(), expectedRevision: 2, data };
    const results = await Promise.all([store.saveContract(organizer.token, f.tenantId, f.eventId, command), store.saveContract(organizer.token, f.tenantId, f.eventId, command)]);
    assert.equal(results[0].current.snapshot.snapshotId, results[1].current.snapshot.snapshotId); assert.equal(results.filter(r => r.replayed).length, 1);
    await assert.rejects(store.saveContract(organizer.token, f.tenantId, f.eventId, { ...command, data: { ...data, amendmentReason: 'Different intent using an existing command id.' } }), e => e.code === '40001');
    await assert.rejects(save(data, 2), e => e.code === '40001'); current = results[0].current;
    const rivalData = { ...data, amendmentReason: 'Two competing editors must not overwrite each other.' };
    const race = await Promise.allSettled([save(rivalData, 3), save(rivalData, 3)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); current = race.find(r => r.status === 'fulfilled').value.current;
    await offer(current); await ack(a, current); await ack(b, current);
  });
  await t.test('revocation invalidates accepted material and even completed command replays cannot bypass current authorization', async () => {
    await administerAccess(admin, 'role', { principalId: a.principalId, tenantId: f.tenantId, eventId: f.eventId, role: 'debater', expiresAt: null, revoked: 'yes', reason: 'Synthetic contract role invalidation' });
    assert.equal((await workspace()).status.materialReady, false); await assert.rejects(ack(a, current));
    await administerAccess(admin, 'role', { principalId: a.principalId, tenantId: f.tenantId, eventId: f.eventId, role: 'debater', expiresAt: null, revoked: 'no', reason: 'Synthetic participant role restoration' });
    assert.equal((await workspace()).status.basisCurrent, false);
    await assert.rejects(ack(a, current));
    current = (await save({ ...current.snapshot.data, amendmentReason: 'Restore the speaker assignment under a newly acknowledged contract.' }, current.snapshot.revision)).current;
    await offer(current); await ack(a, current); await ack(b, current); assert.equal((await workspace()).status.materialReady, true);
  });
  await t.test('event changes invalidate accepted exact references; replacement needs an amendment and reacknowledgment', async () => {
    const event = nextSnapshot(x.event, { ...x.event.record.data, title: 'Revised synthetic event' });
    await appendSnapshot(admin, event, { principalId: organizer.principalId, expectedRevision: x.event.record.revision, idempotencyKey: randomUUID() });
    assert.equal((await workspace()).status.materialReady, false); await assert.rejects(ack(a, current));
    const data = { ...current.snapshot.data, eventRef: referenceOf(event), amendmentReason: 'Accepted event description changed and requires a new acknowledgment.' };
    current = (await save(data, current.snapshot.revision)).current; await offer(current);
    assert.equal((await workspace()).status.acknowledgments, 0); await ack(a, current); await ack(b, current); assert.equal((await workspace()).status.materialReady, true);
  });
  await t.test('published ruleset revisions require reasons and cannot silently replace an accepted contract reference', async () => {
    const data = sourceManualProfile(); await assert.rejects(store.saveRuleset(organizer.token, f.tenantId, x.rulesetEntity, { commandId: randomUUID(), expectedRevision: 1, data }));
    const result = await store.saveRuleset(organizer.token, f.tenantId, x.rulesetEntity, { commandId: randomUUID(), expectedRevision: 1, data: { ...data, name: 'Revised standard', amendmentReason: 'New future-event rules profile name.' } });
    await store.publishRuleset(organizer.token, f.tenantId, x.rulesetEntity, { commandId: randomUUID(), snapshotId: result.current.snapshot.snapshotId });
    assert.equal((await workspace()).status.materialReady, true); assert.equal((await workspace()).current.snapshot.data.rulesetRef.snapshotId, x.ruleset.record.snapshotId);
    await assert.rejects(store.publishRuleset(organizer.token, f.tenantId, x.rulesetEntity, { commandId: randomUUID(), snapshotId: x.ruleset.record.snapshotId }));
  });
  await t.test('SQL and TypeScript agree on mandatory material fields, Unicode text and fixed time-zone vocabulary', async () => {
    const profile = sourceManualProfile();
    for (const key of Object.keys(profile)) {
      const bad = structuredClone(profile); delete bad[key];
      await assert.rejects(sql(organizer, 'SELECT lde_competition.save_ruleset($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify(bad), randomUUID()]), e => e.code === '22023');
    }
    for (const [key, value] of Object.entries(profile)) if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const child of Object.keys(value)) {
        const bad = structuredClone(profile); delete bad[key][child];
        await assert.rejects(sql(organizer, 'SELECT lde_competition.save_ruleset($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify(bad), randomUUID()]), e => e.code === '22023');
      }
    }
    for (const name of ['\u00a0\u2000\u2028\ufeff', '\u{1f600}'.repeat(121), '\ud800']) {
      await assert.rejects(sql(organizer, 'SELECT lde_competition.save_ruleset($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify({ ...profile, name }), randomUUID()]));
    }
    for (const name of ['Unicode \u{1f600}\u2028\u0001\t\"\\', '\u{1f600}'.repeat(120)]) {
      const result = await store.saveRuleset(organizer.token, f.tenantId, randomUUID(), { commandId: randomUUID(), expectedRevision: 0, data: { ...profile, name } });
      assert.equal(result.current.snapshot.data.name, name); assert.equal(snapshotOf(result.current.snapshot).contentHash, result.current.contentHash);
    }
    await assert.rejects(sql(organizer, 'SELECT lde_competition.save_ruleset($1,$2,0,$3,$4)', [f.tenantId, '00000000-0000-1000-8000-000000000001', JSON.stringify(profile), randomUUID()]));
    const noncanonical = { ...current.snapshot.data, timeZone: 'US/Eastern' };
    await assert.rejects(sql(organizer, 'SELECT lde_competition.save_contract($1,$2,$3,$4,$5)', [f.tenantId, f.eventId, current.snapshot.revision, JSON.stringify(noncanonical), randomUUID()]));
  });
  await t.test('historical reads preserve exact material and cursor paging never substitutes a historical edit head', async () => {
    const full = await workspace(); const oldest = full.history.at(-1);
    const history = await store.workspace(a.token, f.tenantId, f.eventId, 2147483647, oldest.snapshot.snapshotId);
    assert.equal(history.viewingHistory, true); assert.equal(history.current.contentHash, oldest.contentHash);
    assert.equal(history.details.motion.text, f.motion.record.data.text); assert.equal(history.details.ruleset.name, sourceManualProfile().name);
    assert.equal((await a.client.call(`${endpoint}?snapshot=${randomUUID()}`)).status, 404);
    assert.equal((await a.client.call(`${endpoint}?snapshot=${oldest.snapshot.snapshotId}&snapshot=${oldest.snapshot.snapshotId}`)).status, 400);
    const page = await store.rulesets(organizer.token, f.tenantId, x.rulesetEntity, 2);
    assert.equal(page.records[0].snapshot.revision, 1); assert.equal(page.current.snapshot.revision, 2);
    const ai = await store.saveRuleset(organizer.token, f.tenantId, randomUUID(), { commandId: randomUUID(), expectedRevision: 0, data: { ...sourceManualProfile(), judging: { ...sourceManualProfile().judging, mode: 'ai' } } });
    await assert.rejects(store.publishRuleset(organizer.token, f.tenantId, ai.current.snapshot.entityId, { commandId: randomUUID(), snapshotId: ai.current.snapshot.snapshotId }), e => e.code === '55000');
  });
  await t.test('multi-speaker rosters retain per-side time and custom shares require each individual, not a team proxy', async () => {
    const c = await x.register('third-speaker', 'debater');
    const participant = initialSnapshot('participant', { tenantId: f.tenantId, eventId: null, entityId: randomUUID() }, { publicProfileObjectId: randomUUID() });
    await appendSnapshot(admin, participant, { principalId: organizer.principalId, expectedRevision: 0, idempotencyKey: randomUUID() });
    await admin.query("INSERT INTO lde_security.resource_owners(tenant_id,entity_id,kind,principal_id) VALUES($1,$2,'participant',$3)", [f.tenantId, participant.record.entityId, c.principalId]);
    const team = nextSnapshot(f.team, { ...f.team.record.data, members: [referenceOf(f.participant), referenceOf(participant)] });
    await appendSnapshot(admin, team, { principalId: organizer.principalId, expectedRevision: 1, idempotencyKey: randomUUID() });
    const aAssignment = nextSnapshot(x.assignments[0], { ...x.assignments[0].record.data, teamRef: referenceOf(team) });
    const cAssignment = initialSnapshot('assignment', { tenantId: f.tenantId, eventId: f.eventId, entityId: randomUUID() }, { principalId: c.principalId, role: 'debater', teamRef: referenceOf(team) });
    for (const assignment of [aAssignment, cAssignment]) await appendSnapshot(admin, assignment, { principalId: organizer.principalId, expectedRevision: assignment.record.revision - 1, idempotencyKey: randomUUID() });
    const nextRules = await store.saveRuleset(organizer.token, f.tenantId, randomUUID(), { commandId: randomUUID(), expectedRevision: 0, data: { ...sourceManualProfile(), teamPrizeSplit: 'unanimous-custom' } });
    await store.publishRuleset(organizer.token, f.tenantId, nextRules.current.snapshot.entityId, { commandId: randomUUID(), snapshotId: nextRules.current.snapshot.snapshotId });
    const previousEvent = snapshotOf(JSON.parse((await admin.query('SELECT canonical_record FROM lde.revisions WHERE snapshot_id=$1', [current.snapshot.data.eventRef.snapshotId])).rows[0].canonical_record));
    const nextEvent = nextSnapshot(previousEvent, { ...previousEvent.record.data, rulesetRef: referenceOf(snapshotOf(nextRules.current.snapshot)) });
    await appendSnapshot(admin, nextEvent, { principalId: organizer.principalId, expectedRevision: previousEvent.record.revision, idempotencyKey: randomUUID() });
    const data = { ...current.snapshot.data, eventRef: referenceOf(nextEvent), rulesetRef: referenceOf(snapshotOf(nextRules.current.snapshot)), forTeamRef: referenceOf(team),
      amendmentReason: 'Add a second speaker and require unanimous custom team allocation acceptance.',
      speakers: [
        { ...current.snapshot.data.speakers[0], assignmentRef: referenceOf(aAssignment), openingSeconds: 210, closingSeconds: 90, prizeShareBps: 6000 },
        { ...current.snapshot.data.speakers[0], participantRef: referenceOf(participant), assignmentRef: referenceOf(cAssignment), order: 2, openingSeconds: 210, closingSeconds: 90, prizeShareBps: 4000 },
        { ...current.snapshot.data.speakers[1], prizeShareBps: 10000 },
      ] };
    const badShares = structuredClone(data); badShares.speakers[1].prizeShareBps = 3999; await assert.rejects(save(badShares, current.snapshot.revision));
    const multiplied = structuredClone(data); multiplied.speakers[1].openingSeconds = 420; await assert.rejects(save(multiplied, current.snapshot.revision));
    current = (await save(data, current.snapshot.revision)).current; await offer(current); await ack(a, current); await ack(b, current);
    assert.equal((await workspace()).status.requiredAcknowledgments, 3); assert.equal((await workspace()).status.materialReady, false);
    await ack(a, current); assert.equal((await workspace()).status.acknowledgments, 2);
    await ack(c, current); assert.equal((await workspace()).status.materialReady, true);
  });
  await t.test('credential expiry during a row-lock wait fails current authorization, not merely request-start authorization', async () => {
    const old = (await admin.query('SELECT "expiresAt" FROM lde_auth.session WHERE id=$1', [b.sessionId])).rows[0].expiresAt;
    const locker = await admin.connect(); let pending;
    try {
      await admin.query(`UPDATE lde_auth.session SET "expiresAt"=clock_timestamp()+interval '2 seconds' WHERE id=$1`, [b.sessionId]);
      await locker.query('BEGIN'); await locker.query('SELECT id FROM lde_security.principals WHERE id=$1 FOR UPDATE', [b.principalId]);
      let settled = false; pending = ack(b, current).then(() => ({ allowed: true }), error => ({ error })).finally(() => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(settled, false);
      await new Promise(resolve => setTimeout(resolve, 2100)); await locker.query('COMMIT');
      const result = await pending; assert.equal(result.allowed, undefined); assert.equal(result.error.code, '42501');
    } finally {
      await locker.query('ROLLBACK'); locker.release(); if (pending) await pending;
      await admin.query('UPDATE lde_auth.session SET "expiresAt"=$1 WHERE id=$2', [old, b.sessionId]);
    }
  });
  await t.test('acknowledgment deadlines are enforced against server time and cannot be bypassed by a late client', async () => {
    const deadline = new Date(Date.now() + 10000).toISOString();
    current = (await save({ ...current.snapshot.data, acknowledgmentDeadline: deadline, amendmentReason: 'Synthetic short acknowledgment window for server deadline verification.' }, current.snapshot.revision)).current;
    await offer(current); await ack(a, current);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(deadline) - Date.now() + 50)));
    await assert.rejects(ack(b, current), e => e.code === '55000');
    assert.equal((await workspace()).status.acknowledgmentOpen, false); assert.equal((await workspace()).status.materialReady, false);
    const past = { ...current.snapshot.data, acknowledgmentDeadline: '2020-01-01T00:00:00.000Z' };
    await assert.rejects(save(past, current.snapshot.revision), e => e.code === '55000');
  });
  await t.test('runtime and identity database roles cannot mutate immutable history or call privileged helpers', async () => {
    for (const query of ["SELECT lde_competition.validate_rules('{}')", 'SELECT * FROM lde_competition.acknowledgments', 'DELETE FROM lde_competition.publications', 'UPDATE lde.revisions SET content_hash=content_hash', 'TRUNCATE lde_competition.acceptances']) {
      await assert.rejects(appPool.query(query), e => e.code === '42501'); await assert.rejects(authPool.query(query), e => e.code === '42501');
    }
    const functions = await admin.query("SELECT p.proname, p.proconfig, pg_get_userbyid(p.proowner) AS owner, has_function_privilege('lde_runtime',p.oid,'EXECUTE') AS runtime, has_function_privilege('lde_identity',p.oid,'EXECUTE') AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_competition'");
    assert.deepEqual(functions.rows.filter(r => r.runtime).map(r => r.proname).sort(), ['acknowledge_contract','amend_published_motion','contract_visible','contract_workspace','offer_contract','publish_event_admin','publish_motion','publish_ruleset','ruleset_records','save_contract','save_event_admin','save_motion','save_ruleset','save_series']);
    assert.ok(functions.rows.every(r => !r.identity && r.owner === 'lde_guard' && r.proconfig[0] === 'search_path=pg_catalog, pg_temp'));
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='lde_competition' AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n, 0);
    const tables = await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('lde_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS runtime FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lde_competition' AND c.relkind='r'");
    assert.deepEqual(tables.rows.map(r => r.relname).sort(), ['acceptances','acknowledgments','audit','commands','contract_signers','event_contracts','invalidations','publications']); assert.ok(tables.rows.every(r => r.relrowsecurity && r.relforcerowsecurity && !r.runtime));
    await assert.rejects(admin.query('DELETE FROM lde_competition.acknowledgments'), e => e.code === '55000');
    const audit = await admin.query('SELECT count(*)::int AS n FROM lde_competition.audit WHERE tenant_id=$1', [f.tenantId]); assert.ok(audit.rows[0].n > 10);
  });
}

