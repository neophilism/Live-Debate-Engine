import { validateProductionSchedule } from './scheduling.mjs';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UTC=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
/** Typed notification scheduling intent. No queue, recipient contact address,
 * delivery permission or real send is created by this pure preflight. */
export function previewNotificationJob(input,schedule) {
 const plan=validateProductionSchedule(schedule);
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||
   Object.keys(input).sort().join(',')!=='audience,commandId,eventId,plannedAt,templateId,tenantId')
  throw new TypeError('Invalid reminder command');
 for(const key of ['commandId','eventId','templateId','tenantId'])
  if(typeof input[key]!=='string'||!ID.test(input[key])) throw new TypeError('Invalid reminder command ID');
 if(input.tenantId!==plan.tenantId||input.eventId!==plan.eventId||
    !['participants','staff','judges'].includes(input.audience))
  throw new TypeError('Cross-scope or unsupported reminder audience');
 const at=input.plannedAt;
 if(typeof at!=='string'||!UTC.test(at)||!Number.isFinite(Date.parse(at))||new Date(at).toISOString()!==at)
  throw new TypeError('Invalid UTC reminder timestamp');
 const delta=Date.parse(plan.startsAt)-Date.parse(at);
 if(delta<=0||delta>365*24*60*60*1000)throw new TypeError('Reminder must precede event by at most one year');
 return Object.freeze({tenantId:plan.tenantId,eventId:plan.eventId,audience:input.audience,
  templateId:input.templateId,plannedAt:at,idempotencyKeyPresent:true,
  state:'not-queued',recipientsResolved:false,optOutVerified:false,
  dispatchAllowed:false,operational:false});
}
