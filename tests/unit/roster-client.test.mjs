import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RosterDraftClient, rosterDraftCommand } from '../../dist/packages/ui/src/roster-client.js';

test('roster draft client preserves scope, browser credentials and explicit non-operational response', async () => {
  const tenant = randomUUID(), event = randomUUID(), candidate = randomUUID();
  const calls = [];
  const transport = async (path, options) => {
    calls.push([path, options]);
    return { ok: true, json: async () => ({ operational: false, revision: 2 }) };
  };
  const client = new RosterDraftClient(transport);
  await client.workspace(tenant, event, candidate);
  assert.match(calls[0][0], new RegExp(`^/api/tenants/${tenant}/events/${event}/roster\\?before=${candidate}$`));
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
  const cmd = rosterDraftCommand(null, 'draft', { revision: 1 });
  assert.equal(rosterDraftCommand(cmd, 'draft', { revision: 1 }), cmd);
  assert.notEqual(rosterDraftCommand(cmd, 'draft', { revision: 2 }).commandId, cmd.commandId);
  await client.review(tenant, event, candidate, cmd, { eligible: true }, 1);
  const body = JSON.parse(calls.at(-1)[1].body);
  assert.deepEqual(body, { commandId: cmd.commandId, expectedRevision: 1, data: { eligible: true } });
  assert.equal(calls.at(-1)[1].redirect, 'error');
  await client.saveDraft(tenant, event, cmd, [], 1);
  assert.equal(JSON.parse(calls.at(-1)[1].body).commandId, cmd.commandId);
});
test('roster client never accepts a grant-looking or failed server response', async () => {
  const tenant = randomUUID(), event = randomUUID();
  for (const response of [
    { ok: true, json: async () => ({ operational: true, role: 'judge' }) },
    { ok: true, json: async () => ({ revision: 1 }) },
    { ok: false, status: 403, json: async () => ({ operational: false }) },
  ]) {
    const client = new RosterDraftClient(async () => response);
    await assert.rejects(client.workspace(tenant, event));
  }
  const client = new RosterDraftClient(async () => { throw new Error('Should not reach transport'); });
  await assert.rejects(client.workspace('../escape', event));
});
