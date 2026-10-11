# Development progress

Approved: 50 engine steps and 4 separate UBC steps. Counts are not effort or production-readiness percentages.

| Step | Actual PR | Observed evidence |
|---|---|---|
| E01 | #1 | Merged ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head CI 38125095302 and main CI 38125139802 passed |
| E02 | #2 | Merged e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and main CI 38126144646 passed all four jobs; separate security self-review 5482622645 |
| E03 | #3 | Domain contracts and revision persistence implemented on draft PR; adversarial tests, exact-head CI and security review in progress |
| E04-E50 | None | Not implemented |
| U01-U04 | None | Not implemented; UBC remains empty and U01 waits for E47 |

E02 has 48 unit/API tests plus real PostgreSQL migration tests. E03 adds 20 entity families, exact money, immutable snapshots, typed references and transactional idempotency/outbox persistence. No competition-domain endpoint is enabled. Health/schema readiness still reports competitionReady:false.

Render and Neon now show installed, but provider actions remain absent from the exposed runtime inventory. Project/branch health and configuration remain unverified; no cloud resource was changed. The Engine Room manifest is prepared, not confirmed ingested. Private source documents remain outside this public repository.

See docs/pr-map.json, individual PRs, docs/E02_EVIDENCE.md and docs/DOMAIN_CONTRACTS.md. Merge and main checks must be verified from GitHub; this snapshot is not a claim that pending E03 checks passed. No unattended development or scheduler is running.
