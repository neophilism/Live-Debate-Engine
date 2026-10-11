# Architecture baseline

## Ownership

Live Debate Engine owns domain logic, APIs, reusable React interfaces, live-event controls, voting, judging, AI, prizes, brackets, disputes, publishing, security and operational tooling. UBC Debates owns branding, approved editorial/legal-entity configuration, domains and integration wiring. A missing reusable feature is fixed upstream, never reimplemented in UBC. The politician-to-politician engine is neither a dependency nor a migration source.

## Planned modules and data

Identity/tenant membership; series/motions; competition contracts; participants/eligibility/releases; scheduling/production; live sessions/timers/floor; audience/admission; ballot/tally service; judging/rubrics; certification/announcements; bracket/advancement; prize ledger/settlement; disputes/oversight; media/transcription; editorial/archive; commerce/entitlements; integrations/telemetry; AI evaluation/qualification.

Use explicit tenant and event scope. Keep audience verdict, judges' verdict, advancement decision and financial obligation separate. Store ruleset, roster, motion, transcript and evaluation versions. Append-only histories preserve corrections; not every table needs full event sourcing. A command has an idempotency key and expected version; retries and concurrent operators cannot duplicate state transitions or payments.

PostgreSQL is the durable source of truth. SQL migrations must be ordered/checksummed and tested against a fresh database. Runtime roles must not own protected tables or bypass row-level policies. Transaction-scoped tenant context must be reset across pooled connections. Jobs, object paths, caches, exports and realtime channels enforce equivalent boundaries. Durable outbox delivery connects committed state changes to retryable external work.

## Runtime boundary

Target Node/TypeScript services and a shared React UI. Media, transcription and AI run behind adapters/workers; video viewing bandwidth does not traverse the voting API. Durable event state, not a client's clock or an ephemeral media session, drives official timing and phase transitions. Provider failures have explicit degraded/inconclusive/fallback states.

Hosted identity, media, storage, mail and payout adapters are selected through separate implementation decisions with current vendor verification. Do not add a provider or billable resource merely because an SDK exists. Start on supported Node LTS; CI tests the chosen baseline. No particular provider version or cryptographic certification is asserted by this document.

## Privacy and trust

Separate identity, pseudonymous ballots, sealed scorecards, private financial documentation, and media. Publish aggregates only at the authorized phase. Election-like competition voting is not governmental election infrastructure, and pseudonymity is not untraceability. Tenant administrators do not automatically receive ballot-decryption or financial-document privileges.

TLS and storage encryption do not alone establish end-to-end privacy. An authorized recording/transcription endpoint necessarily sees its input. List processing endpoints and key holders, isolate keys, audit access and make disclosures accurate. AI outputs are untrusted structured data, never authorization, SQL, shell code or payment commands.

## Deployment and observability

Use only the mapped resources in RESOURCES.md after environment/access verification. No direct branded-app access to engine tables. Expose minimal liveness distinct from schema/provider readiness and release identity. Logs and telemetry exclude sensitive payloads. Engine Room registration and actual ingestion verification are separate states.

Release readiness requires access tests, durable-ballot recovery, no-duplicate settlement, backup restore, measured capacity, accessible interfaces, rehearsals and approved legal/provider configuration. A green homepage, unit test or CI build is not full production acceptance.
