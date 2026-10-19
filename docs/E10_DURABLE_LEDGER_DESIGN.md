# E10 immutable legal-consent ledger: implementation contract (draft)

Status: design and executable preflight models only. No legal release, signature, account, or active competition privilege is created by E10's current branch. This document is engineering guidance, **not** jurisdiction-specific legal advice or a verified legal template.

## Prerequisites and migration ordering

E09's approved but unmerged work owns additive schema migration `0012_casting_review_drafts.sql`. Do not compete for migration 0012 or edit a previously applied migration. Merge and verify E09 first, then implement E10's own additive migration (starting at 0013 if the manifest's next number remains 0013). Validate the full historical manifest on PostgreSQL 17 and 18 before any production promotion. All E10 functions must use the existing identity credential broker and least-privileged runtime roles. The client must not supply a principal, tenant membership, organizer designation, staff MFA claim, guardian evidence, legal approval or server timestamp.

## Trusted publishing and consent boundaries

1. A legally authorized publisher creates a tenant- and event-scoped template with immutable revision, jurisdiction, kind, exact body digest and separate `draft | review-pending | approved | withdrawn` state. An assertion of `approved` in an input document cannot authorize publication; permission, document review and provenance must come from a trusted server actor and audited workflow.
2. The official current-document selection must be transactionally coupled to consent issuance. A client request includes only an idempotency command UUID, the exact current document reference, and affirmative `accepted:true`; the backend resolves the principal from a currently valid authenticated session. A changed version, changed digest, expired event, revoked participant or superseding release must reject the request, not silently migrate existing consent.
3. A response is not a valid signature merely because the client checked a checkbox or submitted a timestamp. Store server-authenticated receipt type, verified credential assurance, exact release version, server-issued time and per-jurisdiction legal-capacity/guardian decision. Make the terminal acceptance result conditional on the configured release and participant policy, never on client `accepted` alone.
4. A guardian attestation requires separate independently authenticated guardian identity, relationship/authority evidence, and a revocable association with the junior participant. Store proofs only through approved protected-data storage, not logs, URLs, analytics events or public snapshots.
5. Material-rights and embargo declarations must remain event-scoped, separately revisioned, and revoked independently. Employee/family conflicts should block or enter an explicitly auditable independent-review lane rather than inherit a generic verified flag.

## Persistence and invariants

- Record immutable publication revisions and append-only per-participant legal acceptance/withdrawal events in guarded SQL tables with tenant/event/document foreign keys, protected row policies, restrictive grants and audited SECURITY DEFINER functions using fixed SQL statements.
- Authorize by current effective tenant membership, event participant status, verified assurance and exact document exposure. The SQL transaction must serialize on tenant/event/document/principal and idempotency key before checking expected revision, so an uncertain HTTP retry returns the same receipt and cannot duplicate consent. A changed payload under one key must raise a conflict.
- Canonical digest and durable event sequence must be checked on each read. An explicit withdrawal or superseding document invalidates the previously current acceptance; never infer valid consent from old append-only rows without a current-revision projector.
- Never expand an E07 material-contract acknowledgment into a recording release. That contract is an independent, different object with different authorization and meaning.
- Keep `participationAuthorized:false` until the identity, guardianship, actual consent, independent conflict, rights and current event readiness gates are all independently verified. E10 preflight functions intentionally return only advisory status.

## Privacy and retention

Minimize recorded PII and sensitive capacity evidence. Store encrypted or access-controlled proof pointers with a separate restricted audit access path. Avoid raw legal body text, participant birthdate, guardian proof, IP address, authentication token or signature in application logs. Explicitly version tenant/jurisdiction-specific retention and erasure/tombstone policy before deployment; do not assume permanent archival retention is lawful. Audit who viewed protected proofs and reject broad tenant list APIs exposing them.

## Acceptance tests before E10 ready

- PostgreSQL integration: staff/session permission and MFA freshness; revoked tenant/event membership; cross-tenant, cross-event and self/guardian scopes; replayed command exactly once; lost-response safe retry; concurrent acceptance/supersession; immutable withdrawal and SQL role grants; migration 0012->0013 and fresh deployment parity.
- Browser: published legal text with exact version and digest, explicit consent, accessible error/withdrawal feedback, junior guardian journey, time-zone-safe display, mobile and keyboard audits, no credential/local-storage leaks, and no implicit competition access.
- Security: forged current digest, old release revision, client-asserted principal/guardian/approval/time, employee/family conflict, stale identity, CSRF, cross-scope query, invalid UTF-8/body flood and private proof disclosure must fail closed.
- Operational: actual CI for the exact PR head, confirmed mergeability, independent E09 prerequisite and branch protections. Legal enforceability and human legal review are separate factual statuses, not simulated software test results.

Supporting pure models and isolated unit tests: `eligibility.mjs`, `event-acceptance.mjs`, `legal-template.mjs`, `acceptance-intent.mjs`, `participant-eligibility.mjs` and `acceptance-history.mjs`. These do not replace durable authenticated persistence.
