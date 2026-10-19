import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNotificationAudience } from '../../packages/competition/src/communication-preflight.mjs';
const schedule=()=>({tenantId:'tenant-1',eventId:'event-1',doorsAt:'2027-01-01T12:00:00.000Z',
 startsAt:'2027-01-01T13:00:00.000Z',endsAt:'2027-01-01T15:00:00.000Z',productionReady:true});
const person=(id,override={})=>({principalId:id,tenantId:'tenant-1',eventId:'event-1',
 audience:'participants',optedOut:false,deliveryEligible:true,...override});
test('communications preview excludes opt-outs, exposes no addresses and never permits dispatch',()=>{
 const summary=previewNotificationAudience(schedule(),'participants',[person('a'),person('b',{optedOut:true}),
   person('c',{deliveryEligible:false})]);
 assert.deepEqual([summary.potentialRecipients,summary.optedOut,summary.unavailable],[1,1,1]);
 assert.equal(summary.dispatchAllowed,false);assert.equal(summary.subscriptionVerified,false);
 assert.equal(summary.contactDataIncluded,false);assert.equal(summary.operational,false);
 assert.ok(!('recipients' in summary));
});
test('reject mixed tenants, wrong audience, duplicates, unsafe extra fields, empty identifier',()=>{
 const reject=rows=>assert.throws(()=>previewNotificationAudience(schedule(),'participants',rows));
 reject([person('a'),person('a')]);
 reject([person('a',{tenantId:'tenant-2'})]);
 reject([person('a',{eventId:'event-2'})]);
 reject([person('a',{audience:'staff'})]);
 reject([person('a',{principalId:''})]);
 reject([person('a',{email:'sensitive@example.invalid'})]);
 assert.throws(()=>previewNotificationAudience(schedule(),'public',[person('a')]));
});
