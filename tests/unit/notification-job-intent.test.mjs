import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNotificationJob } from '../../packages/competition/src/notification-job-intent.mjs';
const schedule=()=>({tenantId:'tenant-1',eventId:'event-1',doorsAt:'2027-01-02T12:00:00.000Z',
 startsAt:'2027-01-02T13:00:00.000Z',endsAt:'2027-01-02T15:00:00.000Z',productionReady:true});
const command=()=>({tenantId:'tenant-1',eventId:'event-1',commandId:'cmd-1',templateId:'invitation-1',
 audience:'participants',plannedAt:'2027-01-01T13:00:00.000Z'});
test('planned reminder remains non-queued, unaddressed, idempotent-by-intent and non-dispatching',()=>{
 const result=previewNotificationJob(command(),schedule());
 assert.equal(result.plannedAt,command().plannedAt);
 assert.equal(result.idempotencyKeyPresent,true);
 assert.equal(result.state,'not-queued');assert.equal(result.dispatchAllowed,false);
 assert.equal(result.recipientsResolved,false);assert.equal(result.optOutVerified,false);
 assert.ok(!('recipientList' in result));assert.ok(!('commandId' in result));
});
test('unsafe times, cross-event and injected delivery consent fail',()=>{
 for(const patch of [
  {tenantId:'other'}, {eventId:'other'}, {audience:'everyone'}, {commandId:'../invalid'},
  {plannedAt:'2027-01-03T00:00:00.000Z'}, {plannedAt:'2025-01-01T13:00:00.000Z'},
  {plannedAt:'not-a-date'}, {permission:'true'},
 ]) assert.throws(()=>previewNotificationJob({...command(),...patch},schedule()));
});
