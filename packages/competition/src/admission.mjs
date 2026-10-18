/** E-12 registration preflight. No admission rights are granted here. */
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
export function validateAudienceRegistration(input) {
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||
    Object.keys(input).sort().join(',')!=='admissionStatus,eventId,principalId,tenantId'||
    !ID.test(input.tenantId||'')||!ID.test(input.eventId||'')||
    !ID.test(input.principalId||'')||
    !['requested','waitlisted','cancelled'].includes(input.admissionStatus))
 throw new TypeError('Invalid registration request');
 return Object.freeze({...input,admitted:false,ticketIssued:false});
}
export function registrationCapacity(openSeats,confirmed,waitlisted) {
 if(![openSeats,confirmed,waitlisted].every(v=>Number.isSafeInteger(v)&&v>=0)||
 confirmed>openSeats)throw new TypeError('Invalid capacity state');
 return Object.freeze({remaining:openSeats-confirmed,waitlisted,registrationOpen:openSeats>confirmed});
}
