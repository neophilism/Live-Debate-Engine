import test from 'node:test';
import assert from 'node:assert/strict';
import { displayProductionSchedule } from '../../packages/competition/src/scheduling-zones.mjs';
const fixture=(day,start,end)=>({eventId:'event-1',tenantId:'tenant-1',
 doorsAt:day+'T'+start+'.000Z',startsAt:day+'T'+start+'.000Z',endsAt:day+'T'+end+'.000Z',productionReady:false});
test('timezone presentation stays tied to canonical UTC and shows DST offset changes',()=>{
 const winter=displayProductionSchedule(fixture('2027-01-02','17:00:00','19:00:00'),'America/New_York');
 const summer=displayProductionSchedule(fixture('2027-07-02','17:00:00','19:00:00'),'America/New_York');
 assert.match(winter.local.startsAt,/GMT-5/);
 assert.match(summer.local.startsAt,/GMT-4/);
 assert.equal(winter.utc.startsAt,'2027-01-02T17:00:00.000Z');
 assert.equal(winter.dispatchAllowed,false);
 assert.equal(summer.authorized,false);
 assert.ok(Object.isFrozen(winter.local));
});
test('invalid IANA zones, chronology, and invalid locales fail before presenting a time',()=>{
 assert.throws(()=>displayProductionSchedule(fixture('2027-01-02','17:00:00','19:00:00'),'Invalid/Zone'));
 assert.throws(()=>displayProductionSchedule(fixture('2027-01-02','17:00:00','19:00:00'),'UTC','bad_locale_????'));
 assert.throws(()=>displayProductionSchedule(fixture('2027-01-02','17:00:00','16:00:00'),'UTC'));
});
