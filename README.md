# Live Debate Engine

A white-label operating platform for structured, motion-based debate competitions. **UBC Debates** is the separate thin branded implementation in `neophilism/UBC-Debates`. This is not the politician-to-politician debate product. All reusable competition rules, services, workflows and user interfaces belong here.

## Status

The owner approved **50 engine steps (E01-E50)** and **4 branded steps (U01-U04)** on October 11, 2026. E01 specification and E02 application foundation are merged with verified CI. E03 adds internal typed domain contracts and revision persistence; consult [progress](repo-development-progress.md) and its actual PR for acceptance state. This is **not ready to run live competitions**. No cloud deployment or AI qualification is claimed.

## Documentation

[Approved plan](docs/DEVELOPMENT_PLAN.md) | [Requirements](docs/REQUIREMENTS.md) | [Decisions](docs/DECISIONS.md) | [Architecture](docs/ARCHITECTURE.md) | [Resources](docs/RESOURCES.md) | [Cloud access](docs/CLOUD_ACCESS.md) | [Local development](docs/DEVELOPMENT.md) | [Domain contracts](docs/DOMAIN_CONTRACTS.md) | [Handoff](docs/HANDOFF.md) | [Security](SECURITY.md)

## Local development

Use Node 24 (Node 22 is also tested) and Docker for local PostgreSQL:

```sh
npm ci --ignore-scripts
npm run setup:local
docker compose up -d --wait
npm run build
npm run migrate
npm run check
npm run dev
```

Local setup creates an ignored private configuration with a random password; it never accesses Render or Neon. GET `/api/health` is liveness; `/api/ready` checks schema compatibility. Neither implies competition readiness. There is no UI, registration or public domain endpoint yet. E03 tables remain default-deny until E04 implements runtime identity and authorization policies.

## Invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement and prize obligations are separate records. No single blended popularity/quality score exists. Standard prizes have independent allocations; tournament placement awards use a separate budget.

Event contracts freeze motion, electorate, rules, rubric, timing, prizes and deadlines. Interim vote distributions stay sealed. Corrections preserve prior revisions. AI remains advisory until a specific configuration passes qualification and oversight. Type definitions and hashes alone establish none of those operational approvals.

Original source DOCX files, credentials, tax forms, ballots and private business-plan material must never be committed to this public repository. Approval to develop is not proof of funds, legal approval, readiness or authorization for new costs.
