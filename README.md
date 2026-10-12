# Live Debate Engine

White-label operating software for structured, motion-based debate competitions. All reusable competition logic, services and interfaces belong here. UBC Debates is a later thin branded consumer, and the politician-to-politician Debate-Engine project is separate.

## Status

The owner approved 50 engine steps (E01-E50) and four separate UBC steps (U01-U04). E01-E06 are merged with verified head/main checks. E07 implements versioned rulesets and individually acknowledged material contracts in PR #10; check [progress](repo-development-progress.md) and the actual PR for its acceptance state.

This is not ready to run live competitions. No production deployment, live ballot operation, available prize funding, security certification or AI qualification is claimed. UBC Debates remains untouched until its engine dependency is ready.

## Documentation

[Approved plan](docs/DEVELOPMENT_PLAN.md) | [Requirements](docs/REQUIREMENTS.md) | [Decisions](docs/DECISIONS.md) | [Architecture](docs/ARCHITECTURE.md) | [Resources](docs/RESOURCES.md) | [Cloud access](docs/CLOUD_ACCESS.md) | [Development](docs/DEVELOPMENT.md) | [Identity](docs/E04_IDENTITY.md) | [Protected storage](docs/E05_PROTECTED_STORAGE.md) | [Browser interface](docs/E06_UI.md) | [Material contracts](docs/E07_MATERIAL_CONTRACTS.md) | [Handoff](docs/HANDOFF.md) | [Security](SECURITY.md)

## Local development

Use the documented Node.js and Docker prerequisites. Local setup creates private ignored configuration, not cloud resources.

```sh
npm ci --ignore-scripts
npm run setup:local
docker compose up -d --wait
npm run build
npm run migrate
npm run provision:local
npm run check
npm run dev
```

Read [development](docs/DEVELOPMENT.md) for the separate migration/identity/runtime roles, local email delivery and configuration. Open the local server to use the browser interface. `LDE_UI_BRAND=harbor` (default) or `cedar` selects one of two neutral reference brands. `LDE_UI_ENABLED=0` runs the API without the UI. The brand does not select an organization or grant permissions.

The browser offers real registration, email verification, sign-in, authenticator/recovery flows, password reset/change, session management and assigned workspaces. Users without assignments see an empty workspace state, not fabricated events. Authorized organizers can edit/publish rulesets and prepare/offer event contracts; each assigned speaker reviews and acknowledges their exact immutable version. Amendments require new personal acknowledgments. Discover these workflows from assigned workspaces, or use `/rulesets?tenant=<id>` and `/contract?tenant=<id>&event=<id>`. Other competition controls arrive in their approved steps. `/api/health` is liveness and `/api/ready` checks schema compatibility; both retain competitionReady:false.

`npm run test:browser` uses the real backend and Chromium against a disposable local database named lde_ci; see the UI documentation before running this destructive test harness. Production mail, HTTPS, ingress and deployment qualification remain separate gates.

## Invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement and prize obligations are distinct. Standard prizes have separate audience/judging allocations; tournament placement awards use a separate budget. Accepted event contracts freeze motion, electorate, timing, rubric and prizes; corrections preserve history. Interim distributions remain sealed. AI authority requires independent empirical qualification and oversight.

Never commit original private source documents, participant data, ballots, tax forms or credentials to this public repository. Development approval is not legal approval, proof of funds, deployment readiness or authorization for new costs.

## End-to-End Everywhere progress

The canonical [security/e2eesa-status.json](security/e2eesa-status.json) records standard implementation, complete testing and independent expert review separately. Engine Room reads it automatically from GitHub. All initial stages are pending; existing profile locks and approved decisions remain authoritative. Read [adoption and independent-account instructions](docs/E2EESA_ADOPTION.md), and run `python3 scripts/validate_e2eesa_status.py`. Record validation does not establish product security or certification.
