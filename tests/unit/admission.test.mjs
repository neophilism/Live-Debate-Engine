import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAudienceRegistration,registrationCapacity} from '../../packages/competition/src/admission.mjs';
const request=()=>({tenantId:'tenant-1',eventId:'event-1',principalId:'person-1',admissionStatus:'requested'});
test('registration never grants admission or a ticket',()=>{
 const result=validateAudienceRegistration(request());
 assert.equal(result.admitted,false);assert.equal(result.ticketIssued,false);
 assert.ok(Object.isFrozen(result));
});
test('reject forged admission claims and invalid capacity',()=>{
 assert.throws(()=>validateAudienceRegistration({...request(),admitted:true}));
 assert.throws(()=>validateAudienceRegistration({...request(),admissionStatus:'approved'}));
 assert.throws(()=>registrationCapacity(5,6,0));
 assert.equal(registrationCapacity(5,5,2).registrationOpen,false);
});
