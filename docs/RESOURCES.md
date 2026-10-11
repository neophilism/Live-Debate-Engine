# Project resources

Supplied by the owner on 2026-10-11. These identifiers are resource references, not credentials or proof of application readiness. Authenticated Render and Neon reads now work; see [the scoped verification record](CLOUD_ACCESS.md).

| Product | GitHub | Render project | Neon project | Neon branch |
|---|---|---|---|---|
| Live Debate Engine | neophilism/Live-Debate-Engine | prj-db5jt4l9fdbs73d4tgug | winter-pond-37009599 | br-lucky-darkness-b57vnrxb |
| UBC Debates | neophilism/UBC-Debates | prj-db5jtaqd0e5s73fo0qkg | hidden-tree-79062557 | br-muddy-glade-b5oyws99 |

Engine Render: https://dashboard.render.com/project/prj-db5jt4l9fdbs73d4tgug

Engine Neon: https://console.neon.tech/app/projects/winter-pond-37009599/branches/br-lucky-darkness-b57vnrxb

UBC Render: https://dashboard.render.com/project/prj-db5jtaqd0e5s73fo0qkg

UBC Neon: https://console.neon.tech/app/projects/hidden-tree-79062557/branches/br-muddy-glade-b5oyws99

## Access and operational gates

Both exact Neon project/branch pairs were verified with authenticated reads; both branches are named production and use PostgreSQL 18. The engine's provider display name is Live Debate Platform; no rename was performed. Render workspace/service inventory is accessible, but the available connector cannot read project containers or verify assignment to the supplied project IDs. No listed Render service uses these new repositories. The existing Debate-Engine service is unrelated and untouched.

No cloud schema, credentials, services or configuration were changed. Follow CLOUD_ACCESS.md before future mutations. Do not treat dashboard links as API credentials or a connection as authorization for additional costs. Keep production branches separate from development validation.

The repositories are public. Private source documents, participant records, tax forms and secrets remain outside them. Network-wide financial projections are neither engineering budgets nor authorization to spend.

## Engine Room

The existing `neophilism/Engine-Room` integration reads approved `.exechub/project.yml` manifests and real PR records. This engine has 50 approved steps. UBC has four separate steps; U steps must not inflate the engine count. E48 depends on U04, so V1 release is not completed AI promotion.

Manifest format was checked against Engine Room's `.exechub/project.yml` and `docs/live-project-integration.md`. PR mappings must come from observed GitHub records. Manifest preparation is not verified ingestion, current service health or credentialed telemetry.
