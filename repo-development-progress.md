# Development progress

Approved: 50 engine steps and 4 separate UBC steps. Counts are not effort or production-readiness percentages.

| Step | Actual PR | Observed evidence |
|---|---|---|
| E01 | #1 | Merged ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head CI 38125095302 and main CI 38125139802 passed |
| E02 | #2 | Merged e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and main CI 38126144646 passed all four jobs; separate security self-review 5482622645 |
| E03 | #3 | Head 3e47e4b880c5861454c5d99466eef1bcd3c3f43e passed all four CI jobs in run 38127156723. Cloud-record/PG18-CI follow-up requires new exact-head checks and review; not yet a merge claim. |
| E04-E50 | None | Not implemented |
| U01-U04 | None | Not implemented; UBC remains separate and U01 waits for E47 |

E03 adds 20 entity families, exact money, immutable snapshots, typed references and transactional idempotency/outbox persistence. No competition-domain endpoint is enabled. Health/schema readiness still reports competitionReady:false.

Authenticated Render and Neon actions now work. Both supplied Neon project/branch pairs were verified as production branches on PostgreSQL 18. Render workspace/services were inspected; none of the returned services uses either new repository. Exact Render project-container membership remains unverified because the current actions do not expose it. The unrelated Debate-Engine service and all production databases were left untouched. See docs/CLOUD_ACCESS.md.

The Engine Room manifest is prepared, not confirmed ingested. Private source documents remain outside this public repository. No cloud changes, paid resources or recurring jobs were created. See docs/pr-map.json and actual PR/check records for current merge state.
