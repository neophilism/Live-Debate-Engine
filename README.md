# Live Debate Engine

A white-label operating platform for structured, motion-based debate competitions. **UBC Debates** is the separate thin branded implementation in `neophilism/UBC-Debates`. This is independent of the politician-to-politician Debate-Engine product.

## Status

The approved roadmap contains 50 engine steps and four later UBC steps. E01-E05 are merged with verified exact-head and merged-main CI. E06 is in development with the reusable account/workspace interface, real protected-file workflows, and two neutral reference brands. See progress and actual PR records for acceptance, not just this snapshot.

This is not yet a live competition platform. The engine remains separate from the politician-debate product and owns all reusable competition functionality; UBC Debates is not being implemented in parallel.

## Documentation

[Approved plan](docs/DEVELOPMENT_PLAN.md) | [Requirements](docs/REQUIREMENTS.md) | [Decisions](docs/DECISIONS.md) | [Architecture](docs/ARCHITECTURE.md) | [Resources](docs/RESOURCES.md) | [Cloud access](docs/CLOUD_ACCESS.md) | [Local development](docs/DEVELOPMENT.md) | [Domain contracts](docs/DOMAIN_CONTRACTS.md) | [E03 evidence](docs/E03_EVIDENCE.md) | [E04 work](docs/E04_IDENTITY.md) | [Protected storage](docs/E05_PROTECTED_STORAGE.md) | [Reusable interface](docs/E06_INTERFACE.md) | [Progress](repo-development-progress.md) | [Handoff](docs/HANDOFF.md) | [Security](SECURITY.md)

## Local development

With the documented Node.js and Docker prerequisites:

```sh
npm ci --ignore-scripts
npm run setup:local
docker compose --env-file .env.migrations up -d --wait
npm run build
npm run migrate
npm run provision:local
npm run check
npm run dev
```

Local setup creates an ignored private configuration; it never accesses Render or Neon. `/api/health` is liveness and `/api/ready` checks schema compatibility. Neither establishes competition readiness. The configured identity API supports verified-email signup, login, MFA and revocation. The E06 interface can be enabled with LDE_UI_ENABLED=1 and the configured identity service; live competition-domain workflows remain later steps. Narrow read policies enforce identity, tenant/event scope and ownership; generic domain writes remain disabled.

## Invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement and prize obligations are separate records. No single blended popularity/quality score exists. Standard prizes have independent allocations; tournament placement awards use a separate budget.

Event contracts freeze motion, electorate, rules, rubric, timing, prizes and deadlines. Interim distributions stay sealed. Corrections preserve prior revisions. AI remains advisory until a specific configuration passes qualification and oversight. Type definitions and hashes alone do not establish those operational guarantees.

Original source documents, participant information, tax forms, ballots and credentials must not be committed to this public repository. Approval to develop is not proof of prize funds, legal approval, deployment readiness or authorization for new costs.
