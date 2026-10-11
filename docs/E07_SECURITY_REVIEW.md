# E07 separate security self-review

## Review identity and status

This is a separate author self-review after implementation and adversarial testing, not independent security certification. The final PR review must identify the exact published head and verify its CI; this document cannot preapprove a future commit. Repository protections and the user's acceptance gates remain binding. No production operation is authorized.

## Reviewed boundaries

Review covered the full material migration, credential-bound store and HTTP handlers, strict v1/v2 domain parsers, canonical serialization boundary, shared React/browser reader, API wiring, startup-role checks and all added tests. Existing action pinning, read-only CI permissions, lockfile, identity/session/MFA and protected-storage boundaries are retained. The browser bundle excludes the database, identity, key-management and material store/HTTP modules.

The new tables have forced RLS, no runtime/identity direct privileges and mutation-prevention triggers. Database catalog inspection and regression assertions establish the exact eight runtime-callable functions; private helpers, both triggers and canonical writer are not executable by runtime or identity. All25 material functions have the fixed `pg_catalog, pg_temp` path and the guarded NOLOGIN owner; PUBLIC has no execute grants. The migration credential remains the trusted operator, not an application credential. Security-definer functions contain no caller-selected SQL/function/relation names.

Authorization derives the current verified human principal, not request fields. Staff material writes require current MFA. Transaction locks/rechecks cover identity, session, membership, grants, owner mapping and referenced records. Real-clock checks address expiration during a blocked statement. All required speakers' current roles and exact roster references are checked before effects. Current-role restoration cannot erase append-only invalidation. Runtime object access and published history are narrowed, not broadened into a generic snapshot API.

HTTP requests enforce origin, methods, size, encoding and closed schemas. Error responses/logs exclude raw materials, credentials and driver diagnostics. Durable audit and command receipts are atomic with effects; an external telemetry failure cannot roll back an already committed effect or provoke a second HTTP response. UI text is rendered as React data, not HTML; controls send version/hash intent, never an asserted actor. Server checks remain mandatory regardless of UI state.

## Findings resolved before the final candidate

1. A SQL identifier ambiguity in a publication-history query blocked valid saves; the alias was disambiguated and real SQL workflows rerun.
2. New request logging initially used a non-allowlisted event; the closed event vocabulary was extended, then telemetry exception isolation was tested.
3. Input validation was hardened for SQL/TypeScript Unicode length and whitespace behavior, canonical UTC/zone vocabulary, required nested fields, bounded bodies and UUIDv4 entities. UTF8 database encoding is now explicit.
4. Signer validation was moved after the relevant row locks, and real-clock authority rechecking added after contention. A real held-lock/expired-session regression verifies denial.
5. Restoring a revoked role could otherwise revive old material readiness. Permanent invalidation records and new-version reacknowledgment now prevent that behavior.
6. Team allocation validation now compares exact participant references, not only their entity IDs. Historical detail reads validate the exact referenced immutable records; historical pages retain a distinct latest edit head.
7. The stale-editor browser test needed to wait until the original version rendered before creating a rival revision. The repaired test proves a real409, retained inputs and focused recovery, not a mocked conflict.

## Residual and deferred controls

A database administrator can alter/drop tables and controls; hashes are consistency checks, not signatures or protection against that administrator. The fixed per-tenant material lock favors correctness and bounded contention; scale/fault qualification remains E44. HTTP/session ingress hardening, deployment HTTPS/mail, external backup/restore, operational monitoring and human screen-reader/broader browser review retain their later gates. No test claims independent model qualification, approved legal terms, participant eligibility, secret ballots, safe payout execution or funding.

A historical accepted marker and an idempotent old command receipt are not fresh readiness. E12/E13 and later workflows must call current transaction-bound gates rather than trust displayed/cached status. No hosted deployment, cloud mutation, production data or UBC repository change occurred in this milestone. Full local checks must be rerun after any review fix, then the final remote head's six CI jobs and exact-head review must pass before merge; merged-main must also be verified before E08.
