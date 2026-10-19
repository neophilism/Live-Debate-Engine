import { validateProductionSchedule } from './scheduling.mjs';
/** Presentation only: authoritative timestamps stay UTC, and a display
 * conversion is never an instruction to schedule or send a job. */
export function displayProductionSchedule(input, timeZone, locale='en-US') {
 const schedule=validateProductionSchedule(input);
 if(typeof timeZone!=='string'||timeZone.length<1||timeZone.length>100||
    typeof locale!=='string'||locale.length<2||locale.length>35)
 throw new TypeError('Invalid scheduling display options');
 let fmt;
 try {
  fmt=new Intl.DateTimeFormat(locale,{timeZone,year:'numeric',month:'short',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 } catch { throw new TypeError('Unsupported time zone or locale'); }
 const output={timeZone:fmt.resolvedOptions().timeZone,locale:fmt.resolvedOptions().locale,
  utc:{doorsAt:schedule.doorsAt,startsAt:schedule.startsAt,endsAt:schedule.endsAt},
  local:{doorsAt:fmt.format(new Date(schedule.doorsAt)),startsAt:fmt.format(new Date(schedule.startsAt)),
    endsAt:fmt.format(new Date(schedule.endsAt))},
  authorized:false,dispatchAllowed:false};
 Object.freeze(output.utc); Object.freeze(output.local);
 return Object.freeze(output);
}
