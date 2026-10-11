# Self-contained handoff

Read README.md, DEVELOPMENT_PLAN.md, REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, RESOURCES.md, SECURITY.md and ../repo-development-progress.md before implementing. Project scope is owner-approved; use Live Debate Engine and UBC Debates, not the earlier working names.

The source manual has format, scoring/prize, AI, audience-voting and legal/privacy sections. Full originals stay private. Source-derived rules and engineering decisions are explicitly separated. Core invariants: independent audience/judging/advancement/obligations; sealed pre-votes and scorecards; accepted immutable event contracts; exact money; preserved corrections; contextual AI findings with qualification gates.

Initial state: engine README bootstrap exists; UBC is empty. E01 introduces the complete approved 54-step plan and specification validation. Check actual PR metadata, head checks and main before proceeding to E02; this text is not a claim E01 has merged. Build in dependency order; U01 starts only after E47, and AI promotions E48-E50 depend on the UBC pilot.

Known environment constraints: local shell cannot resolve public GitHub; connected GitHub reads/writes work. Use scoped connector actions and exact-head GitHub CI; do not treat unavailable local network/dependencies as passing tests. No authenticated Render or Neon connection was available. No cloud resources or secrets have been created/changed.

For every handoff record: actual files, PR URL/number, reviewed SHA, CI runs, merged SHA and main result, tests actually executed, blockers, next eligible task and production status. A pending check stays pending. A failed required check is fixed before merge. No unattended development or scheduler is implied.
