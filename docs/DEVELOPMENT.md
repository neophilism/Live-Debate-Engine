# Local development and CI

## Scope

E02 is the reproducible application foundation, not a working competition. It exposes liveness and schema readiness only. No registration, voting, judging, payments or AI exists yet. Node 24 LTS is the preferred runtime; Node 22 is also tested. The TypeScript compiler is deliberately pinned to 5.8.3 for initial compatibility; dependency audit is a separate gate, not a claim that pinned software is permanently secure.

## Clean checkout

```sh
npm ci --ignore-scripts
npm run setup:local
docker compose up -d --wait
npm run build
npm run migrate
npm run check
npm run dev
```

`setup:local` creates an ignored `.env` with a random password and mode 0600; it refuses to overwrite existing configuration. PostgreSQL is bound to localhost:55432, not a public network interface. `compose.yaml` uses the PostgreSQL 17 maintained image; record its actual digest in deployment evidence before production. Docker is a local development dependency, not a cloud creation step. Stop local services with `docker compose down`; do not add `-v` unless deliberately discarding local data.

`npm run dev` builds once and starts the API; rerun it after source changes. `npm start` starts the already built service. This foundation has no UI and no worker that pretends to process events. UI and domain workflows arrive in their approved steps.

GET `/api/health` proves process liveness and returns a validated release SHA when available. GET `/api/ready` checks exact migration compatibility and returns 503 if unavailable. Neither endpoint claims that competitions or production operations are ready.

## Database migrations

Migrations live in `database/migrations/NNNN_name.sql`, have SHA-256 checksums and sequential versions, and execute inside a transaction with a transaction-scoped advisory lock. Edited/unknown applied history is refused. Failed DDL and history inserts roll back atomically; no automatic destructive down migration exists. Use a reviewed forward fix or an explicitly authorized restore for production recovery.

Run migrations as a release operation using a distinct migration role and unpooled URL. The E02 local database owner is not a production runtime-role design; E04 supplies actual tenant authorization/role enforcement before domain access is exposed. Never use a UBC database/credential to run engine migrations.

Remote connections enforce verified TLS. URL TLS overrides and extra connection options are rejected. Local plaintext requires explicit opt-in and is refused for remote hosts and in production. Do not put database URLs in public logs or CI variables tied to real systems.

## CI and artifacts

`CI` validates plan, strict TypeScript, Biome lint, migration manifest, unit/API tests, real PostgreSQL integration, dependency audit, and Gitleaks history scanning. The integration suite refuses to run unless NODE_ENV=test and TEST_DATABASE_URL targets a local database named lde_ci. A missing database is a failure, not a skipped success.

Application jobs use `npm ci` and the committed lockfile. During initial lock bootstrap only, a read-only job may generate and upload a candidate lock, but explicitly fails until it is reviewed and committed; it cannot qualify a merge. No job pushes source or holds production secrets.

Artifacts contain the package, tracked source archive, CycloneDX dependency inventory, exact source SHA and lock hash. No private `.env`, source DOCX or live data is included. GitHub CI is the execution evidence when the local environment cannot install dependencies or run PostgreSQL.

## Technical references

- Node release status: https://nodejs.org/en/about/previous-releases
- PostgreSQL transaction-scoped advisory locking: https://www.postgresql.org/docs/17/explicit-locking.html
- Driver TLS configuration and URL caveats: https://node-postgres.com/features/ssl

Provider project configuration, migration role grants, service deployment, backups/restores and user-facing production behavior remain unverified. See CLOUD_ACCESS.md for installed-plugin versus action-availability status.
