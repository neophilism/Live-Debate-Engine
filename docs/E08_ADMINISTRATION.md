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

Series, motion and event administration now uses the shared immutable snapshot ledger. Fixed credential-bound operations revalidate the current provider session, membership, role and MFA state while holding the same authorization locks used by material contracts. Every write has an optimistic revision, UUID command id, canonical content hash, authenticated actor, server timestamp and audit record.

The database validates exact JSON fields independently of TypeScript. Published events and motions are amendment-only; one transaction appends both replacement records or neither. Runtime and identity roles receive no generic writer or table mutation capability.

## Current boundary

The pure domain layer, durable persistence, credential-bound store and real PostgreSQL regressions are implemented. E08 remains incomplete until reusable organizer interfaces, complete HTTP/browser journeys, accessibility acceptance and separate exact-head review are merged and verified.


## Organizer HTTP and interface (PR 18 continuation)

The authenticated `/administration?tenant=<workspace>` page is linked from a
workspace with `tenant.manage`. It lists current administrative series, motions
and events, with bounded cursor pagination and read-only revision history. Draft
forms create or revise records; publication requires an explicit confirmation of
the displayed revision. A published event exposes a separate motion-amendment
form showing prior wording and requiring replacement wording, a reason and
confirmation. The existing database operation appends the motion and event
references atomically. Publication still confers no competition readiness.

Creating an event does **not** grant the creator an event role. Event publication,
editing and amendments retain the explicit event-scoped organizer/producer gates;
amendment also requires the tenant organizer permission. An authorized access
administrator assigns event roles separately through the existing access tooling.
The UI explains this requirement; it never creates or broadens role grants.

The fixed `/api/tenants/:tenant/administration/series|motions|events` routes use the
live identity credential and existing credential-bound write store. POST requires
same-origin provenance and bounded JSON. Store parsers and PostgreSQL independently
validate fields, revisions and authorization; callers cannot supply actors or SQL.
Conflicts return 409, denied scope returns a nondisclosing 404, expired identity
returns 401, and unavailable storage returns 503 without raw diagnostics. All
responses are `no-store`. GET supports a current-record cursor, or an entity and
revision cursor for immutable history; unknown/duplicate/ambiguous queries fail.

Migration `0011_administration_reads.sql` adds a fixed read function with the same
fresh tenant-organizer authorization and security-definer ownership boundaries.
It returns at most 50 records and a continuation cursor. Generic earlier domain
fixtures without the administrative `updatedBy` marker are not presented as
editable E08 administration records. No applied migration is edited, and no
public table grants are added. Deploy migrations before the new application code;
rollback application code first and retain the additive function/migration history.

The browser verifies SHA-256 over canonical records and exact tenant/kind before
using returned revisions. Unchanged transport retries retain one command UUID;
changed intent receives a new UUID. A confirmed write followed by a failed list
refresh is reported as a confirmed write with unavailable refresh, rather than an
invitation to repeat the mutation. A 409 preserves unsaved fields and disables
submission until explicit refresh/review. Pagination suppresses duplicate loads
and discards responses superseded by refresh.

## Verification status for this continuation

Focused administration HTTP/client/domain tests: 14 passed locally. The organizer
UI/client passed a strict focused TypeScript check using available TypeScript
5.9.3; the repository pins 5.8.3, so this is not exact toolchain evidence. The
production dependencies installed from the pinned lockfile offline. Full pinned
dev-tool install was unavailable because required cached dev packages were absent.

A real Chromium browser with a **synthetic transport fixture** exercised create,
edit, publish, event binding, atomic-amendment response handling, revision history,
lost-response idempotent retry, and stale-edit recovery. No page errors or horizontal
overflow appeared at 1440/1024/768/390/320 px; desktop/mobile images were visually
inspected. This fixture does not prove identity or database enforcement. The
committed real identity/PostgreSQL browser suite now exercises the same journey,
including explicit event-role assignment and accessibility checks. New PostgreSQL
coverage checks scoped reads, history, pagination, replay and real HTTP conflicts.
Those real database/browser suites and exact pinned lint/type/build still require
current-head CI; no local PostgreSQL server is available. Local broader unit
execution hit an environment-denied Unix socket in an existing ClamAV fixture.
No required tests were removed, skipped or weakened.

AI-assisted source review checked authorization boundaries, read filtering,
parameterized queries, migration ownership, method/origin/body limits, hash/scope
validation, optimistic revisions and retry identity. There is no independent human
review or certification claim. No new resources, paid calls, credentials, real
participants or deployment are involved in this change.
