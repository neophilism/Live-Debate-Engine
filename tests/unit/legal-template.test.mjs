import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegalTemplate, isCurrentTemplate } from '../../packages/competition/src/legal-template.mjs';

const template=()=>({ tenantId:'tenant-1', eventId:'event-1', documentId:'release-1', revision:1,
 kind:'recording-release', jurisdiction:'US-CT', approvalState:'review-pending',
 title:'Recording release', body:'This is a synthetic legal text fixture, not actual legal terms.' });
test('release template seals exact jurisdiction, revision, scope and text without asserting legal approval', () => {
 const a=validateLegalTemplate(template()); const again=validateLegalTemplate(template());
 assert.equal(a.contentHash,again.contentHash); assert.equal(a.legallyApproved,false); assert.equal(a.operational,false);
 assert.ok(Object.isFrozen(a.template)); assert.equal(a.contentHash.length,64);
 assert.equal(isCurrentTemplate(template(),{...template(), contentHash:a.contentHash}),true);
 assert.equal(isCurrentTemplate(template(),{...template(),eventId:'event-2',contentHash:a.contentHash}),false);
 assert.notEqual(validateLegalTemplate({...template(),body:template().body+' revised'}).contentHash,a.contentHash);
 assert.notEqual(validateLegalTemplate({...template(),approvalState:'withdrawn'}).contentHash,a.contentHash);
 assert.equal(isCurrentTemplate({...template(),approvalState:'withdrawn'},{...template(),contentHash:a.contentHash}),false);
});
test('unknown fields, unscoped templates, empty terms, invalid approval metadata fail closed',()=>{
 for (const patch of [
  { privilege:'manager' }, { tenantId:'../escape' }, { jurisdiction:'us-ct' },
  { revision:0 }, { approvalState:'automatically-valid' }, { body:'short' }, { kind:'unknown' },
 ]) assert.throws(()=>validateLegalTemplate({...template(),...patch}));
});
