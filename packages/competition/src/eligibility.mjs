/** Eligibility document acceptance preflight. This is not identity verification. */
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
const HASH=/^[0-9a-f]{64}$/;
export function reviewDocumentAcceptance(input) {
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||
    Object.keys(input).sort().join(',')!=='acceptedAt,documentHash,documentId,documentRevision,participantId,tenantId'||
    !ID.test(input.tenantId||'')||!ID.test(input.participantId||'')||
    !ID.test(input.documentId||'')||!HASH.test(input.documentHash||'')||
    !Number.isSafeInteger(input.documentRevision)||input.documentRevision<1||
    typeof input.acceptedAt!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.000Z$/.test(input.acceptedAt)||
    !Number.isFinite(Date.parse(input.acceptedAt))||
    new Date(input.acceptedAt).toISOString()!==input.acceptedAt)
 throw new TypeError('Invalid document acceptance');
 return Object.freeze({...input});
}
export function matchingCurrentAcceptance(acceptance,{tenantId,participantId,documentId,documentRevision,documentHash}){
 const record=reviewDocumentAcceptance(acceptance);
 return record.tenantId===tenantId&&record.participantId===participantId&&
 record.documentId===documentId&&record.documentRevision===documentRevision&&
 record.documentHash===documentHash;
}
