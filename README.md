# Live Debate Engine

A white-label operating platform for structured, motion-based debate competitions. **UBC Debates** is the separate thin branded implementation in `neophilism/UBC-Debates`. This is not the politician-to-politician debate product. All reusable competition rules, services, workflows and user interfaces belong here.

## Status

The owner approved **50 engine steps (E01-E50)** and **4 branded steps (U01-U04)** on October 11, 2026. E01 is merged. E02 introduces a typed application foundation; consult [progress](repo-development-progress.md) and actual GitHub checks for its current acceptance state. The foundation is **not ready to run live competitions** and no cloud deployment or AI qualification is claimed.

## Documentation

[Approved plan](docs/DEVELOPMENT_PLAN.md) | [Requirements](docs/REQUIREMENTS.md) | [Decisions](docs/DECISIONS.md) | [Architecture](docs/ARCHITECTURE.md) | [Resources](docs/RESOURCES.md) | [Cloud access](docs/CLOUD_ACCESS.md) | [Local development](docs/DEVELOPMENT.md) | [Handoff](docs/HANDOFF.md) | [Security](SECURITY.md)

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

The setup command creates an ignored, private local configuration with a random password; it never accesses Render or Neon. GET `/api/health` is liveness. GET `/api/ready` checks the migration schema. Both deliberately avoid implying competition readiness. No UI, registration or competition endpoint exists yet.

## Product invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement and prize obligations are separate records. There is no single blended popularity/quality score. Standard prizes have independent audience and judging allocations; tournament placement awards use a separate budget.

Event contracts freeze motion, electorate, rules, rubric, timing, prize schedule and deadlines. No interim vote distributions are published. Corrections preserve prior records. AI stays advisory until a specific configuration passes qualification and oversight gates.

Original source DOCX files, credentials, tax forms, ballots and private business-plan material must never be committed to this public repository. Approval to develop is not evidence of available prize funding, legal approval, production readiness or permission for new costs.
