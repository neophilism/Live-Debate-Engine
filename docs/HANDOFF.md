# Self-contained handoff

Start with README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, E03_EVIDENCE.md, E04_IDENTITY.md, E05_PROTECTED_STORAGE.md, E06_UI.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic and UI. Finish the engine before beginning UBC Debates; leave that repository and the unrelated politician-debate product untouched.

## Verified predecessors

E01 PR1 and E02 PR2 merged with verified head/main checks. E03 PR3 merged at 01c90b1dc016667572c08f23190f66cadb0b028d; head CI38127969980 and main38128158515 passed; self-review5482733931.

E04 PR4 merged at fc40637f2c0af08e7b31e43b1570207922b0e1b7. Head8ab385a8d26809a87c6f05a9cb9b6845c9de2753 passed38151000137; main38151234814 passed; separate self-review5483835591. Real Better Auth, session-bound MFA/recovery/revocation and credential-bound DB authorization are implemented, not merely policy stubs.

E05 maps only to PR6, not auxiliary roadmap PR5 or closed duplicate PR7. Head367fef100dd88561a938d0867f69dda69d231c66 passed38160338358; merge1751389581fa0e305b92967d2646fa7ed9f92977 passed main38160444377; separate self-review5484260096. Protected records are purpose-separated encrypted/quarantined objects bounded to 1 MiB. Application/scanner are disclosed plaintext processors. Live ClamAV signatures, cloud key custody and media-scale storage remain release gates.

Starting E06 main86d3601c264d5c9256f6a8483784ef0a27c827f4 (including auxiliary Engine Room registry updates) passed38161332759. Exact source artifact matched tree01ef40bedca65bc986944748e354e6db902eefd5.

## E06 candidate, PR9

Branch feat/e06-reusable-ui adds shared React components, two neutral brands, actual identity/account-security UI, current-user workspace discovery and real browser accessibility/keyboard tests. No client-selected role or brand grants access. The SQL function has no asserted-principal parameter and checks current credential-derived grants. Static paths are allowlisted; browser bundle excludes identity/database/key modules. No secret is intentionally put in web storage or screenshots.

Local strict compilation/lint/build/plan/migration checks passed: 133 unit/API/contract cases, 46 PostgreSQL 18 cases and 11 browser records (parent plus ten scenarios). Non-secret screenshots were visually reviewed. Final head CI, review, merge and merged-main must be read from actual PR9 before proceeding; local checks are not a merge claim. The temporary toolchain preparation workflow is removed from the final candidate. See E06_UI.md for implementation, artifact provenance and limitations.

Next dependency-ready step after verified E06 acceptance is E07: versioned ruleset editing/validation and frozen competition contracts with explicit amendments/acknowledgments. Do not expose the internal generic snapshot writer as an unrestricted API. Keep audience verdict, judges verdict, advancement and obligations separate. No live competition, actual prize funding or AI qualification exists yet.

## Environment and cloud

Render/Neon metadata reads work. Both exact Neon targets are production branches on PostgreSQL 18 and remain unmodified. Render actions do not establish the supplied project-container assignment; do not deploy elsewhere as a substitute. Existing public-debate-engine-preview belongs to the different Debate-Engine repository.

Local GitHub/npm DNS is blocked. E06 restored authenticated source/dependency/Chromium/PostgreSQL artifacts in the isolated working container. PostgreSQL is loopback-only and both destructive test harnesses refuse any database except local lde_ci. No cloud data or credentials were used. Local artifact downloads are not production provisioning.

Production HTTPS, mail, trusted ingress/rate limits, backups and broader accessibility assessment remain release gates. U01 waits for E47; E48-E50 empirical promotion retains its approved U04 dependency. Update actual PR mappings/evidence without changing the 50-step engine denominator. Do not invent independent review, available funds, real participants, certification or unattended future work.
