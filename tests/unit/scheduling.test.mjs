import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionSchedule,previewCommunication} from '../../packages/competition/src/scheduling.mjs';
const valid=()=>({eventId:'event-1',tenantId:'tenant-1',doorsAt:'2027-01-01T16:00:00.000Z',
 startsAt:'2027-01-01T17:00:00.000Z',endsAt:'2027-01-01T19:00:00.000Z',productionReady:false});
test('schedule chronology bounded and immutable',()=>{
 const a=validateProductionSchedule(valid());assert.ok(Object.isFrozen(a));
 assert.throws(()=>validateProductionSchedule({...valid(),endsAt:'2027-01-01T15:00:00.000Z'}));
 assert.throws(()=>validateProductionSchedule({...valid(),startsAt:'2027-02-30T17:00:00.000Z'}));
});
test('preview never permits dispatch even with approval flag',()=>{
 for(const approved of [false,true]){
 const p=previewCommunication(valid(),{audience:'staff',approved});
 assert.equal(p.dispatchAllowed,false);assert.equal(p.deliveryState,'not-sent');
 }
 assert.throws(()=>previewCommunication(valid(),{audience:'everyone'}));
});
