import { validateAudienceRegistration, registrationCapacity } from './admission.mjs';
const TIME=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
/** Deterministic, privacy-minimized waitlist proposal. These timestamps and
 * identities must come from a verified server ledger to confer real fairness. */
export function previewAudienceQueue(entries,{tenantId,eventId,capacity,confirmed}) {
 const seats=registrationCapacity(capacity,confirmed,0);
 if(!Array.isArray(entries)||entries.length>500)throw new TypeError('Invalid registration queue');
 const ids=new Set();const commands=new Set();const ordered=[];
 for(const item of entries){
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||
    Object.keys(item).sort().join(',')!=='admissionStatus,commandId,eventId,principalId,receivedAt,tenantId')
   throw new TypeError('Invalid queue receipt');
  const row=validateAudienceRegistration({tenantId:item.tenantId,eventId:item.eventId,
    principalId:item.principalId,admissionStatus:item.admissionStatus});
  if(row.tenantId!==tenantId||row.eventId!==eventId||
    typeof item.commandId!=='string'||!(/^[A-Za-z0-9_-]{1,128}$/).test(item.commandId)||
    ids.has(row.principalId)||commands.has(item.commandId))throw new TypeError('Duplicate or cross-event request');
  ids.add(row.principalId);commands.add(item.commandId);
  if(typeof item.receivedAt!=='string'||!TIME.test(item.receivedAt)||
    !Number.isFinite(Date.parse(item.receivedAt))||
    new Date(item.receivedAt).toISOString()!==item.receivedAt)throw new TypeError('Invalid receipt time');
  if(row.admissionStatus!=='cancelled')ordered.push(item);
 }
 ordered.sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.commandId.localeCompare(b.commandId));
 const potential=Math.min(seats.remaining,ordered.length);
 return Object.freeze({tenantId,eventId,activeRequests:ordered.length,cancelled:entries.length-ordered.length,
  capacityAvailable:seats.remaining,potentialOfferCount:potential,potentialWaitlistCount:ordered.length-potential,
  queueAuthorityVerified:false,queueFairnessVerified:false,seatReserved:false,ticketIssued:false,admitted:false});
}
