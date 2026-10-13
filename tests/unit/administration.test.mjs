import test from 'node:test';
import assert from 'node:assert/strict';
import { amendPublishedMotion, createEvent, createMotion, createSeries, publishEvent, publishMotion, reviseDraftMotion } from '../../packages/competition/src/administration.ts';

const actor = 'organizer-1';
const at = '2027-01-01T12:00:00.000Z';
const series = createSeries({ id: 'series-1', tenantId: 'tenant-1', name: 'Civic Forum', season: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
const draft = createMotion({ motionId: 'motion-1', wording: 'Resolved: cities should eliminate parking minimums.', description: 'Urban land-use policy.', categories: ['Housing', 'Transport'], createdAt: at, createdBy: actor });

test('series and motion inputs are normalized, validated and immutable', () => {
  assert.equal(series.name, 'Civic Forum');
  assert.equal(draft.revision, 1);
  assert.ok(Object.isFrozen(series));
  assert.ok(Object.isFrozen(draft.categories));
  assert.throws(() => createSeries({ ...series, startsOn: '2027-02-30' }));
  assert.throws(() => createSeries({ ...series, endsOn: '2026-12-31' }));
  assert.throws(() => createMotion({ ...draft, categories: ['Housing', 'housing'] }));
});

test('draft motion edits use optimistic revisions', () => {
  const revised = reviseDraftMotion(draft, { ...draft, wording: 'Resolved: cities should repeal parking minimums.', createdAt: '2027-01-02T12:00:00.000Z' }, 1);
  assert.equal(revised.revision, 2);
  assert.equal(draft.wording, 'Resolved: cities should eliminate parking minimums.');
  assert.throws(() => reviseDraftMotion(revised, revised, 1), /conflict/);
});

test('an event binds one exact published motion revision', () => {
  const motion = publishMotion(draft, 1);
  const event = createEvent({ id: 'event-1', tenantId: series.tenantId, seriesId: series.id, motionId: motion.motionId, motionRevision: motion.revision, title: 'Housing Debate', venue: 'City Hall', broadcastMode: 'public-stream', updatedAt: at, updatedBy: actor }, series, motion);
  assert.equal(event.motionRevision, 1);
  assert.equal(publishEvent(event, 1).state, 'published');
  assert.throws(() => createEvent({ ...event, motionRevision: 99 }, series, motion), /exact published motion/);
  assert.throws(() => createEvent({ ...event, tenantId: 'another-tenant' }, series, motion), /tenant/);
});

test('published wording cannot be silently edited', () => {
  const motion = publishMotion(draft, 1);
  assert.throws(() => reviseDraftMotion(motion, { ...motion, wording: 'Different wording' }, 1), /explicit amendment/);
  assert.throws(() => publishMotion(motion, 1), /draft/);
});

test('published amendment preserves old wording and advances event and motion revisions together', () => {
  const motion = publishMotion(draft, 1);
  const event = publishEvent(createEvent({ id: 'event-1', tenantId: series.tenantId, seriesId: series.id, motionId: motion.motionId, motionRevision: motion.revision, title: 'Housing Debate', venue: 'City Hall', broadcastMode: 'public-stream', updatedAt: at, updatedBy: actor }, series, motion), 1);
  const result = amendPublishedMotion(motion, event, { ...motion, wording: 'Resolved: cities should repeal mandatory parking minimums.', reason: 'Clarify that the policy concerns mandatory minimums.', createdAt: '2027-01-03T12:00:00.000Z', createdBy: actor }, 1, 2);
  assert.equal(result.motion.revision, 2);
  assert.equal(result.event.motionRevision, 2);
  assert.equal(result.amendment.previousWording, draft.wording);
  assert.equal(result.amendment.replacementWording, result.motion.wording);
  assert.equal(motion.wording, draft.wording);
  assert.throws(() => amendPublishedMotion(motion, event, { ...motion, reason: 'too short', createdAt: at, createdBy: actor }, 1, 2), /at least 10/);
  assert.throws(() => amendPublishedMotion(motion, event, { ...motion, wording: 'New wording.', reason: 'A sufficiently detailed reason.', createdAt: at, createdBy: actor }, 0, 2), /conflict/);
});
