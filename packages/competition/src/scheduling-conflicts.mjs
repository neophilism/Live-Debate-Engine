const ID=/^[a-zA-Z0-9_-]{1,128}$/;
const KINDS=new Set(['venue','crew','equipment']);
function parseUtc(input) {
 if(typeof input!=='string'|| !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(input)||
   !Number.isFinite(Date.parse(input))||new Date(input).toISOString()!==input) throw new TypeError('Canonical UTC instant required');
 return Date.parse(input);
}
/** Scope-safe advisory detector. Must never expose other tenants' bookings
 * or override authoritative resource reservations/permissions. */
export function previewResourceConflicts(bookings) {
 if(!Array.isArray(bookings)||bookings.length>200)throw new TypeError('Invalid booking list');
 const normalized=[];let tenant=null;
 for(const item of bookings) {
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||
     Object.keys(item).sort().join(',')!=='endAt,eventId,resourceId,resourceKind,startAt,tenantId')throw new TypeError('Invalid booking');
  for(const key of ['tenantId','eventId','resourceId'])
   if(typeof item[key]!=='string'||!ID.test(item[key]))throw new TypeError('Invalid resource scope');
  if(!KINDS.has(item.resourceKind))throw new TypeError('Invalid resource kind');
  if(tenant!==null&&item.tenantId!==tenant)throw new TypeError('Cannot mix tenant schedules');
  tenant=item.tenantId;
  const start=parseUtc(item.startAt),end=parseUtc(item.endAt);
  if(start>=end||end-start>48*60*60*1000)throw new TypeError('Invalid resource interval');
  normalized.push({ ...item,start,end });
 }
 const clashes=[];
 for(let i=0;i<normalized.length;i++)for(let j=i+1;j<normalized.length;j++){
  const left=normalized[i],right=normalized[j];
  if(left.resourceKind===right.resourceKind&&left.resourceId===right.resourceId&&
     left.eventId!==right.eventId&&left.start<right.end&&right.start<left.end)
   clashes.push(Object.freeze({resourceKind:left.resourceKind,resourceId:left.resourceId,
    eventA:left.eventId,eventB:right.eventId,
    overlapStartsAt:new Date(Math.max(left.start,right.start)).toISOString(),
    overlapEndsAt:new Date(Math.min(left.end,right.end)).toISOString()}));
 }
 return Object.freeze({conflicts:Object.freeze(clashes),noReportedConflicts:clashes.length===0,
   resourceAuthorityVerified:false,bookingCommitted:false,productionReady:false});
}
