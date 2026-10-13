import test from 'node:test';
import assert from 'node:assert/strict';
import { amendmentInput, eventInput, motionInput, publishAdministrationInput, seriesInput } from '../../packages/competition/src/administration-store.ts';

const id = (n) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;

test('administration commands require exact normalized contracts', () => {
  const series = { commandId: id(1), expectedRevision: 0, data: { name: 'Civic Forum', season: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' } };
  assert.equal(seriesInput(series).data.name, 'Civic Forum');
  assert.throws(() => seriesInput({ ...series, data: { ...series.data, ignored: true } }));
  assert.throws(() => seriesInput({ ...series, data: { ...series.data, startsOn: '2027-02-30' } }));
  assert.throws(() => seriesInput({ ...series, commandId: 'client-command' }));
});

test('motion, event, publication and amendment parsers reject ambiguous input', () => {
  const motion = { commandId: id(2), expectedRevision: 0, data: { seriesId: id(3), wording: 'Resolved: cities should remove parking minimums.', description: 'Urban land-use policy.', categories: ['Housing', 'Transport'] } };
  assert.equal(motionInput(motion).data.categories.length, 2);
  assert.throws(() => motionInput({ ...motion, data: { ...motion.data, categories: ['Housing', 'housing'] } }));
  assert.throws(() => motionInput({ ...motion, data: { ...motion.data, wording: 'e\u0301' } }));
  const event = { commandId: id(4), expectedRevision: 1, data: { seriesId: id(3), motionId: id(5), motionRevision: 2, title: 'Housing Debate', venue: 'City Hall', broadcastMode: 'public-stream' } };
  assert.equal(eventInput(event).data.broadcastMode, 'public-stream');
  assert.throws(() => eventInput({ ...event, data: { ...event.data, broadcastMode: 'social-video' } }));
  assert.equal(publishAdministrationInput({ commandId: id(6), expectedRevision: 2 }).expectedRevision, 2);
  assert.throws(() => amendmentInput({ commandId: id(7), expectedMotionRevision: 2, expectedEventRevision: 4, data: { wording: motion.data.wording, description: motion.data.description, categories: motion.data.categories, reason: 'short' } }));
});
