const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FIELDS = 'accepted,commandId,documentHash,documentId,documentRevision,eventId,tenantId';
/** Restrict the *proposed* acceptance command to an exact document and event.
 * The caller cannot assert actor, guardian, server timestamp, signature, or
 * legal capacity. Server must still authenticate and persist its own receipt. */
export function parseAcceptanceIntent(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Object.keys(input).sort().join(',') !== FIELDS) throw new TypeError('Unexpected acceptance command fields');
  for (const field of ['commandId', 'tenantId', 'eventId', 'documentId']) {
    if (typeof input[field] !== 'string' || !IDENTIFIER.test(input[field])) throw new TypeError('Invalid acceptance command scope');
  }
  if (input.accepted !== true || !Number.isSafeInteger(input.documentRevision) ||
      input.documentRevision < 1 || input.documentRevision > 1000000 ||
      typeof input.documentHash !== 'string' || !SHA256.test(input.documentHash))
    throw new TypeError('Acceptance command must bind an exact document and express consent');
  return Object.freeze({ ...input });
}
export function compareAcceptanceIntent(intent, authoritative) {
  const command = parseAcceptanceIntent(intent);
  if (!authoritative || Object.getPrototypeOf(authoritative) !== Object.prototype ||
      Object.keys(authoritative).sort().join(',') !== 'documentHash,documentId,documentRevision,eventId,tenantId')
    throw new TypeError('Invalid authoritative document reference');
  for (const key of ['tenantId','eventId','documentId','documentRevision','documentHash'])
    if (command[key] !== authoritative[key]) return Object.freeze({ matched: false, recordable: false });
  return Object.freeze({ matched: true, recordable: false });
}
