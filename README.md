# Live Debate Engine

A white-label operating platform for structured, motion-based debate competitions. **UBC Debates** is the separate thin branded implementation in `neophilism/UBC-Debates`.

This is not the politician-to-politician debate product. All reusable competition rules, services, workflows, and user interfaces belong in this engine.

## Development status

The owner approved the **50 engine steps (E01-E50)** and **4 branded implementation steps (U01-U04)** on October 11, 2026. Approval is authorization to develop, not evidence of implemented functionality, available prize funding, legal approval, infrastructure readiness, or AI qualification.

The repository currently contains specification and verification infrastructure. See [progress](repo-development-progress.md) for the latest checked state. There is no production-ready debate application yet.

## Start here

- [Complete approved development plan](docs/DEVELOPMENT_PLAN.md)
- [Source requirements and traceability](docs/REQUIREMENTS.md)
- [Policy decisions and unresolved approvals](docs/DECISIONS.md)
- [Architecture and repository boundaries](docs/ARCHITECTURE.md)
- [Authorized resource mapping](docs/RESOURCES.md)
- [Handoff](docs/HANDOFF.md) and [security boundaries](SECURITY.md)

## Invariants

Audience persuasion verdict, judges' quality verdict, tournament advancement, and prize obligations are separate records. There is no single blended popularity/quality score. Standard prizes have independent audience and judging allocations; tournament placement awards are a separate budget.

Event contracts freeze the motion, electorate, rules, rubric, timing, prize schedule, and deadlines. No interim vote distributions are published. Corrections preserve prior records. AI remains advisory unless a specific configuration passes explicit qualification and oversight gates.

## Specification checks

With Node.js 22 or 24:

```sh
node scripts/check-plan.mjs
node --test tests/plan.test.mjs
```

The E01 checks validate roadmap structure and source coverage; they do not test an application. Application tooling and CI expansion are E02. No source DOCX files, credentials, tax forms, ballots, or private business-plan material should be committed here.
