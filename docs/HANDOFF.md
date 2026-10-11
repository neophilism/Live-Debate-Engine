# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, E03_EVIDENCE.md, E04_IDENTITY.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic and UI. The owner explicitly requested completion of the engine before beginning UBC Debates; the branded repository and the unrelated politician-debate product remain untouched.

## Verified dependencies

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head/main CI passed. E02 PR #2 merged at e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and merged-main CI 38126144646 passed, with separate self-review 5482622645.

E03 PR #3 merged at 01c90b1dc016667572c08f23190f66cadb0b028d. Reviewed head 74466c3d825e1708dec9a098e2f9b3e905f0f6db passed CI 38127969980 and merged main passed CI 38128158515: Node 22/24, PostgreSQL 17/18 and secret scanning. Separate self-review 5482733931; normal expected-head merge. See E03_EVIDENCE.md.

## E04 implementation awaiting exact-head acceptance

PR #4 now implements the real pinned Better Auth 1.7.7 provider, verified-email registration, session-bound TOTP proof, recovery, revocation, role/service records, database-enforced authorization, audited operator controls and actual HTTP/runtime integration. The earlier policy-only slice is superseded. Generic competition writes remain disabled. Current providers and the application use separate non-owner pools in one process; this is not whole-process compromise isolation.

Local validation passed 118 unit/API/contract cases and 36 real PostgreSQL integration cases, including actual provider signup, email verification, TOTP, recovery, password changes/reset, membership/session revocation, role separation, worker limits, rate limits and the real launcher. Strict TypeScript compilation and lint were exercised. Final GitHub CI and separate exact-head security review remain mandatory; this document does not assert this pending PR has merged. The full aggregate local check encountered execution-environment timeouts; individual component results are not mislabeled as an aggregate pass.

Dependency artifacts were generated in read-only, credential-free preparation workflows, reviewed and committed in the lockfile; temporary workflows are removed in the submitted final tree. TypeScript remains 5.8.3, strict and skipLibCheck:false. Only the official Bun SQLite declaration required by the provider is included, not global Bun typings. Do not weaken compiler or CI gates.

E05 is next only after E04 exact-head checks, security review, normal merge and merged-main validation. E05 must provide actual protected-object encryption and upload quarantine; E04 token references are not an encryption service. E06 supplies reusable browser forms. Later object/realtime/job handlers must use fresh credential-broker authorization and their workflow-specific guards.

## Environment and cloud

Authenticated Render and Neon metadata reads work. Both exact Neon targets are production branches on PostgreSQL 18; they were not modified. Render's available actions do not verify project-container assignment; do not deploy outside the intended project as a substitute. The old public-debate-engine-preview belongs to Debate-Engine and is unrelated.

Local public GitHub/npm DNS was unavailable, so authentic GitHub Actions dependency artifacts and official PostgreSQL 18 binaries were used in the isolated working container. PostgreSQL listens only on loopback and the integration suite refuses any database except local lde_ci. No cloud data, credentials, paid resources or production migrations were introduced.

Production HTTPS, email delivery, trusted ingress/rate limits, least-privilege cloud roles and backups remain release gates. Local email files are private and ignored; external mail transport is not a provisioned account or durable queue. E11 handles durable communications. No background development or recurring scheduler is implied.

U01 waits for E47; E48-E50 empirical AI promotion retains its approved U04 dependency. Record actual PR, reviewed SHA, workflow runs, merge/main evidence, limitations and next eligible work at each transition. Never invent independent review, available prize funds, real participants or AI qualification.
