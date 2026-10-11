# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic/UI; UBC Debates is the thin brand. Keep the politician-debate project independent.

## Verified dependencies

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head/main CI passed. E02 PR #2 merged at e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and merged-main CI 38126144646 passed all four jobs, with separate self-review 5482622645. Its 48 unit/API cases and real PostgreSQL migration cases passed.

## E03 in review

PR #3 implements strict typed contracts for 20 entity families; exact minor-unit money; bounded canonical snapshots; immutable revision references; transactional command idempotency and outbox persistence; SQL structural constraints; and forced default-deny RLS without runtime policies. It adds no public domain API. Initial adversarial tests caught inherited-key dispatch and scope-override weaknesses; the patch validates metadata and freezes the registry. Head 3e47e4b880c5861454c5d99466eef1bcd3c3f43e passed all four jobs in CI run 38127156723. A follow-up cloud-record/PG18-CI change requires fresh exact-head checks and separate review before merge. Check GitHub, not this snapshot, for the final merge state.

Store methods are internal primitives, not authentication or role authorization. E04 must derive principals from verified identity and enforce tenant/event permissions before connecting domain endpoints. E05/E20 must implement actual protected-object encryption and secret-ballot handling. Type labels and hashes are not encryption, signatures, substantive verdict correctness or AI certification.

## Runtime and cloud status

Hosted CI supplies real PostgreSQL and full dependency execution. Local Node is available; public-GitHub DNS still failed in this continuation. No local database run is claimed. Source-review artifacts contain tracked source only.

After the owner's connection update, authenticated Render workspace/service reads and both exact Neon project/production-branch reads succeeded. Both Neon projects use PostgreSQL 18. Render has no listed service for the new repositories; the existing public-debate-engine-preview belongs to Debate-Engine and must stay untouched. The current Render connector cannot verify supplied project-container membership or set project/environment assignment. See CLOUD_ACCESS.md for precise limitations. No cloud resource or production branch was modified; no reconnection request is needed.

E04-E50 and U01-U04 remain. U01 waits for E47; empirical AI promotions wait for U04. Record actual PR, reviewed SHA, check runs, merge/main evidence, implementation limits, blockers and next dependency-eligible work after each transition. Do not fabricate production approval, available funds, real participants or unattended work.
