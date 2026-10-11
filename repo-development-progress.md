# Development progress

Approved: 50 engine steps and four separate UBC steps. Counts are not effort estimates or readiness percentages. A mapped draft is not a completed plan unit.

| Step | Actual PR | Observed evidence |
|---|---|---|
| E01 | #1 | Merged; verified exact-head/main checks |
| E02 | #2 | Merged e29a302fdeb348b0f2185ee181c83203a85e05e5; head38126067565/main38126144646 passed; self-review5482622645 |
| E03 | #3 | Merged01c90b1dc016667572c08f23190f66cadb0b028d; head38127969980/main38128158515 passed; self-review5482733931 |
| E04 | #4 | Mergedfc40637f2c0af08e7b31e43b1570207922b0e1b7; head38151000137/main38151234814 passed; self-review5483835591 |
| E05 | #6 | Merged1751389581fa0e305b92967d2646fa7ed9f92977; head38160338358/main38160444377 passed; self-review5484260096 |
| E06 | #9 | Merged821eef2c6b0f8f5c543e27bcefba74674232d66e; reviewed-head38167743764/main38167862854 passed; self-review5484609304 |
| E07 | #10 | Full reconstructed implementation candidate. Local strict checks: 141 unit/API records, 64 real PostgreSQL18 records, 21 browser records. Hosted exact-head CI, separate exact-head review, merge and merged-main must be observed before acceptance. |
| E08-E50 | None | Not implemented; proceed in dependency order after actual E07 acceptance |
| U01-U04 | None | Untouched; engine first, U01 waits for E47 |

Auxiliary roadmap/registry changes are not new E-steps. E05 maps only to #6, not the closed duplicate #7. Preserve the owner-approved 50-unit denominator and actual mappings in docs/pr-map.json, registry/roadmap.json and registry/prs.json. Manifest publication does not establish Engine Room ingestion.

E06 connects real account registration, verification, login, MFA/recovery, security and sessions to the existing backend and adds current-user assignment discovery. Two neutral brands share the same components. Permission displays do not pretend later competition workflows are enabled. E07 adds versioned material policy editing, publication, offers, individual acknowledgments, immutable history and permanent invalidation on changed assignments. This is not a deployed or live competition platform.

Cloud metadata access works; no production Render/Neon resource, credential, database, UBC code or unrelated Debate-Engine service was changed. No paid resources or recurring jobs were created. See docs/HANDOFF.md, docs/E06_UI.md and actual PR/check records for current acceptance.
