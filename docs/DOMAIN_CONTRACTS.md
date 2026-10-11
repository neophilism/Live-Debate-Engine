# E03 domain contracts and persistence

## Scope

This implements E03, following E02 PR #2 and its verified main CI. Sources: the approved plan E03; manual format/roles pp. 1-8, separate scoring/prizes pp. 8-17, voting pp. 27-35, and privacy/rights pp. 35-42. This is not E07 event-contract approval, E20 voting, E22 outcome calculation, E25 scoring, E27 settlement, or E43 AI qualification.

Twenty entity families have strict runtime parsers and TypeScript types: tenant, series, motion, participant, team, ruleset, tournament, event, assignment, contract, session, poll, ballot, scorecard, audience verdict, judges' verdict, advancement decision, prize obligation, tournament match and dispute. Unknown fields, malformed IDs, invalid enum values, accessors/class instances, invalid Unicode, unsafe integers and cross-scope references are rejected. The four outcome/consequence types are deliberately not assignable to one another; compile-time assertions guard this distinction.

## Immutable revision model

Each entity has an immutable tenant/event scope and kind. A revision includes schema version, stable entity ID, new snapshot ID, increasing revision, prior snapshot, timestamp and typed data. Canonical serialization sorts object keys, preserves arrays and accepts integer JSON values only. It is the engine-specific `lde-json-integers-v1` format, not a claim to implement all RFC 8785 behavior. Limits: 256 KiB encoded record, depth 32, 10,000 visited nodes and 1,000 array elements. Text preserves exact Unicode without silent normalization; NUL and unpaired surrogates are rejected.

A SHA-256 digest verifies content consistency between Node and PostgreSQL. It is not a signature, caller authentication, a secret, or proof that a verdict is substantively correct. Each new revision preserves the original. Privileged database administrators can alter/drop objects; triggers are not tamper-proof against administrators.

The generic immutable store avoids prematurely creating mutable per-feature tables while retaining typed kind/scope constraints, composite foreign keys and concrete version references. Later features can add indexed projections or specialized stores; the revision record remains the input/history source, not an unrestricted public CRUD API. Ballot choice data, profiles, evidence and private notes are represented only by protected-object references where appropriate; no encryption implementation or anonymous voting service is claimed yet. A sealed-ballot type rejects plaintext choice and identity fields, but E05/E20 must implement and qualify the actual storage/cryptography and voting protocol.

## Exact money

Amounts use canonical nonnegative minor-unit strings bounded by signed PostgreSQL bigint, with explicit currency and decimal exponent. Arithmetic uses BigInt, never floating-point currency values. Mixed currencies/exponents, negative amounts, padding, scientific notation and overflow fail. Currency codes are syntax-checked; accepted provider currencies and legal payment configuration are separate later gates. Database constraints independently reject numeric/fractional minor-unit payloads.

## Persistence and idempotency

`appendSnapshot` is an internal service primitive, not authorization. It reparses the record, validates scope/kind/references and uses one database transaction for subject creation, revision append, reference links, command receipt and outbox event. Command-key locking and a subject-row lock serialize retries and competing revisions. A reused key with changed actor/intent conflicts; a true retry returns the original persisted snapshot, even when a server timestamp/snapshot ID was regenerated. Old expected revisions conflict rather than overwrite. Failed reference validation rolls back every related write.

The persisted command actor is internal audit metadata, not evidence of authenticated identity. E04 must derive it from a verified principal and enforce tenant/event/role authorization before calling this primitive. `readSnapshot` requires explicit tenant scope but is also not an authorized external API. No domain read/write route is wired to the HTTP server.

All new tables start with forced, default-deny row-level security and no runtime policies. Integration fixtures use the disposable PostgreSQL administrator to exercise persistence; a separate non-owner role confirms default-deny reads. E04 must establish narrowly privileged runtime roles/policies and transaction-scoped authorization context. Protected-data retention, controlled erasure and legal holds require later policy; immutable references do not justify retaining personal data forever.

## Verification and limitations

Unit cases cover all entity families, separate verdicts, exact large money, malformed values, canonicalization limits, immutable revisions, scope separation, plaintext-ballot rejection, and idempotency fingerprints. PostgreSQL cases cover real writes/reads, hash agreement, concurrency, replay, rollback, foreign keys, outcome-kind conflicts, history mutation, money constraints, bound SQL values and default-deny access. Synthetic fixtures are structural tests, not evidence that a real debate was conducted or a prize awarded.

References: PostgreSQL 17 constraints (https://www.postgresql.org/docs/17/ddl-constraints.html), binary digest functions (https://www.postgresql.org/docs/17/functions-binarystring.html), and the repository's source requirement/decision registers. No cloud deployment or production database verification has occurred.
