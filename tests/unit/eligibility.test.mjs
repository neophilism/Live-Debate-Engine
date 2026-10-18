import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDocumentAcceptance,matchingCurrentAcceptance} from '../../packages/competition/src/eligibility.mjs';
const accepted=()=>({tenantId:'tenant-1',participantId:'person-1',documentId:'release-1',
 documentRevision:2,documentHash:'a'.repeat(64),acceptedAt:'2026-10-18T12:00:00.000Z'});
test('acceptance binds exact immutable revision and hash',()=>{
 const r=reviewDocumentAcceptance(accepted());assert.ok(Object.isFrozen(r));
 assert.equal(matchingCurrentAcceptance(r,accepted()),true);
 assert.equal(matchingCurrentAcceptance(r,{...accepted(),documentRevision:3}),false);
 assert.equal(matchingCurrentAcceptance(r,{...accepted(),documentHash:'b'.repeat(64)}),false);
});
test('unknown fields, malformed timestamps, and hashes rejected',()=>{
 for(const patch of [{consent:true},{documentHash:'invalid'},
 {documentRevision:-1},{acceptedAt:'yesterday'},{participantId:'../tenant'}])
 assert.throws(()=>reviewDocumentAcceptance({...accepted(),...patch}));
});
