# Cloud access verification

## Observed 2026-10-11 after the owner connected Render and Neon

Both provider connectors now expose callable actions and authenticated reads succeeded. Earlier notes that provider actions were unavailable are superseded by this record. No reconnection or pasted credentials are needed.

| Target | Authenticated observation | Remaining verification |
|---|---|---|
| Live Debate Engine Neon | Project `winter-pond-37009599`, ADMIN permission, AWS `us-east-2`, PostgreSQL 18. Exact branch `br-lucky-darkness-b57vnrxb` exists, is named `production`, is ready and is the default branch. Provider display name is still `Live Debate Platform`; the project ID, not its label, establishes the mapping. | No application SQL, migrations, schema inventory, credentials, end-to-end connectivity or production acceptance tested on this branch. |
| UBC Debates Neon | Project `hidden-tree-79062557`, ADMIN permission, AWS `us-east-2`, PostgreSQL 18. Exact branch `br-muddy-glade-b5oyws99` exists, is named `production`, is ready and is the default branch. | No application SQL, migrations, schema inventory, credentials, end-to-end connectivity or production acceptance tested on this branch. |
| Render | Authenticated workspace and service inventory reads succeeded in `tea-db23jkks728c73av263g`. No listed service uses either new repository. | Current connector actions do not expose project-container reads or project/environment assignment. The supplied `prj-db5jt4l9fdbs73d4tgug` and `prj-db5jtaqd0e5s73fo0qkg` remain owner-supplied targets, not independently verified project membership. |

The listed `public-debate-engine-preview` service uses `neophilism/Debate-Engine`, the unrelated politician-debate product. It was not modified or reused. No Render service, Neon branch, schema, key, secret, identity provider, or production setting was changed in this verification.

## Development safeguards

Both supplied Neon branches are production branches. Use local/CI disposable databases or a separately authorized isolated development branch for migration testing; do not run the destructive loopback-only integration harness against Neon. Existing CI validates PostgreSQL 17; E03 adds PostgreSQL 18 compatibility to match the authenticated provider record, without weakening the existing job.

Provider access is not a deployment or readiness claim. Do not create a service outside the exact intended project/environment just because workspace-level creation is available. Do not infer spending permission from an account connection, and do not expose connection strings or other secrets in the public repository. UBC remains a separate, dependency-gated branded repository.
