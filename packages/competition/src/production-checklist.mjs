import { validateProductionSchedule } from './scheduling.mjs';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const STATES=new Set(['not-started','in-progress','completed','blocked']);
const UTC=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
/** Aggregates a private draft checklist. Completion by an unverified client
 * does not authorize a live event, release, staff action or notification. */
export function previewProductionChecklist(schedule,items) {
 const plan=validateProductionSchedule(schedule);
 if(!Array.isArray(items)||items.length>100)throw new TypeError('Invalid production checklist');
 const seen=new Set();const totals={completed:0,blocked:0,pending:0,overdue:0};
 for(const row of items){
  if(!row||Object.getPrototypeOf(row)!==Object.prototype||
     Object.keys(row).sort().join(',')!=='code,dueAt,eventId,ownerId,state,tenantId')
    throw new TypeError('Invalid checklist item');
  if(row.tenantId!==plan.tenantId||row.eventId!==plan.eventId ||
     typeof row.code!=='string'||!ID.test(row.code)||
     typeof row.ownerId!=='string'||!ID.test(row.ownerId)||
     !STATES.has(row.state)||seen.has(row.code))
    throw new TypeError('Cross-scope, unauthorized or duplicate checklist code');
  seen.add(row.code);
  if(typeof row.dueAt!=='string'||!UTC.test(row.dueAt)||
     !Number.isFinite(Date.parse(row.dueAt))||new Date(row.dueAt).toISOString()!==row.dueAt)
    throw new TypeError('Invalid task UTC deadline');
  if(row.state==='completed')totals.completed++;
  else {totals.pending++;if(row.state==='blocked')totals.blocked++;
   if(Date.parse(row.dueAt)<Date.parse(plan.startsAt))totals.overdue++;}
 }
 return Object.freeze({...totals,itemCount:items.length,tenantId:plan.tenantId,eventId:plan.eventId,
  allReportedComplete:items.length>0&&totals.pending===0,
  verifiedSignoff:false,productionReady:false,operational:false});
}
