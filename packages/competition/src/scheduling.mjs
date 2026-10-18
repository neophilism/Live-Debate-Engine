/** Preparation only; never dispatches an email or starts event production. */
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
function utc(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)
 throw new TypeError('UTC instant required');
 return Date.parse(value);
}
export function validateProductionSchedule({eventId,tenantId,startsAt,doorsAt,endsAt,productionReady}) {
 if(!ID.test(eventId||'')||!ID.test(tenantId||'')||
   typeof productionReady!=='boolean')throw new TypeError('Invalid production schedule');
 const doors=utc(doorsAt),start=utc(startsAt),end=utc(endsAt);
 if(!(doors<=start&&start<end)||end-doors>24*60*60*1000)throw new TypeError('Invalid production chronology');
 return Object.freeze({eventId,tenantId,doorsAt,startsAt,endsAt,productionReady});
}
export function previewCommunication(schedule,{audience,approved=false}={}) {
 const plan=validateProductionSchedule(schedule);
 if(!['participants','staff','judges'].includes(audience)||typeof approved!=='boolean')
 throw new TypeError('Invalid communication preview');
 return Object.freeze({eventId:plan.eventId,audience,deliveryState:'not-sent',
   dispatchAllowed:false,approvalRequired:!approved,startsAt:plan.startsAt});
}
