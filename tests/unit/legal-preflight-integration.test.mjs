import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegalTemplate, isCurrentTemplate } from '../../packages/competition/src/legal-template.mjs';
import { preflightLegalTemplateTransition } from '../../packages/competition/src/legal-transition.mjs';
import { parseAcceptanceIntent, compareAcceptanceIntent } from '../../packages/competition/src/acceptance-intent.mjs';
import { projectConsentHistory } from '../../packages/competition/src/acceptance-history.mjs';
import { evaluateEventAcceptance } from '../../packages/competition/src/event-acceptance.mjs';
import { evaluateEligibilityEvidence } from '../../packages/competition/src/participant-eligibility.mjs';

test('every optimistic legal/guardian/identity claim remains non-operational across the whole preflight pipeline',()=>{
 const doc={tenantId:'tenant-1',eventId:'event-1',documentId:'terms-1',kind:'terms',jurisdiction:'US-CT',
  title:'Synthetic Terms',body:'Synthetic document text with no legal force, for isolated tests only.',
  revision:1,approvalState:'review-pending'};
 const approved={...doc,approvalState:'approved'};
 assert.equal(preflightLegalTemplateTransition(doc,approved).validShape,true);
 const approval=validateLegalTemplate(approved);
 const hash=approval.contentHash;
 assert.equal(isCurrentTemplate(approved,{tenantId:doc.tenantId,eventId:doc.eventId,documentId:doc.documentId,revision:1,contentHash:hash}),true);
 assert.equal(approval.legallyApproved,false);
 const command={commandId:'cmd-1',tenantId:doc.tenantId,eventId:doc.eventId,documentId:doc.documentId,
  documentRevision:1,documentHash:hash,accepted:true};
 assert.equal(parseAcceptanceIntent(command).accepted,true);
 assert.equal(compareAcceptanceIntent(command,{tenantId:doc.tenantId,eventId:doc.eventId,documentId:doc.documentId,
  documentRevision:1,documentHash:hash}).recordable,false);
 const scope={tenantId:doc.tenantId,eventId:doc.eventId,participantId:'person-1',documentId:doc.documentId};
 const projected=projectConsentHistory({...scope,events:[{...scope,sequence:1,eventType:'accepted',documentRevision:1,
  documentHash:hash,recordedAt:'2026-10-18T12:00:00.000Z'}]});
 assert.equal(projected.participantAuthorized,false);
 const matched=evaluateEventAcceptance({tenantId:doc.tenantId,eventId:doc.eventId,participantId:scope.participantId,documents:[{documentId:doc.documentId,documentRevision:1,
  documentHash:hash,kind:'terms',required:true}],acceptances:[{...scope,documentRevision:1,
  documentHash:hash,acceptedAt:'2026-10-18T12:00:00.000Z'}]});
 assert.equal(matched.matchedCurrentDocuments,true);
 assert.equal(matched.competitionReady,false);
 const codes=['identity','age-or-guardian','jurisdiction','employee-family-conflict','recording-release','terms','material-rights'];
 const evidence=evaluateEligibilityEvidence({tenantId:doc.tenantId,eventId:doc.eventId,participantId:scope.participantId,
  checks:codes.map(code=>({code,state:'verified'}))});
 assert.equal(evidence.noReportedFindings,true);
 assert.equal(evidence.participantAuthorized,false);
 assert.equal(evidence.evidenceAuthenticityVerified,false);
});
