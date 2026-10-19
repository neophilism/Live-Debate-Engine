# E-12 registration preflight

Public registration inputs must be narrow and do not confer admission or
tickets. The pure capacity helper reports remaining seats but does not reserve
or mutate capacity. This is not a production registration service.

Missing: authenticated identity, transactional reservations and queue fairness,
privacy/retention, eligibility, cancellation, ticket revocation, abuse/rate
limits, admission scanning, reconciled multi-gate state and accessibility tests.

## Registration and queue fairness model increment

`packages/competition/src/admission-queue.mjs` rejects duplicate principals or command IDs, cross-tenant/cross-event entries, noncanonical receipt timestamps, forged admission statuses and client-supplied extra fields. It computes privacy-minimized capacity, potential offers, cancelled requests and waitlist summaries without exposing individual queue order, issuing tickets or granting seats. The pure model's counts are **not** a claim of actual server-ordered queue fairness because receipt timestamps and identities must be verified through an authoritative append-only server ledger. Two isolated source-hash-matched Node.js tests passed; current GitHub Actions job status is not inferred from these tests.

The operational implementation still needs trusted membership and registration account verification, rate limits, fair and immutable per-event server receipt ordering, transactional seat reservations, cancel/release and waitlist advancement under concurrency, an expiring and revocable admission QR proof bound to a tenant/event/individual, a single-use gate scan and anti-passback ledger, opt-out and private identity retention controls, real attendee and operator accessibility journeys, and full PostgreSQL/browser CI. E09 casting, E10 legal release, and E11 production schedules remain independent draft dependencies; do not silently use a provisional casting/consent record as a valid event entry ticket.
