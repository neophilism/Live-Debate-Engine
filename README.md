# Live Debate Engine

A white-label operating platform for structured, motion-based debate competitions. **UBC Debates** is the separate thin branded implementation in `neophilism/UBC-Debates`. This is independent of the politician-to-politician Debate-Engine product.

## Status

The owner approved **50 engine steps (E01-E50)** and **4 branded implementation steps (U01-U04)** on October 11, 2026. E01 specification, E02 application foundation, and E03 typed domain/revision persistence are merged with verified exact-head and merged-main CI. E04 identity and authorization is in development on draft PR #4; its first policy-evaluator slice does not implement a complete login or database authorization system.

This software is **not ready to run live competitions**. No cloud deployment, live ballot operation, payout, security certification or AI qualification is claimed. All reusable competition logic and interfaces belong in the engine, not the branded repository.

## Documentation

[Approved plan](docs/DEVELOPMENT_PLAN.md) | [Requirements](docs/REQUIREMENTS.md) | [Decisions](docs/DECISIONS.md) | [Architecture](docs/ARCHITECTURE.md) | [Resources](docs/RESOURCES.md) | [Cloud access](docs/CLOUD_ACCESS.md) | [Local development](docs/DEVELOPMENT.md) | [Domain contracts](docs/DOMAIN_CONTRACTS.md) | [E03 evidence](docs/E03_EVIDENCE.md) | [E04 work](docs/E04_IDENTITY.md) | [Progress](repo-development-progress.md) | [Handoff](docs/HANDOFF.md) | [Security](SECURITY.md)

## Local development

With the documented Node.js and Docker prerequisites:

```sh
npm ci --ignore-scripts
npm run setup:local
docker compose up -d --wait
npm run build
npm run migrate
npm run check
npm run dev
```

Local setup creates an ignored private configuration; it never accesses Render or Neon. `/api/health` is liveness and `/api/ready` checks schema compatibility. Neither establishes competition readiness. There is no registration UI or public competition-domain endpoint yet. Domain tables retain default-deny row security until complete E04 runtime policies pass review.

## Invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement and prize obligations are separate records. No single blended popularity/quality score exists. Standard prizes have independent allocations; tournament placement awards use a separate budget.

Event contracts freeze motion, electorate, rules, rubric, timing, prizes and deadlines. Interim distributions stay sealed. Corrections preserve prior revisions. AI remains advisory until a specific configuration passes qualification and oversight. Type definitions and hashes alone do not establish those operational guarantees.

Original source documents, participant information, tax forms, ballots and credentials must not be committed to this public repository. Approval to develop is not proof of prize funds, legal approval, deployment readiness or authorization for new costs.
