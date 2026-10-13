# E08 administration foundation

This increment establishes the typed boundary for series, seasons, motion drafts, exact motion revisions, event venue/broadcast configuration and publication state.

## Invariants

- A series belongs to one tenant and uses valid inclusive calendar bounds.
- A motion starts as a draft. Draft edits require the exact expected revision.
- An event references one exact published motion revision in the same tenant and series.
- Ordinary editing cannot change published motion wording.
- A published change is one explicit atomic amendment that advances the motion and event references while retaining the old and replacement wording, reason, actor and server time.
- Publication is not registration, ballot, production, funding or competition readiness.

## Persistent administration boundary

Series, motion and event administration uses the shared immutable snapshot ledger. Fixed credential-bound operations revalidate the current provider session, membership, role and MFA state while holding the same authorization locks used by material contracts. Every write has an optimistic revision, UUID command id, canonical content hash, authenticated actor, server timestamp and audit record.

The database validates exact JSON fields independently of TypeScript. Published events and motions are amendment-only; one transaction appends both replacement records or neither. Runtime and identity roles receive no generic writer or table mutation capability.

## HTTP boundary

The serving application exposes authenticated same-origin `POST` operations at:

- `/api/tenants/:tenantId/series/:seriesId`
- `/api/tenants/:tenantId/motions/:motionId` and `/publish`
- `/api/tenants/:tenantId/events/:eventId` and `/publish`
- `/api/tenants/:tenantId/events/:eventId/motions/:motionId/amend`

Each operation accepts only JSON, a bounded request body, no query parameters and an identity-provider session. Identifiers and bodies are validated again before the fixed store method executes. Authorization denials do not reveal whether a tenant or record exists. Serialization conflicts return a recovery instruction; unexpected database details are not returned or logged. Successful responses are the database-verified durable result, never a speculative client echo.

## Current boundary

The pure domain layer, durable persistence, credential-bound store, write HTTP boundary and real PostgreSQL regressions are implemented. E08 remains incomplete until reusable organizer UI, read/list journeys, complete browser and accessibility acceptance, and separate exact-head review are merged and verified.
