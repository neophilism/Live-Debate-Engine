import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RosterStore } from '../../dist/packages/competition/src/roster-store.js';
export async function runRosterDraftCases(admin, pool, x) {
  const { f, organizer, a, b, outsider } = x; const store = new RosterStore(pool);
  assert.deepEqual(await store.workspace(organizer.token, f.tenantId, f.eventId), { draft: null, operational: false, reviews: [], nextCandidate: null });
  await assert.rejects(store.workspace(outsider.token, f.tenantId, f.eventId));
  const review = { eligible: true, available: true, conflictClear: true, expiresAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Synthetic reviewed eligibility and availability evidence.' };
  const reviewA = { commandId: randomUUID(), expectedRevision: 0, data: review };
  const first = await store.review(organizer.token, f.tenantId, f.eventId, a.principalId, reviewA);
  assert.equal(first.review.reviewed_by, organizer.principalId); assert.equal(first.operational, false);
  assert.equal((await store.review(organizer.token, f.tenantId, f.eventId, a.principalId, reviewA)).replayed, true);
  await assert.rejects(store.review(organizer.token, f.tenantId, f.eventId, a.principalId, { ...reviewA, commandId: randomUUID() }));
  await assert.rejects(store.review(organizer.token, f.tenantId, f.eventId, organizer.principalId, { ...reviewA, commandId: randomUUID() }));
  await assert.rejects(store.review(outsider.token, f.tenantId, f.eventId, a.principalId, reviewA));
  await assert.rejects(store.review(organizer.token, randomUUID(), f.eventId, a.principalId, reviewA));
  const entries = [
    { principalId: a.principalId, role: 'debater', teamId: f.team.record.entityId, side: 'for', position: 1 },
    { principalId: b.principalId, role: 'debater', teamId: f.team2.record.entityId, side: 'against', position: 1 },
    { principalId: outsider.principalId, role: 'judge', teamId: null, side: null, position: null },
  ];
  const command = { commandId: randomUUID(), expectedRevision: 0, entries };
  await assert.rejects(store.saveDraft(organizer.token, f.tenantId, f.eventId, command));
  for (const person of [b, outsider]) await store.review(organizer.token, f.tenantId, f.eventId, person.principalId, { commandId: randomUUID(), expectedRevision: 0, data: review });
  const saved = await store.saveDraft(organizer.token, f.tenantId, f.eventId, command);
  assert.equal(saved.revision, 1); assert.equal(saved.operational, false); assert.equal(saved.reviewVersions[a.principalId], 1);
  assert.equal((await store.saveDraft(organizer.token, f.tenantId, f.eventId, command)).replayed, true);
  await assert.rejects(store.saveDraft(organizer.token, f.tenantId, f.eventId, { ...command, commandId: randomUUID() }));
  const changes = await admin.query('SELECT count(*)::int AS n FROM lde_casting.drafts WHERE tenant_id=$1 AND event_id=$2', [f.tenantId, f.eventId]); assert.equal(changes.rows[0].n, 1);
  await store.review(organizer.token, f.tenantId, f.eventId, a.principalId, { commandId: randomUUID(), expectedRevision: 1, data: { ...review, conflictClear: false, reason: 'Synthetic unresolved conflict must prevent the next roster revision.' } });
  await assert.rejects(store.saveDraft(organizer.token, f.tenantId, f.eventId, { ...command, expectedRevision: 1, commandId: randomUUID() }));
  assert.equal((await store.workspace(organizer.token, f.tenantId, f.eventId)).draft.revision, 1);
  await assert.rejects(pool.query('SELECT * FROM lde_casting.reviews'));
  await assert.rejects(pool.query("SELECT lde_casting.authorize($1,$2)", [f.tenantId, f.eventId]));
  await assert.rejects(admin.query('DELETE FROM lde_casting.drafts'));
  const functions = await admin.query("SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,has_function_privilege('lde_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('lde_identity',p.oid,'EXECUTE') AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_casting'");
  assert.deepEqual(functions.rows.filter(r => r.runtime).map(r => r.proname).sort(), ['review','save_draft','workspace']);
  assert.ok(functions.rows.every(r => !r.identity && r.owner === 'lde_guard'));
  // A saved roster draft creates no identity grant or actual competition assignment.
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM lde_security.role_grants WHERE tenant_id=$1 AND event_id=$2 AND principal_id=$3 AND role='judge'", [f.tenantId, f.eventId, outsider.principalId])).rows[0].n, 0);
}
