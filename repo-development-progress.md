# Development progress

Approved: 50 engine steps and 4 separate UBC steps. Counts are not effort or production-readiness percentages.

| Step | Actual PR | Observed evidence |
|---|---|---|
| E01 | #1 | Merged ddff3302b5ee3de0057fab1c459c4df7f607c923; exact-head CI 38125095302 and main CI 38125139802 passed |
| E02 | #2 | Merged e29a302fdeb348b0f2185ee181c83203a85e05e5; exact-head CI 38126067565 and main CI 38126144646 passed; separate security self-review 5482622645 |
| E03 | #3 | Merged 01c90b1dc016667572c08f23190f66cadb0b028d; all five jobs passed on exact-head CI 38127969980 and main CI 38128158515; separate security self-review 5482733931 |
| E04 | Pending actual PR mapping | In development: deny-by-default policy evaluator and tests. Provider/MFA integration, persisted session/role controls, RLS and authenticated API gates remain; not complete. |
| E05-E50 | None | Not implemented |
| U01-U04 | None | Not implemented; UBC remains separate and U01 waits for E47 |

E03 implements twenty domain entity families, exact money, immutable snapshots, typed references and transactional idempotency/outbox persistence. No public competition-domain endpoint is enabled. Health/schema readiness still reports competitionReady:false.

Authenticated Render and Neon actions now work. Both supplied Neon project/branch pairs were verified as production branches on PostgreSQL 18. Render workspace/services were inspected; none of the returned services uses either new repository. Exact Render project-container membership remains unverified because current actions do not expose it. The unrelated Debate-Engine service and all production databases were left untouched. See docs/CLOUD_ACCESS.md.

The Engine Room manifest is prepared, not confirmed ingested. Private source documents remain outside this public repository. No cloud mutations, paid resources or recurring jobs were created. See docs/E03_EVIDENCE.md, docs/E04_IDENTITY.md, docs/pr-map.json and actual PR/check records for current state.
