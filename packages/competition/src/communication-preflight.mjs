import { validateProductionSchedule, previewCommunication } from './scheduling.mjs';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const AUDIENCE=new Set(['participants','staff','judges']);
/** Preview-only notification audience statistics. Never returns contact
 * addresses or a dispatch-capable audience list. An opted-out principal is
 * excluded regardless of caller-asserted readiness or approval. */
export function previewNotificationAudience(schedule, audience, recipients) {
 const plan=validateProductionSchedule(schedule);
 if(!AUDIENCE.has(audience)||!Array.isArray(recipients)||recipients.length>500)
  throw new TypeError('Invalid notification audience request');
 const seen=new Set(); let eligible=0,optedOut=0,unavailable=0;
 for(const r of recipients) {
  if(!r||Object.getPrototypeOf(r)!==Object.prototype||
    Object.keys(r).sort().join(',')!=='audience,deliveryEligible,eventId,optedOut,principalId,tenantId')
   throw new TypeError('Unexpected recipient fields');
  if(typeof r.principalId!=='string'||!ID.test(r.principalId)||
    r.tenantId!==plan.tenantId||r.eventId!==plan.eventId||
    r.audience!==audience||typeof r.optedOut!=='boolean'||typeof r.deliveryEligible!=='boolean')
   throw new TypeError('Cross-scope or unverified notification recipient');
  if(seen.has(r.principalId))throw new TypeError('Duplicate notification recipient');
  seen.add(r.principalId);
  if(r.optedOut)optedOut++;
  else if(!r.deliveryEligible)unavailable++;
  else eligible++;
 }
 const base=previewCommunication(plan,{audience,approved:false});
 return Object.freeze({audience,tenantId:plan.tenantId,eventId:plan.eventId,
  recipientCount:recipients.length,potentialRecipients:eligible,optedOut,unavailable,
  startsAt:base.startsAt,deliveryState:base.deliveryState,
  contactDataIncluded:false,subscriptionVerified:false,dispatchAllowed:false,operational:false});
}
