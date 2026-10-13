import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AdministrationStore } from '../../dist/packages/competition/src/administration-store.js';
import { administerAccess } from '../../dist/packages/identity/src/administration.js';

export async function runAdministrationCases(admin, appPool, fixture) {
  const { f, organizer, outsider } = fixture;
  const store = new AdministrationStore(appPool);
  const seriesId = randomUUID();
  const motionId = randomUUID();
  const eventId = randomUUID();
  await administerAccess(admin, 'role', { principalId: organizer.principalId, tenantId: f.tenantId, eventId, role: 'organizer', expiresAt: null, revoked: 'no', reason: 'Synthetic E08 organizer scope' });
  await administerAccess(admin, 'role', { principalId: outsider.principalId, tenantId: f.tenantId, eventId, role: 'audience', expiresAt: null, revoked: 'no', reason: 'Synthetic E08 denial scope' });
  const seriesData = { name: 'Synthetic Civic Forum', season: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' };
  const motionData = { seriesId, wording: 'Resolved: cities should eliminate parking minimums.', description: 'Synthetic urban land-use policy.', categories: ['Housing', 'Transport'] };

  const seriesCommand = { commandId: randomUUID(), expectedRevision: 0, data: seriesData };
  const firstSeries = await store.saveSeries(organizer.token, f.tenantId, seriesId, seriesCommand);
  const replayedSeries = await store.saveSeries(organizer.token, f.tenantId, seriesId, seriesCommand);
  assert.equal(firstSeries.current.snapshot.snapshotId, replayedSeries.current.snapshot.snapshotId);
  assert.equal(replayedSeries.replayed, true);
  assert.equal(firstSeries.current.snapshot.data.updatedBy, organizer.principalId);

  const draftMotion = await store.saveMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: 0, data: motionData });
  const publishedMotion = await store.publishMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: draftMotion.current.snapshot.revision });
  assert.equal(publishedMotion.current.snapshot.data.state, 'published');
  await assert.rejects(store.saveMotion(organizer.token, f.tenantId, motionId, { commandId: randomUUID(), expectedRevision: 2, data: { ...motionData, wording: 'Silent replacement.' } }));

  const eventData = { seriesId, motionId, motionRevision: publishedMotion.current.snapshot.revision, title: 'Synthetic Housing Debate', venue: 'City Hall', broadcastMode: 'public-stream' };
  await assert.rejects(store.saveEvent(outsider.token, f.tenantId, eventId, { commandId: randomUUID(), expectedRevision: 0, data: eventData }));
  const draftEvent = await store.saveEvent(organizer.token, f.tenantId, eventId, { commandId: randomUUID(), expectedRevision: 0, data: eventData });
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
  const counts = await admin.query("SELECT kind,count(*)::int AS n FROM lde.revisions WHERE tenant_id=$1 AND entity_id=ANY($2::uuid[]) GROUP BY kind", [f.tenantId, [motionId, eventId]]);
  assert.equal(counts.rows.find((row) => row.kind === 'motion').n, 3);
  assert.equal(counts.rows.find((row) => row.kind === 'event').n, 3);
}
