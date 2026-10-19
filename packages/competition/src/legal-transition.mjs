import { validateLegalTemplate } from './legal-template.mjs';
/** Structural review only. No caller-provided state transition proves legal
 * approval, current publication, signing capacity or publisher permission. */
const normalTransitions = new Set(['draft:review-pending','review-pending:approved','approved:withdrawn','review-pending:draft']);
export function preflightLegalTemplateTransition(previousInput, nextInput) {
  const previous=validateLegalTemplate(previousInput).template;
  const next=validateLegalTemplate(nextInput).template;
  for(const key of ['tenantId','eventId','documentId','kind','jurisdiction']) {
    if(previous[key]!==next[key]) throw new TypeError('A legal template cannot change scope or jurisdiction in place');
  }
  if (next.revision===previous.revision) {
    if(!normalTransitions.has(`${previous.approvalState}:${next.approvalState}`))
      throw new TypeError('Unsupported legal approval transition');
    if(previous.body!==next.body || previous.title!==next.title)
      throw new TypeError('Document wording changes require a new revision');
  } else {
    if(next.revision!==previous.revision+1 || next.approvalState!=='draft' ||
       !['approved','withdrawn','draft','review-pending'].includes(previous.approvalState))
      throw new TypeError('New wording must create the next draft revision');
  }
  return Object.freeze({
    validShape:true,
    fromRevision:previous.revision, toRevision:next.revision,
    approvalRequired:next.approvalState==='approved',
    authorized:false, legallyApproved:false, published:false, operational:false,
  });
}
