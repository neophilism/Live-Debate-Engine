# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, E03_EVIDENCE.md, E04_IDENTITY.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic and UI. The owner explicitly requested completion of the engine before beginning UBC Debates; the branded repository and the unrelated politician-debate product remain untouched.

## Verified dependencies

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head/main CI passed. E02 PR #2 merged at e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and merged-main CI 38126144646 passed, with separate self-review 5482622645.

E03 PR #3 merged at 01c90b1dc016667572c08f23190f66cadb0b028d. Reviewed head 74466c3d825e1708dec9a098e2f9b3e905f0f6db passed CI 38127969980 and merged main passed CI 38128158515: Node 22/24, PostgreSQL 17/18 and secret scanning. Separate self-review 5482733931; normal expected-head merge. See E03_EVIDENCE.md.

## Verified E04 and E05

E04 PR #4 merged at fc40637f2c0af08e7b31e43b1570207922b0e1b7. Reviewed head 8ab385a8d26809a87c6f05a9cb9b6845c9de2753 passed CI 38151000137; merged-main CI 38151234814 also passed all five jobs. Separate security self-review 5483835591. The real Better Auth provider, session-bound MFA/recovery/revocation and credential-bound database authorization are implemented; prior draft-only wording is superseded.

E05 PR #6 merged at 1751389581fa0e305b92967d2646fa7ed9f92977; exact-head CI 38160338358 and main CI 38160444377 passed all five jobs; separate self-review 5484260096. It implements bounded encrypted objects, purpose-separated keys, quarantine, scanner protocol, signed session-bound downloads and immutable audits. See E05_PROTECTED_STORAGE.md. The real scanner/cloud/media/retention gates remain explicit. Auxiliary roadmap PR #5 is preserved and duplicate PR #7 closed without counting extra work.

## E06 in development

PR #8 adds the engine-owned React interface, accessible primitives and actual account/security/workspace/file workflows. Two neutral profiles use the same bundle; UBC remains untouched. New metadata lists preserve RLS and per-file purpose/owner boundaries. UI permissions do not replace backend authorization. Static assets and public brand selection are strictly bounded.

The candidate dependencies were obtained from read-only CI run 38160673069 and reviewed against the committed baseline: no existing version changed. New dependencies are pinned; TypeScript remains 5.8.3. Local 134 unit/API/contract tests and 46 real PostgreSQL cases pass. Local Chromium cannot navigate due to environment policy; leave it intact and use the actual hosted browser CI job. Browser/axe/keyboard checks and screenshot review must pass before E06 can merge. The temporary dependency workflow is absent from the final tree. No incomplete gate may be inferred from the local unit checks.

## Environment and cloud

Authenticated Render and Neon metadata reads work. Both exact Neon targets are production branches on PostgreSQL 18; they were not modified. Render's available actions do not verify project-container assignment; do not deploy outside the intended project as a substitute. The old public-debate-engine-preview belongs to Debate-Engine and is unrelated.

Local public GitHub/npm DNS was unavailable, so authentic GitHub Actions dependency artifacts and official PostgreSQL 18 binaries were used in the isolated working container. PostgreSQL listens only on loopback and the integration suite refuses any database except local lde_ci. No cloud data, credentials, paid resources or production migrations were introduced.

Production HTTPS, email delivery, trusted ingress/rate limits, least-privilege cloud roles and backups remain release gates. Local email files are private and ignored; external mail transport is not a provisioned account or durable queue. E11 handles durable communications. No background development or recurring scheduler is implied.

U01 waits for E47; E48-E50 empirical AI promotion retains its approved U04 dependency. Record actual PR, reviewed SHA, workflow runs, merge/main evidence, limitations and next eligible work at each transition. Never invent independent review, available prize funds, real participants or AI qualification.
