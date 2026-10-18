# E-08 organizer overview increment

A read-only reusable organizer component in packages/ui/src/administration.tsx
groups motions and event information under each tenant/series and visibly
distinguishes draft/published status, exact referenced motion revision, venue
and broadcast setting. It cannot call privileged endpoints or alter wording.

The existing durable authorization and amendment transactions remain the only
source of truth. Complete E-08 still requires authenticated API read routes,
organizer edit/publish journeys, conflict handling and desktop/mobile
accessibility and browser acceptance. No service or release enabled here.
