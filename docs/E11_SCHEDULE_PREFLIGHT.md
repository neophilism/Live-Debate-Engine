# E-11 schedule and communication preflight

This client-independent validation bounds an event's canonical UTC doors,
start and end instants and returns a read-only preview that NEVER dispatches
communications, even if an approved flag is present. It prevents scheduling
with invalid chronology or a greater-than-24-hour envelope.

Full unit remains pending: timezone display and DST handling, venue/resource
conflicts, delegated authorization, durable jobs, recipients and consent, delivery
idempotency, opt-outs, operator tools, actual notifications and end-to-end tests.

## Additional E11 preparation and conflict modeling

The source branch now includes pure models for IANA time-zone display with explicit DST offsets, inclusive-start/exclusive-end venue/crew/equipment booking collision detection restricted to one tenant, privacy-preserving notification audience counts excluding opt-outs, per-event operator checklist aggregates without disclosing individual staff details, and reminder command intent with a bounded UTC lead time. All models explicitly deny actual scheduling/dispatch authority and do not represent persistent resource bookings, approved release signatures or authenticated recipient consent.

Ten isolated Node 22 tests passed for these four new modules plus their negative-scope/time/opt-out cases; the mirrored code's git-blob hashes were checked against immutable Boardroom sources. This evidence does **not** claim that the exact remote PR head passed its GitHub Actions, browser or PostgreSQL CI. PR21 remains draft.

## Work that must precede an operational scheduler

Implement an additive server-owned schedule/resource/crew/checklist and notification-outbox schema after dependent E09 casting and E10 releases are accepted and merge-safe. A trusted organizer/producer actor must be resolved through the credential broker with current tenant/event scope and appropriate assurance. Never use client-asserted `productionReady` or `approved` as authorization. Use a database transaction and immutable command ID for every state change, one durable outbox intent per recipient/template/revision with opt-out revalidation immediately before send, and tracked delivery/retry/reconciliation status. Failed or uncertain delivery must never be marked delivered merely because an API call returned ambiguously. Suppress duplicate sends after job retries and event rescheduling; retain a transactionally updated cancellation epoch. Limit PII exposure in previews, logs and event metadata. Verify DST, interval boundaries, cross-tenant and cross-venue security, opt-out, consent/guardian restrictions, concurrency, browser accessibility and scheduling conflicts before deploying.
