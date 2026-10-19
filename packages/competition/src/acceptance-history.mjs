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
  let expectedSequence=1, active=null;
  for (const event of events) {
    if (!event || Object.getPrototypeOf(event)!==Object.prototype ||
        Object.keys(event).sort().join(',')!=='documentHash,documentId,documentRevision,eventId,eventType,participantId,sequence,tenantId')
      throw new TypeError('Invalid consent ledger entry');
    if (event.tenantId!==tenantId || event.eventId!==eventId || event.participantId!==participantId || event.documentId!==documentId ||
        event.sequence!==expectedSequence || !TYPES.has(event.eventType) ||
        !Number.isSafeInteger(event.documentRevision) || event.documentRevision<1 ||
        typeof event.documentHash!=='string' || !HASH.test(event.documentHash))
      throw new TypeError('Consent history has a gap, invalid entry or inconsistent scope');
    if (event.eventType==='accepted') active={revision:event.documentRevision,documentHash:event.documentHash,sequence:event.sequence};
    else {
      if (!active || active.revision!==event.documentRevision || active.documentHash!==event.documentHash)
        throw new TypeError('Withdrawal must target the current exact consent');
      active=null;
    }
    expectedSequence++;
  }
  return Object.freeze({active: active===null?null:Object.freeze(active), historyLength:events.length,
    ledgerAuthenticityVerified:false, legallyEffective:false, participantAuthorized:false});
}
