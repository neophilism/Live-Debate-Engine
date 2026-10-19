import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightLegalTemplateTransition } from '../../packages/competition/src/legal-transition.mjs';
const base=()=>({tenantId:'tenant-1',eventId:'event-1',documentId:'doc-1',kind:'terms',jurisdiction:'US-CT',revision:1,
 title:'Participation terms',body:'Synthetic educational legal text only, no actual agreement.',approvalState:'draft'});
test('same-revision promotion preserves wording and always requires trusted publisher approval',()=>{
 const draft=base(), pending={...draft,approvalState:'review-pending'}, approved={...pending,approvalState:'approved'};
 assert.equal(preflightLegalTemplateTransition(draft,pending).authorized,false);
 const transition=preflightLegalTemplateTransition(pending,approved);
 assert.equal(transition.approvalRequired,true);assert.equal(transition.published,false);
 assert.equal(transition.operational,false);
 assert.equal(preflightLegalTemplateTransition(approved,{...approved,approvalState:'withdrawn'}).validShape,true);
});
test('in-place rewrite, cross-jurisdiction, skipped revision and approval shortcuts are rejected',()=>{
 const draft=base();const reject=(next,old=draft)=>assert.throws(()=>preflightLegalTemplateTransition(old,next));
 reject({...draft,approvalState:'approved'});
 reject({...draft,approvalState:'review-pending',body:'Changed text with same revision is forbidden'});
 reject({...draft,revision:4});
 reject({...draft,revision:2,approvalState:'approved'});
 reject({...draft,revision:2,jurisdiction:'US-NY'});
 reject({...draft,revision:2,eventId:'event-2'});
 const pending={...draft,approvalState:'review-pending'};
 reject({...pending,approvalState:'approved',title:'Altered legal title'},pending);
 assert.equal(preflightLegalTemplateTransition(draft,{...draft,revision:2,body:draft.body+' Extra wording'}).authorized,false);
});
