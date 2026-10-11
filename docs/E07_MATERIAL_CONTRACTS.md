# E07 versioned rulesets and material competition contracts

## Implementation and acceptance boundary

E06 PR9 and its merged-main checks are verified predecessors. PR10 originally contained only this documentation anchor. That original head and CI38169696928 did not include or accept E07. This candidate reconstructs the missing implementation; old unpublished local test counts are not its evidence. Final acceptance requires the full published source, six passing exact-head CI jobs, a separate exact-head security review, normal guarded merge and observed merged-main CI.

This milestone implements **material terms**, not event admission, legal approval, scoring, funded prizes or a live competition. `materialReady` requires the current offered version, all current individually bound speakers' acknowledgments and an unbroken material/assignment basis. `registrationOpen` and `competitionReady` are always false. Later admission/state-machine code must recheck the applicable gates transactionally; a cached browser status is never authority.

## Versioned policy and contract

Strict `materialVersion: 2` parsers coexist with unchanged v1 parsing. Rules freeze the rubric and score bounds, per-side timings, electorate/denominator/channels, pre/post windows and latency, independent voting and undisclosed interim distributions, judging mode/aggregation/seats, penalties/bonuses/caps/evidence, no double counting, tie policies, audience-first advancement, 50/50 ordinary prize shares, equal/custom team splits, grace/conduct and separate review/payment deadlines. The initial profile is an editable engineering interpretation, detailed in DECISIONS D15-D19, not a legal or substantive certification. Only human judging rules may be published at this milestone.

An event contract references the exact event, motion, published rules, opposing teams, every roster participant and every owner-bound debater assignment. Each individual receives a side, contiguous speaking order and explicit opening/closing allocation. Totals equal the ruleset's per-side allowances; additional speakers do not multiply them. A person cannot acknowledge another participant or represent an entire team. Custom prize shares total exactly 10,000 basis points per side. Exact minor-unit strings preserve large amounts without floating-point currency conversion.

The contract also records UTC start/acknowledgment instants, a canonical display zone, live/embargoed publication policy, any embargo end, stated budget and amendment reason. Acknowledgment closes before start and is checked against server time. These fields do not implement streaming publication or execute a payout. Every displayed version and referenced material is hash-validated on the server; the browser independently rehashes immutable record bytes.

## Durable workflow

Migration0009 extends the immutable revision store with private, append-only contract bindings, publication records, signers, acknowledgments, historical acceptance, commands, audit and permanent invalidations. Runtime and identity roles cannot select or mutate these private tables. Eight narrow functions, including the RLS visibility predicate, are executable by runtime; private writers and validators are not. All functions have a fixed search path and the guarded NOLOGIN owner. Current actor, session, membership, roles and MFA are derived from the live database credential. No client actor/role parameter exists.

Saving creates a new immutable draft. Publishing a ruleset does not offer a contract. Offering publishes the exact latest contract to authorized event readers. Individual acknowledgment requires the latest offered snapshot, exact digest, explicit true intent, the speaker's own current identity/assignment and a still-open deadline. Historical acceptance is recorded only once every signer has acknowledged. All effects and receipts share one transaction and a server audit record.

Expected revisions prevent lost updates. Tenant-scoped command locks and actor/intent-bound receipts make retries idempotent; changing the actor or intent under a reused key conflicts. Authorization is rechecked after contention. Row locks serialize material effects against credential, membership, assignment and referenced-version changes; real-clock checks reject authority that expires during a wait. A completed retry receipt reports the earlier result, not fresh current readiness.

Every revision after offering requires an amendment reason. A pending draft disables current material readiness and cannot inherit previous acknowledgments. Event, motion, roster, participant or assignment revisions invalidate earlier exact references. Signer identity/membership/grant/ownership changes append permanent invalidations. Restoration cannot silently reactivate acceptance: a new amendment and every required person's fresh acknowledgment are necessary. New ruleset versions do not silently upgrade an event's frozen reference. Original bytes, publication, acknowledgment and acceptance history remain preserved.

