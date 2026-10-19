import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyAdmissionProof } from '../../packages/competition/src/admission-proof.mjs';
const secret=Buffer.alloc(32,42);
const claims=()=>({tenantId:'tenant-1',eventId:'event-1',principalId:'person-1',nonce:'nonce-1',
 expiresAt:'2027-01-02T13:00:00.000Z'});
const ticket=(obj)=>{const body=Buffer.from(JSON.stringify(obj)).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
const scope={tenantId:'tenant-1',eventId:'event-1'};
test('valid event-scoped HMAC alone never issues or scans a ticket',()=>{
 const proof=verifyAdmissionProof(ticket(claims()),secret,scope,new Date('2027-01-02T12:00:00.000Z'));
 assert.equal(proof.signatureVerified,true); assert.equal(proof.revocationVerified,false);
 assert.equal(proof.gateScanRecorded,false);assert.equal(proof.admitted,false);
 assert.ok(!('nonce' in proof));assert.ok(Object.isFrozen(proof));
});
test('forged signature, expiry, other event, weak server secret and unsupported fields are denied',()=>{
 const original=ticket(claims());const parts=original.split('.');
 assert.throws(()=>verifyAdmissionProof(parts[0]+'.'+('A'.repeat(43)),secret,scope,new Date('2027-01-02T12:00:00.000Z')));
 assert.throws(()=>verifyAdmissionProof(original,secret,scope,new Date('2027-01-02T13:00:00.000Z')));
 assert.throws(()=>verifyAdmissionProof(original,secret,{...scope,eventId:'other'},new Date('2027-01-02T12:00:00.000Z')));
 assert.throws(()=>verifyAdmissionProof(original,Buffer.alloc(4),scope,new Date('2027-01-02T12:00:00.000Z')));
 assert.throws(()=>verifyAdmissionProof(ticket({...claims(),admitted:true}),secret,scope,new Date('2027-01-02T12:00:00.000Z')));
 assert.throws(()=>verifyAdmissionProof('not-a-token',secret,scope,new Date('2027-01-02T12:00:00.000Z')));
});
