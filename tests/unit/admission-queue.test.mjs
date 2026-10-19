import test from 'node:test';
import assert from 'node:assert/strict';
import { previewAudienceQueue } from '../../packages/competition/src/admission-queue.mjs';
const config={tenantId:'tenant-1',eventId:'event-1',capacity:3,confirmed:2};
const row=(id,status='requested',extra={})=>({tenantId:'tenant-1',eventId:'event-1',principalId:id,
 commandId:'cmd-'+id,admissionStatus:status,receivedAt:'2027-01-01T12:00:00.000Z',...extra});
test('waitlist preview counts without exposing personal queue entries or granting seats',()=>{
 const p=previewAudienceQueue([row('a'),row('b'),row('c','cancelled')],config);
 assert.equal(p.activeRequests,2);assert.equal(p.cancelled,1);
 assert.equal(p.potentialOfferCount,1);assert.equal(p.potentialWaitlistCount,1);
 assert.equal(p.queueFairnessVerified,false);assert.equal(p.admitted,false);
 assert.equal(p.ticketIssued,false);assert.ok(!('principals' in p));
 assert.equal(previewAudienceQueue([],config).seatReserved,false);
});
test('duplicate principals, cross-event, spoofed admission, invalid chronology and command duplicates fail',()=>{
 const reject=items=>assert.throws(()=>previewAudienceQueue(items,config));
 reject([row('a'),row('a')]);
 reject([row('a'),row('b','requested',{commandId:'cmd-a'})]);
 reject([row('a','requested',{tenantId:'other'})]);
 reject([row('a','requested',{eventId:'other'})]);
 reject([row('a','approved')]);
 reject([row('a','requested',{receivedAt:'yesterday'})]);
 reject([row('a','requested',{admitted:true})]);
 assert.throws(()=>previewAudienceQueue([row('a')],{...config,confirmed:4}));
});
