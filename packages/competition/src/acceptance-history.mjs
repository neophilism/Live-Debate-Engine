const IDENTIFIER=/^[A-Za-z0-9_-]{1,128}$/;
const HASH=/^[0-9a-f]{64}$/;
const TYPES=new Set(['accepted','withdrawn']);
/** Projection of an already authenticated, append-only ledger. It never verifies
 * an actor, a signature, legal capacity or production transaction integrity.
 * A withdrawal cannot resurrect an older accepted revision. */
export function projectConsentHistory({tenantId,eventId,participantId,documentId,events}) {
  for (const id of [tenantId,eventId,participantId,documentId])
    if (typeof id !== 'string' || !IDENTIFIER.test(id)) throw new TypeError('Invalid consent history scope');
  if (!Array.isArray(events) || events.length > 500) throw new TypeError('Invalid consent event count');
  let expectedSequence=1, active=null, lastRecordedAt='';
  for (const event of events) {
    if (!event || Object.getPrototypeOf(event)!==Object.prototype ||
        Object.keys(event).sort().join(',')!=='documentHash,documentId,documentRevision,eventId,eventType,participantId,recordedAt,sequence,tenantId')
      throw new TypeError('Invalid consent ledger entry');
    if (event.tenantId!==tenantId || event.eventId!==eventId || event.participantId!==participantId || event.documentId!==documentId ||
        event.sequence!==expectedSequence || !TYPES.has(event.eventType) ||
        !Number.isSafeInteger(event.documentRevision) || event.documentRevision<1 ||
        typeof event.documentHash!=='string' || !HASH.test(event.documentHash) ||
        typeof event.recordedAt!=='string' || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(event.recordedAt) ||
        !Number.isFinite(Date.parse(event.recordedAt)) || new Date(event.recordedAt).toISOString()!==event.recordedAt ||
        (lastRecordedAt && event.recordedAt<lastRecordedAt))
      throw new TypeError('Consent history has a gap, invalid entry or inconsistent scope');
    if (event.eventType==='accepted') {
      if (active && event.documentRevision<=active.revision)
        throw new TypeError('An active consent cannot be overwritten with the same or an older document revision');
      active={revision:event.documentRevision,documentHash:event.documentHash,sequence:event.sequence,acceptedAt:event.recordedAt};
    }
    else {
      if (!active || active.revision!==event.documentRevision || active.documentHash!==event.documentHash)
        throw new TypeError('Withdrawal must target the current exact consent');
      active=null;
    }
    lastRecordedAt=event.recordedAt;
    expectedSequence++;
  }
  return Object.freeze({active: active===null?null:Object.freeze(active), historyLength:events.length,
    ledgerAuthenticityVerified:false, legallyEffective:false, participantAuthorized:false});
}
