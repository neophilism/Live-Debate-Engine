# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic/UI; UBC Debates is the thin brand. Keep the politician-debate project independent.

## Verified dependencies

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head/main CI passed. E02 PR #2 merged at e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and merged-main CI 38126144646 passed all four jobs, with separate self-review 5482622645. Its 48 unit/API cases and real PostgreSQL migration cases passed.

## E03 in review

PR #3 implements strict typed contracts for 20 entity families; exact minor-unit money; bounded canonical snapshots; immutable revision references; transactional command idempotency and outbox persistence; SQL structural constraints; and forced default-deny RLS without runtime policies. It adds no public domain API. Its initial adversarial test caught inherited-key dispatch and scope-override weaknesses; the subsequent patch explicitly validates metadata and freezes the registry. The latest PR head must pass all checks and separate review before merge. Check GitHub rather than treating this snapshot as a merge claim.

The store methods are internal primitives, not authentication or role authorization. E04 must derive principals from verified identity and enforce tenant/event permissions before any domain endpoint is connected. E05/E20 must implement actual protected-object encryption and secret-ballot handling. Type labels and hashes are not encryption, signatures, substantive verdict correctness or AI certification. Core release/qualification gates remain unchanged.

## Runtime and cloud status

Hosted CI supplies real PostgreSQL and full dependency execution. Local Node can replay compiled artifacts; local public-GitHub DNS, PostgreSQL and Docker were unavailable. Source-review/build artifacts contain tracked source only and can support exact-head inspection. No local database run is claimed.

Render and Neon inventory confirms installed after the owner's update, but both action discovery and installed-skill inventory still expose no provider actions. Do not ask for reconnection or credentials in chat. Verify the exact mapped project/branch before any mutation when actions become available. No cloud resource was changed.

E04-E50 and U01-U04 remain. U01 waits for E47; empirical AI promotions wait for U04. Record actual PR, reviewed SHA, check runs, merge/main evidence, implementation limits, blockers and the next dependency-eligible step after each transition. Do not fabricate production approval, available funds, real participants or unattended work.
