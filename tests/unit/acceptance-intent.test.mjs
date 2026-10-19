import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAcceptanceIntent, compareAcceptanceIntent } from '../../packages/competition/src/acceptance-intent.mjs';
const intent = () => ({ commandId:'command-1', tenantId:'tenant-1', eventId:'event-1',
  documentId:'terms-1', documentRevision:4, documentHash:'e'.repeat(64), accepted:true });
const reference = () => { const { commandId, accepted, ...expected }=intent(); return expected; };
test('consent intent pins immutable reference while refusing to authorize a receipt', () => {
 const record=parseAcceptanceIntent(intent()); assert.ok(Object.isFrozen(record)); assert.equal(record.accepted,true);
 assert.deepEqual(compareAcceptanceIntent(intent(),reference()), { matched:true, recordable:false });
 for(const mismatch of [{eventId:'event-2'},{documentRevision:5},{documentHash:'a'.repeat(64)}]) {
  assert.deepEqual(compareAcceptanceIntent(intent(),{...reference(),...mismatch}), { matched:false, recordable:false });
 }
});
test('caller-provided identity, timestamp, guardian assertion, false acceptance and duplicate secret fields rejected', () => {
 for (const patch of [
  { principalId:'a' },{acceptedAt:'2026-10-18T00:00:00Z'}, {guardianVerified:true},
  {accepted:false}, {documentRevision:0}, {documentHash:'unverified'},
  {eventId:'../tenant'},
 ]) assert.throws(()=>parseAcceptanceIntent({...intent(),...patch}));
 assert.throws(()=>compareAcceptanceIntent(intent(),{...reference(),publisherApproved:true}));
});
