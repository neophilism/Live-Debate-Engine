# E-11 schedule and communication preflight

This client-independent validation bounds an event's canonical UTC doors,
start and end instants and returns a read-only preview that NEVER dispatches
communications, even if an approved flag is present. It prevents scheduling
with invalid chronology or a greater-than-24-hour envelope.

Full unit remains pending: timezone display and DST handling, venue/resource
conflicts, delegated authorization, durable jobs, recipients and consent, delivery
idempotency, opt-outs, operator tools, actual notifications and end-to-end tests.
