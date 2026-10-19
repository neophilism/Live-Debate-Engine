import test from 'node:test';
import assert from 'node:assert/strict';
import { projectConsentHistory } from '../../packages/competition/src/acceptance-history.mjs';
const scope=()=>({tenantId:'tenant-1',eventId:'event-1',participantId:'person-1',documentId:'terms-1'});
const entry=(eventType,sequence,documentRevision=1,documentHash='a'.repeat(64))=>({...scope(),eventType,sequence,documentRevision,documentHash,recordedAt:`2026-10-18T12:00:${String(sequence).padStart(2,'0')}.000Z`});
test('append-only consent projection does not resurrect withdrawn acceptance or grant permissions',()=>{
 const active=projectConsentHistory({...scope(),events:[entry('accepted',1)]});
 assert.deepEqual(active.active,{revision:1,documentHash:'a'.repeat(64),sequence:1,acceptedAt:'2026-10-18T12:00:01.000Z'});
 assert.equal(active.participantAuthorized,false);
 const withdrawn=projectConsentHistory({...scope(),events:[entry('accepted',1),entry('withdrawn',2)]});
 assert.equal(withdrawn.active,null);
 const renewed=projectConsentHistory({...scope(),events:[entry('accepted',1),entry('withdrawn',2),entry('accepted',3,2,'b'.repeat(64))]});
 assert.equal(renewed.active.revision,2);
 assert.equal(renewed.ledgerAuthenticityVerified,false);
});
test('skipped sequence, wrong participant, unrelated withdrawal and unknown ledger keys fail',()=>{
 const reject=events=>assert.throws(()=>projectConsentHistory({...scope(),events}));
 reject([entry('accepted',2)]);
 reject([entry('withdrawn',1)]);
 reject([entry('accepted',1),entry('withdrawn',2,3)]);
 reject([entry('accepted',1),{...entry('withdrawn',2),participantId:'person-2'}]);
 reject([{...entry('accepted',1),acceptedBy:'unverified'}]);
 reject([entry('accepted',1),entry('accepted',1)]);
 reject([entry('accepted',1),entry('accepted',2)]);
 reject([entry('accepted',1,2),entry('accepted',2,1)]);
 reject([entry('accepted',1),entry('withdrawn',2,1,'b'.repeat(64))]);
 reject([{...entry('accepted',1),recordedAt:'not-a-time'}]);
 reject([entry('accepted',1),{...entry('withdrawn',2),recordedAt:'2026-10-18T11:59:59.000Z'}]);
});