Draft terms are restricted to current authorized organizers, including raw revision reads protected by RLS. Authorized participants can review offered historical versions, but cannot acknowledge historical terms as current. History pagination has an explicit current head so an older page cannot accidentally become the editor's expected version. Generic operator snapshot tools remain internal and are not exposed as an API.

## API and reusable screens

All mutations require real authentication, exact same Origin, JSON input, no unsupported content encoding, strict schemas and a 128-KiB body limit. Responses are no-store; errors/logs do not expose contract text, driver messages or credentials. Telemetry sink failure cannot alter a committed result or produce a second response; the transactional audit is independent.

| Route under `/api/tenants/:tenant` | Behavior |
|---|---|
| GET `/rulesets`, GET `/rulesets/:entity` | Authorized current rulesets and revision history; `before` cursor |
| POST `/rulesets/:entity` | Save with `commandId`, `expectedRevision`, complete `data` |
| POST `/rulesets/:entity/publish` | Explicit latest `snapshotId` publication |
| GET `/events/:event/contract` | Current workspace; optional `before` cursor or authorized historical `snapshot` |
| POST `/events/:event/contract` | Save a complete draft/revision |
| POST `/events/:event/contract/offer` | Explicit latest-version offer |
| POST `/events/:event/contract/acknowledge` | Individual `snapshotId`, `contentHash`, `accepted: true` |

All POSTs include a command UUID. Unknown/duplicate query parameters, spoofed actor fields, malformed JSON, invalid UTF8, wrong references, stale versions and invalid lifecycle operations fail closed. Authentication failure returns401; access-denied/unknown scopes return404; stale/material conflicts return409 with refresh/amend guidance; bad schemas return400; bounded-body failures return413/415. Raw SQL callers face independent validation/authorization.

Shared React routes `/rulesets?tenant=...` and `/contract?tenant=...&event=...` are discovered through current assigned workspaces. They provide full rules/rubric editing, frozen material review, explicit publish/offer controls, per-individual allocations, UTC schedule and embargo input, amendment/history navigation and personal acknowledgments. Errors stay inline, focus moves to feedback and stale edits retain unsent values. No web-storage authority or secrets are used. Harbor Forum and Cedar Assembly use the same implementation. UBC Debates remains untouched.

## Executed local evidence and reproducibility

`npm run check`: plan, strict typing, lint, build, migrations and **141 unit/API/contract records** passed. Real PostgreSQL18 integration: **64 records**, including existing identity/storage tests and the material workflow. Actual Chromium/backend tests: **21 records** (19 scenarios plus two parent records), with no skipped cases. These are measured local records, not assertions about unrun hosted checks. PostgreSQL17/18, Node22/24, dependency audit, browser and secret-scan CI must all pass on the final remote head.

| Acceptance area | Executed evidence |
|---|---|
| Version compatibility and policy completeness | v1 round trips; closed v2 schemas; missing/null fields; rubrics, caps, dates, zones and exact amounts |
| Database/API permissions | Different real provider users; role/tenant/actor denial; direct-SQL rejection; private helper/table ACLs; forced RLS and immutable history |
| Publication and acknowledgments | Hidden drafts, exact published references, explicit offer, personal/hash-bound ack, three-person roster and custom splits |
| Amendments/concurrency | Expected-version conflict; same-command retry; changed-intent denial; two competing writers; old terms remain visible but cannot become current |
| Revocation and time | Permanent role-restoration invalidation; changed event basis; credential expiry during a held row lock; expired ack deadline |
| Browser/accessibility | Real UI/API/SQL, keyboard checkbox/submit and focused recovery; both neutral brands; 360-pixel layouts; full-page axe WCAG2/2.1/2.2 AA tags without exclusions |

Browser screenshots of non-secret material pages were visually reviewed. Automated axe and Chromium are not human screen-reader testing or universal accessibility certification. Test harnesses deliberately reset only a disposable loopback database named `lde_ci`; they reject remote/production targets. Test prerequisite fixtures are operator-only and not evidence of E08/E09 runtime workflows. Do not run database and browser reset harnesses concurrently.

No new dependencies, cloud resources, real identities, production schemas, private documents, funds or external operational authorizations were introduced. Normal CI permissions/checks are retained. See E07_SECURITY_REVIEW.md and the exact PR review/CI records before merging.
