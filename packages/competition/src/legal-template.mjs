import { createHash } from 'node:crypto';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const JURISDICTION = /^[A-Z]{2}(?:-[A-Z0-9]{1,6})?$/;
const TYPES = new Set(['terms', 'recording-release', 'material-rights', 'embargo', 'event-rules']);
const STATES = new Set(['draft', 'review-pending', 'approved', 'withdrawn']);
/** Pure immutable template envelope. State labels are assertions to be verified by
 * a trusted publisher, not proof of legal approval or signer identity. */
export function validateLegalTemplate(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Object.keys(input).sort().join(',') !== 'approvalState,body,documentId,eventId,jurisdiction,kind,revision,tenantId,title') {
    throw new TypeError('Unexpected legal template fields');
  }
  for (const name of ['documentId','eventId','tenantId'])
    if (typeof input[name] !== 'string' || !ID.test(input[name])) throw new TypeError('Invalid document scope');
  if (!TYPES.has(input.kind) || !STATES.has(input.approvalState) ||
      !Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision > 1_000_000 ||
      typeof input.title !== 'string' || input.title.trim() !== input.title || input.title.length < 3 || input.title.length > 240 ||
      typeof input.body !== 'string' || input.body.trim() !== input.body || input.body.length < 20 || input.body.length > 100000 ||
      typeof input.jurisdiction !== 'string' || !JURISDICTION.test(input.jurisdiction)) throw new TypeError('Invalid legal template');
  const template = Object.freeze({ ...input });
  const hash = createHash('sha256').update(JSON.stringify([
    template.tenantId, template.eventId, template.documentId, template.revision,
    template.kind, template.jurisdiction, template.title, template.body, template.approvalState
  ]), 'utf8').digest('hex');
  return Object.freeze({ template, contentHash: hash, legallyApproved: false, operational: false });
}
export function isCurrentTemplate(record, { tenantId, eventId, documentId, revision, contentHash }) {
  const parsed = validateLegalTemplate(record);
  return parsed.template.tenantId === tenantId && parsed.template.eventId === eventId &&
    parsed.template.documentId === documentId && parsed.template.revision === revision &&
    parsed.contentHash === contentHash && parsed.template.approvalState !== 'withdrawn';
}
