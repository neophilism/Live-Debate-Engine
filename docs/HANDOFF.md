# Self-contained handoff

Start with README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, DOMAIN_CONTRACTS.md, E03_EVIDENCE.md, E04_IDENTITY.md, E05_PROTECTED_STORAGE.md, E06_UI.md, E07_MATERIAL_CONTRACTS.md, E07_SECURITY_REVIEW.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic and UI. Finish the engine before beginning UBC Debates; leave that repository and the unrelated politician-debate product untouched.

## Verified predecessors

E01 PR1 and E02 PR2 merged with verified head/main checks. E03 PR3 merged at 01c90b1dc016667572c08f23190f66cadb0b028d; head CI38127969980 and main38128158515 passed; self-review5482733931.

E04 PR4 merged at fc40637f2c0af08e7b31e43b1570207922b0e1b7. Head8ab385a8d26809a87c6f05a9cb9b6845c9de2753 passed38151000137; main38151234814 passed; separate self-review5483835591. Real Better Auth, session-bound MFA/recovery/revocation and credential-bound DB authorization are implemented, not merely policy stubs.

E05 maps only to PR6, not auxiliary roadmap PR5 or closed duplicate PR7. Head367fef100dd88561a938d0867f69dda69d231c66 passed38160338358; merge1751389581fa0e305b92967d2646fa7ed9f92977 passed main38160444377; separate self-review5484260096. Protected records are purpose-separated encrypted/quarantined objects bounded to 1 MiB. Application/scanner are disclosed plaintext processors. Live ClamAV signatures, cloud key custody and media-scale storage remain release gates.

Starting E06 main86d3601c264d5c9256f6a8483784ef0a27c827f4 (including auxiliary Engine Room registry updates) passed38161332759. Exact source artifact matched tree01ef40bedca65bc986944748e354e6db902eefd5.

## E06 accepted, PR9

E06 merged at 821eef2c6b0f8f5c543e27bcefba74674232d66e. Reviewed head a3f6004111ea0a2596c6d7497bfeee1acb927977 passed CI38167743764; merged-main CI38167862854 passed; separate self-review5484609304. Shared React, real account/MFA/session interfaces, current-user workspaces and both neutral-brand browser journeys are implemented.

## E07 candidate, PR10

The original head1a1bfde5223e0ded451a1400b42e5ea6abbfc052 contained only a five-line document. Its passing run38169696928 did not accept E07. The previously reported local implementation was not recoverable from the accessible source artifact; this continuation reconstructed and tested the actual feature. Do not carry forward the old 140/58/16 test claims as evidence for this source.

The full candidate adds materialVersion2 rules/contracts without rewriting v1, narrow credential-bound SQL/API operations, publication/offer separation, exact allocations, personal acknowledgments, immutable amendments/history, permanent changed-basis invalidation and reusable organizer/participant React pages. Local checks passed 141 unit/API records, 64 real PostgreSQL18 records and 21 browser records (19 real scenarios plus two parent records). The authoritative final exact-head CI/review/merge/main evidence must be read from PR10; this source does not predeclare a future merge. Read E07_MATERIAL_CONTRACTS.md and E07_SECURITY_REVIEW.md.

Next: after all E07 gates and merged-main CI pass, execute E08 series, motions and event administration, then E09 casting/rosters in dependency order. E07 tests seed prerequisites through explicitly operator-only fixtures because those runtime workflows are later steps; never expose the generic snapshot writer. All new effects must preserve material-basis invalidation. Registration and competition remain closed; no actual funds or official AI modes are authorized.

## Environment and cloud

Render/Neon metadata reads work. Both exact Neon targets are production branches on PostgreSQL 18 and remain unmodified. Render actions do not establish the supplied project-container assignment; do not deploy elsewhere as a substitute. Existing public-debate-engine-preview belongs to the different Debate-Engine repository.

Local GitHub/npm DNS is blocked. E06 restored authenticated source/dependency/Chromium/PostgreSQL artifacts in the isolated working container. PostgreSQL is loopback-only and both destructive test harnesses refuse any database except local lde_ci. No cloud data or credentials were used. Local artifact downloads are not production provisioning.

Production HTTPS, mail, trusted ingress/rate limits, backups and broader accessibility assessment remain release gates. U01 waits for E47; E48-E50 empirical promotion retains its approved U04 dependency. Update actual PR mappings/evidence without changing the 50-step engine denominator. Do not invent independent review, available funds, real participants, certification or unattended future work.
