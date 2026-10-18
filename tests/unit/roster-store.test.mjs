import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewCandidateInput, saveRosterDraftInput, RosterStore } from '../../dist/packages/competition/src/roster-store.js';
const entry = () => ({ principalId: randomUUID(), role: 'judge', teamId: null, side: null, position: null });
test('casting review requires exact bounded data and real command/revision identity', () => {
  const input = { commandId: randomUUID(), expectedRevision: 0, data: { eligible: false, available: true, conflictClear: false, expiresAt: '2026-10-20T12:00:00.000Z', reason: 'Review is still pending.' } };
  assert.equal(reviewCandidateInput(input).data.eligible, false);
  for (const patch of [{ commandId: 'guess' }, { expectedRevision: -1 }, { data: { ...input.data, eligible: 'yes' } }, { data: { ...input.data, actor: randomUUID() } }]) assert.throws(() => reviewCandidateInput({ ...input, ...patch }));
});
test('draft entries cannot claim owner roles, extra authority or unbounded data', () => {
  const input = { commandId: randomUUID(), expectedRevision: 0, entries: [entry(), entry(), entry()] };
  assert.equal(saveRosterDraftInput(input).entries.length, 3);
  for (const entries of [[], Array(101).fill(entry()), [{ ...entry(), role: 'owner' }, entry(), entry()], [{ ...entry(), token: 'Synthetic' }, entry(), entry()]]) assert.throws(() => saveRosterDraftInput({ ...input, entries }));
});
test('duplicate identities and invalid speaking positions fail before any database access', async () => {
  const store = new RosterStore({ connect: () => { throw new Error('Database must not be reached'); } }); const id = randomUUID();
  const shared = entry(); const command = { commandId: randomUUID(), expectedRevision: 0, entries: [shared, shared, entry()] };
  assert.throws(() => store.saveDraft('Synthetic-credential-000000', id, id, command), /Duplicate roster identity/);
  assert.throws(() => store.saveDraft('Synthetic-credential-000000', id, id, { ...command, entries: [{ ...entry(), role: 'debater' }, entry(), entry()] }), /exact team/);
});
