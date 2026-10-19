import test from 'node:test';
import assert from 'node:assert/strict';
import { previewProductionChecklist } from '../../packages/competition/src/production-checklist.mjs';
const schedule=()=>({tenantId:'tenant-1',eventId:'event-1',doorsAt:'2027-01-02T12:00:00.000Z',
 startsAt:'2027-01-02T13:00:00.000Z',endsAt:'2027-01-02T15:00:00.000Z',productionReady:true});
const item=(code,state,dueAt='2027-01-02T11:00:00.000Z')=>({tenantId:'tenant-1',eventId:'event-1',code,ownerId:'staff-1',state,dueAt});
test('overdue and blocked readiness items are counted without revealing owner identity',()=>{
 const x=previewProductionChecklist(schedule(),[item('venue','completed'),item('sound','blocked'),item('signage','not-started','2027-01-02T14:00:00.000Z')]);
 assert.deepEqual([x.completed,x.blocked,x.pending,x.overdue],[1,1,2,1]);
 assert.equal(x.verifiedSignoff,false);assert.equal(x.productionReady,false);
 assert.ok(!('ownerId' in x));assert.ok(!('items' in x));
 assert.equal(previewProductionChecklist(schedule(),[item('venue','completed')]).productionReady,false);
 assert.equal(previewProductionChecklist(schedule(),[]).allReportedComplete,false);
});
test('cross-tenant tasks, duplicate IDs, injected approval and invalid dates cannot be trusted',()=>{
 const good=item('venue','not-started');
 for(const bad of [
  {...good,code:'../cross'}, {...good,tenantId:'another'}, {...good,eventId:'other'},
  {...good,state:'automatically-approved'},{...good,dueAt:'2027-02-30T11:00:00.000Z'},
  {...good,signoff:true},
 ]) assert.throws(()=>previewProductionChecklist(schedule(),[bad]));
 assert.throws(()=>previewProductionChecklist(schedule(),[good,good]));
});
