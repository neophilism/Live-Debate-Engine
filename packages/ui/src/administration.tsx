import { createElement as h } from 'react';
import type { EventAdministration, MotionRevision, Series } from '../../competition/src/administration.js';

/** Organizer-facing read-only administration overview. No privileged network actions. */
export function AdministrationOverview({ series, motions, events }: {
  series: readonly Series[]; motions: readonly MotionRevision[]; events: readonly EventAdministration[];
}) {
  const entries = series.map((item) => {
    const ownMotions = motions.filter((motion) => motion.seriesId === item.id && motion.tenantId === item.tenantId);
    const ownEvents = events.filter((event) => event.seriesId === item.id && event.tenantId === item.tenantId);
    return h('section', { key: item.id, 'aria-label': item.name },
      h('h3', null, item.name),
      h('p', null, 'Season ', item.season, ' | ', item.startsOn, ' to ', item.endsOn),
      h('h4', null, 'Motions'),
      h('ul', null, ...ownMotions.map((motion) => h('li', {key: motion.motionId},
        motion.wording, ' | Revision ', String(motion.revision), ' | ', motion.state))),
      h('h4', null, 'Events'),
      h('ul', null, ...ownEvents.map((event) => h('li', {key: event.id},
        event.title, ' | ', event.venue, ' | ', event.broadcastMode, ' | ', event.state,
        ' | Motion revision ', String(event.motionRevision)))));
  });
  return h('section', {'aria-label':'Series and event administration'},
    h('h2',null,'Series, motions, and events'),
    h('p',null,'Publication does not establish registration, funding, or event readiness. Published motion wording requires an explicit audited amendment.'),
    ...entries);
}
