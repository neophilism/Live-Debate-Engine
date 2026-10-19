import test from 'node:test';
import assert from 'node:assert/strict';
import { previewResourceConflicts } from '../../packages/competition/src/scheduling-conflicts.mjs';
const booking=(eventId,startAt,endAt,resourceId='room-A')=>({tenantId:'tenant-1',eventId,resourceKind:'venue',resourceId,startAt,endAt});
test('resource collision detects overlapping venues but not back-to-back holds',()=>{
 const a=booking('event-a','2027-01-02T12:00:00.000Z','2027-01-02T14:00:00.000Z');
 const b=booking('event-b','2027-01-02T13:00:00.000Z','2027-01-02T15:00:00.000Z');
 const clash=previewResourceConflicts([a,b]);
 assert.equal(clash.conflicts.length,1);
 assert.equal(clash.conflicts[0].overlapStartsAt,'2027-01-02T13:00:00.000Z');
 assert.equal(clash.productionReady,false);
 assert.equal(clash.bookingCommitted,false);
 assert.equal(previewResourceConflicts([a,booking('event-b','2027-01-02T14:00:00.000Z','2027-01-02T15:00:00.000Z')]).noReportedConflicts,true);
 assert.equal(previewResourceConflicts([a,{...b,resourceId:'room-B'}]).noReportedConflicts,true);
});
test('cross-tenant, malformed, zero-duration, long and unauthorized resource kinds are rejected',()=>{
 const a=booking('event-a','2027-01-02T12:00:00.000Z','2027-01-02T14:00:00.000Z');
 const reject=b=>assert.throws(()=>previewResourceConflicts([a,b]));
 reject({...a,tenantId:'tenant-2'});
 reject({...a,eventId:'../escape'});
 reject({...a,resourceKind:'private-identity'});
 reject({...a,endAt:a.startAt});
 reject({...a,endAt:'2027-01-05T12:00:00.000Z'});
 reject({...a,secret:'unsafe'});
 assert.throws(()=>previewResourceConflicts('not-an-array'));
});
