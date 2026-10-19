import { reviewDocumentAcceptance } from './eligibility.mjs';
/**
 * E-10 cross-document acceptance preflight. This function cannot verify a
 * session, signer, legal capacity, jurisdiction, guardian or actual release.
 * No return value from here grants competition access.
 */
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/;
const kinds = new Set(['terms', 'recording-release', 'material-rights', 'embargo', 'event-rules']);
function scopedId(value) { if (typeof value !== 'string' || !ID.test(value)) throw new TypeError('Invalid scope identifier'); return value; }
export function evaluateEventAcceptance({ tenantId, eventId, participantId, documents, acceptances, isJunior = false }) {
  scopedId(tenantId); scopedId(eventId); scopedId(participantId);
  if (typeof isJunior !== 'boolean' || !Array.isArray(documents) || documents.length > 64 ||
      !Array.isArray(acceptances) || acceptances.length > 128) throw new TypeError('Invalid acceptance workspace');
  const required = new Map();
  for (const doc of documents) {
    if (!doc || Object.getPrototypeOf(doc) !== Object.prototype ||
        Object.keys(doc).sort().join(',') !== 'documentHash,documentId,documentRevision,kind,required') throw new TypeError('Invalid document requirement');
    scopedId(doc.documentId);
    if (!kinds.has(doc.kind) || typeof doc.required !== 'boolean' ||
        !Number.isSafeInteger(doc.documentRevision) || doc.documentRevision < 1 ||
        typeof doc.documentHash !== 'string' || !HASH.test(doc.documentHash) ||
        required.has(doc.documentId)) throw new TypeError('Invalid document manifest');
    required.set(doc.documentId, doc);
  }
  const seen = new Set();
  const accepted = new Map();
  for (const entry of acceptances) {
    if (!entry || Object.getPrototypeOf(entry) !== Object.prototype ||
        Object.keys(entry).sort().join(',') !== 'acceptedAt,documentHash,documentId,documentRevision,eventId,participantId,tenantId') throw new TypeError('Invalid acceptance evidence scope');
    if (scopedId(entry.eventId) !== eventId) throw new TypeError('Acceptance event scope mismatch');
    const { eventId: _eventId, ...legacy } = entry;
    const row = reviewDocumentAcceptance(legacy);
    if (row.tenantId !== tenantId || row.participantId !== participantId || seen.has(row.documentId)) throw new TypeError('Acceptance identity mismatch or duplicate');
    seen.add(row.documentId); accepted.set(row.documentId, row);
  }
  const missing = []; const outdated = [];
  for (const document of required.values()) {
    if (!document.required) continue;
    const receipt = accepted.get(document.documentId);
    if (!receipt) missing.push(document.documentId);
    else if (receipt.documentRevision !== document.documentRevision || receipt.documentHash !== document.documentHash) outdated.push(document.documentId);
  }
  return Object.freeze({
    matchedCurrentDocuments: missing.length === 0 && outdated.length === 0,
    missing: Object.freeze(missing), outdated: Object.freeze(outdated),
    guardianVerificationRequired: isJunior,
    identityVerified: false, legallyEffective: false, competitionReady: false,
  });
}
