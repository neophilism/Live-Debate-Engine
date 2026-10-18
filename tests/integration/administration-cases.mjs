import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AdministrationStore } from '../../dist/packages/competition/src/administration-store.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';
import { withCredential } from '../../dist/packages/identity/src/broker.js';

export async function runAdministrationCases(admin, appPool, fixture) {
  const { f, organizer, outsider } = fixture;
  const store = new AdministrationStore(appPool);
  const seriesId = randomUUID();
  const motionId = randomUUID();
  const eventId = randomUUID();
  const seriesData = { name: 'Synthetic Civic Forum', season: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' };
  const motionData = { seriesId, wording: 'Resolved: cities should eliminate parking minimums.', description: 'Synthetic urban land-use policy.', categories: ['Housing', 'Transport'] };

  const seriesCommand = { commandId: randomUUID(), expectedRevision: 0, data: seriesData };
  const firstSeries = await store.saveSeries(organizer.token, f.tenantId, seriesId, seriesCommand);
  const replayedSeries = await store.saveSeries(organizer.token, f.tenantId, seriesId, seriesCommand);
  assert.equal(firstSeries.current.snapshot.snapshotId, replayedSeries.current.snapshot.snapshotId);
  assert.equal(replayedSeries.replayed, true);
  assert.equal(firstSeries.current.snapshot.data.updatedBy, organizer.principalId);
  const rawSeries = (data) => withCredential(appPool, organizer.token, (client) => client.query(
    'SELECT lde_competition.save_series($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify(data), randomUUID()],
  ));
  await assert.rejects(rawSeries({ ...seriesData, name: 7 }));
  await assert.rejects(rawSeries({ ...seriesData, name: '😀'.repeat(101) }));
  const rawMotion = (data) => withCredential(appPool, organizer.token, (client) => client.query(
    'SELECT lde_competition.save_motion($1,$2,0,$3,$4)', [f.tenantId, randomUUID(), JSON.stringify(data), randomUUID()],
  ));
  await assert.rejects(rawMotion({ ...motionData, categories: [7] }));

  const draftMotion = await store.saveMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: 0, data: motionData });
  const publishedMotion = await store.publishMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: draftMotion.current.snapshot.revision });
  assert.equal(publishedMotion.current.snapshot.data.state, 'published');
  await assert.rejects(store.saveMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: 2, data: { ...motionData, wording: 'Silent replacement.' } }));

  const eventData = { seriesId, motionId, motionRevision: publishedMotion.current.snapshot.revision, title: 'Synthetic Housing Debate', venue: 'City Hall', broadcastMode: 'public-stream' };
  const draftEvent = await store.saveEvent(organizer.token, f.tenantId, eventId, { commandId: randomUUID(), expectedRevision: 0, data: eventData });
  await administerAccess(admin, 'role', { principalId: organizer.principalId, tenantId: f.tenantId, eventId, role: 'organizer', expiresAt: null, revoked: 'no', reason: 'Synthetic E08 organizer scope' });
  await administerAccess(admin, 'role', { principalId: outsider.principalId, tenantId: f.tenantId, eventId, role: 'audience', expiresAt: null, revoked: 'no', reason: 'Synthetic E08 denial scope' });
  await assert.rejects(store.saveEvent(outsider.token, f.tenantId, eventId, { commandId: randomUUID(), expectedRevision: draftEvent.current.snapshot.revision, data: eventData }));
  const publishedEvent = await store.publishEvent(organizer.token, f.tenantId, eventId, { commandId: randomUUID(), expectedRevision: draftEvent.current.snapshot.revision });
  assert.equal(publishedEvent.current.snapshot.data.state, 'published');

  const amendment = await store.amendPublishedMotion(organizer.token, f.tenantId, eventId, motionId, {
    commandId: randomUUID(), expectedMotionRevision: publishedMotion.current.snapshot.revision,
    expectedEventRevision: publishedEvent.current.snapshot.revision,
    data: { wording: 'Resolved: cities should repeal mandatory parking minimums.', description: motionData.description, categories: motionData.categories, reason: 'Clarify that the policy concerns mandatory minimums.' },
  });
  assert.equal(amendment.motion.snapshot.revision, publishedMotion.current.snapshot.revision + 1);
  assert.equal(amendment.event.snapshot.data.motionRevision, amendment.motion.snapshot.revision);
  assert.equal(amendment.amendment.previousWording, motionData.wording);
  assert.equal(amendment.amendment.amendedBy, organizer.principalId);
  await assert.rejects(store.amendPublishedMotion(organizer.token, f.tenantId, eventId, motionId, {
    commandId: randomUUID(), expectedMotionRevision: publishedMotion.current.snapshot.revision,
    expectedEventRevision: publishedEvent.current.snapshot.revision,
    data: { wording: 'Another wording.', description: motionData.description, categories: motionData.categories, reason: 'This stale amendment must fail atomically.' },
  }));
  const listed = await store.records(organizer.token, f.tenantId, 'motion');
  assert.equal(listed.records.find(row => row.snapshot.entityId === motionId).snapshot.revision, 3);
  const history = await store.records(organizer.token, f.tenantId, 'motion', motionId);
  assert.deepEqual(history.records.map(row => row.snapshot.revision), [3, 2, 1]);
  assert.equal(history.records[2].snapshot.data.wording, motionData.wording);
  assert.equal((await store.records(organizer.token, f.tenantId, 'motion', motionId, null, 3)).records.length, 2);
  await assert.rejects(store.records(outsider.token, f.tenantId, 'series'));
  await assert.rejects(store.records(organizer.token, randomUUID(), 'series'));
  await assert.rejects(withCredential(appPool, organizer.token, client => client.query(
    'SELECT lde_competition.administration_records($1,$2,NULL,NULL,1)', [f.tenantId, 'untrusted-table'])));
  // A page boundary must not drop or duplicate entity identities.
  for (let n = 0; n < 51; n++) await store.saveSeries(organizer.token, f.tenantId, randomUUID(), {
    commandId: randomUUID(), expectedRevision: 0, data: { ...seriesData, name: `Synthetic pagination ${n}` },
  });
  const firstPage = await store.records(organizer.token, f.tenantId, 'series');
  assert.equal(firstPage.records.length, 50); assert.ok(firstPage.nextCursor);
  const secondPage = await store.records(organizer.token, f.tenantId, 'series', null, firstPage.nextCursor);
  const ids = [...firstPage.records, ...secondPage.records].map(row => row.snapshot.entityId);
  assert.equal(new Set(ids).size, ids.length); assert.ok(ids.includes(seriesId));
  const counts = await admin.query("SELECT kind,count(*)::int AS n FROM lde.revisions WHERE tenant_id=$1 AND entity_id=ANY($2::uuid[]) GROUP BY kind", [f.tenantId, [motionId, eventId]]);
  assert.equal(counts.rows.find((row) => row.kind === 'motion').n, 3);
  assert.equal(counts.rows.find((row) => row.kind === 'event').n, 3);
}

