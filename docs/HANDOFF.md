# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, DATABASE_SECURITY.md, SECURITY.md and ../repo-development-progress.md. Live Debate Engine owns reusable competition logic/UI; UBC Debates is the thin brand. Keep the politician-debate project independent.

## Observed evidence

E01 PR #1 merged at ddff3302b5ee3de0057fab1c459c4df7f607c923 with exact-head/main CI passing. E02 is PR #2. Its head 46eafa30d24f9f9708e378aa564fc95f77ac65b2 passed all four CI jobs in run 38125823915, and all 47 unit/API tests replayed locally from the verified CI artifact. A subsequent duplicate-URL-option guard plus evidence updates must pass fresh exact-head checks and separate self-review before merge. Read E02_EVIDENCE.md and GitHub for current state; do not infer a merge from this snapshot.

E02 provides typed workspaces, health/schema-readiness endpoints, safe local configuration, checksummed transactional migrations, unit/API/database tests and build/security artifacts. It is not a functioning competition application. E03 domain contracts/schema is the next dependency-eligible step only after E02 merges and main CI passes.

## Environment and remaining gates

Local Node 22.16 can replay dependency-free tests from compiled CI artifacts. Public GitHub DNS and local PostgreSQL/Docker were unavailable; connected GitHub and hosted CI work. Both Render and Neon show installed after the owner connected them, but action discovery still did not expose either provider. Do not ask for reconnection or credentials in chat. Verify exact mapped project/branch before mutations when tools are available. No cloud resource has been modified.

E03-E50 and U01-U04 remain. U01 depends on E47; AI promotion E48-E50 depends on U04 and empirical oversight. No legal approval, available prize funding, certified model, real event or operator rehearsal is fabricated. Record actual PR mappings, reviewed head, check runs, merge SHA, main checks, blockers and next eligible step after each transition.
