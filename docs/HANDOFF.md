# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, CLOUD_ACCESS.md, DEVELOPMENT.md, SECURITY.md and ../repo-development-progress.md first. Owner-approved scope: Live Debate Engine owns all competition logic and reusable UI; UBC Debates is the thin brand. Keep the politician-debate product separate.

## Observed evidence

E01 merged as PR #1 at ddff3302b5ee3de0057fab1c459c4df7f607c923. Exact-head CI run 38125095302 passed; merged-main CI run 38125139802 passed. A separate self-review is recorded on PR #1. E02 foundation is being submitted; do not assume its tests or merge have passed from this snapshot.

E02 implements a Node/TypeScript workspace, safe local configuration, health/schema-readiness API, checksum migrations, strict compilation/lint, unit/API tests, disposable PostgreSQL integration, dependency/secret scanning and artifacts. No competition or production readiness is claimed. Follow actual CI and reviewed lockfile evidence. E03 is next only after E02 exact-head and merged-main gates pass.

## Environment constraints

Local shell has Node 22.16 and TypeScript 5.8.3 but public GitHub DNS resolution failed; PostgreSQL/Docker were not installed. Connected GitHub reads/writes and hosted CI work. Use exact-head CI for dependencies/database execution; never claim local integration tests ran. Both Render and Neon show installed after the owner's update, but their actions were still not exposed by tool discovery. Do not ask for reconnection or paste credentials. Verify the authorized project/branch when actions are available; no cloud mutation has occurred.

## Remaining gates

All domain features E03-E50 and branded U01-U04 remain. U01 depends on E47; E48-E50 depend on U04 and empirical oversight qualification. No production legal approval, funds, certified AI model, operator rehearsal or real event is fabricated. Update actual PR mapping and progress with observed evidence, not future intent.
