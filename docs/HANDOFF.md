# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, E03_EVIDENCE.md, E04_IDENTITY.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic/UI; UBC Debates is the thin brand. Keep the politician-debate project independent.

## Verified dependencies

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head/main CI passed. E02 PR #2 merged at e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and merged-main CI 38126144646 passed, with separate self-review 5482622645.

E03 PR #3 merged at 01c90b1dc016667572c08f23190f66cadb0b028d. Reviewed head 74466c3d825e1708dec9a098e2f9b3e905f0f6db passed CI 38127969980 and merged main passed CI 38128158515: Node 22, Node 24, PostgreSQL 17, PostgreSQL 18 and secret scanning. Separate self-review 5482733931 was recorded; normal expected-head merge succeeded. See E03_EVIDENCE.md.

## E04 in development

The first slice adds a strict policy evaluator and adversarial unit tests in packages/contracts/src/access.ts and tests/unit/access.test.mjs. It is not authentication or public authority. Current trusted identity/grants/ownership must be loaded server-side. Staff MFA is tied to a completed challenge for the current session, with explicit freshness limits; service profiles cannot impersonate humans or acquire broad admin rights.

Remaining gates are explicit in E04_IDENTITY.md: provider-backed authentication/MFA/recovery, durable identity/role/service records, revocation and secure session handling, transaction-scoped RLS, authenticated API/object/job/realtime guards, provider-library/SQL/HTTP integration tests and separate review. Do not mark E04 complete or proceed to E05 merely because policy unit tests pass. No runtime row policies or public domain endpoints have been enabled.

Neon Auth is not enabled on the supplied engine branch. The Neon auth skill identifies a managed MFA limitation; self-managed Better Auth with a verified two-factor flow is the candidate, not installed/configured yet. Upstream stable release v1.7.7 was observed. Preserve the staff MFA requirement; never substitute a twoFactorEnabled flag for verified session assurance.

## Runtime and cloud status

Hosted CI supplies actual PostgreSQL and dependency execution. Local Node/TypeScript are present, but registry.npmjs.org and github.com DNS failed; use exact-head hosted checks rather than claiming local install/database tests. The source-review artifact contains tracked source only.

Authenticated Render workspace/service reads and both exact Neon project/production-branch reads succeeded. Both Neon projects use PostgreSQL 18. Render has no listed service for the new repositories. The old public-debate-engine-preview belongs to Debate-Engine and must not be reused. Current Render actions cannot read/assign project containers; do not create a service outside the intended project as a substitute. CLOUD_ACCESS.md documents precise read scope; no cloud resource was mutated and no reconnection is needed.

U01 waits for E47; E48-E50 empirical AI promotion waits for U04. Record actual PR, reviewed SHA, check runs, merge/main evidence, limits, blockers and next dependency-eligible work. Do not fabricate production approval, funding, participants, independent review or unattended work.
