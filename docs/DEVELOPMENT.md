# Local development and CI

## Scope

E02 is the reproducible application foundation, not a working competition. It exposes liveness and schema readiness only. E04 adds an actual identity API; voting, judging, payments, the reusable UI and AI remain later steps. Node 24 LTS is the preferred runtime; Node 22 is also tested. The TypeScript compiler is deliberately pinned to 5.8.3 for initial compatibility; dependency audit is a separate gate, not a claim that pinned software is permanently secure.

## Clean checkout

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

`setup:local` creates ignored mode-0600 `.env` and `.env.migrations` files with distinct random credentials; it refuses to overwrite either. The runtime file holds only non-owner application/identity roles. The release/operator file holds the owner credential and Docker password. `provision:local` accepts only the fixed loopback `lde_dev` setup, creates non-owner logins after migrations, and verifies their role separation. PostgreSQL is bound to localhost:55432, not a public network interface. `compose.yaml` uses the PostgreSQL 17 maintained image; record its actual digest in deployment evidence before production. Docker is a local development dependency, not a cloud creation step. Stop local services with `docker compose --env-file .env.migrations down`; do not add `-v` unless deliberately discarding local data.

`npm run dev` builds once and starts the API; rerun it after source changes. `npm start` starts the already built service. This foundation has no UI and no worker that pretends to process events. UI and domain workflows arrive in their approved steps.

GET `/api/health` proves process liveness and returns a validated release SHA when available. GET `/api/ready` checks exact migration compatibility and returns 503 if unavailable. Neither endpoint claims that competitions or production operations are ready.

## Database migrations

Migrations live in `database/migrations/NNNN_name.sql`, have SHA-256 checksums and sequential versions, and execute inside a transaction with a transaction-scoped advisory lock. Edited/unknown applied history is refused. Failed DDL and history inserts roll back atomically; no automatic destructive down migration exists. Use a reviewed forward fix or an explicitly authorized restore for production recovery.

Run migrations as a release operation using a distinct migration role and unpooled URL. E04 verifies non-owner identity/runtime roles and applies transaction-bound row security. The owner/release connection is separate and must not enter the serving process. Existing installations retain their private files: do not auto-overwrite them to match the new setup. Never use a UBC database/credential to run engine migrations.

Remote connections enforce verified TLS. URL TLS overrides and extra connection options are rejected. Local plaintext requires explicit opt-in and is refused for remote hosts and in production. Do not put database URLs in public logs or CI variables tied to real systems.

## CI and artifacts

`CI` validates plan, strict TypeScript, Biome lint, migration manifest, unit/API tests, real PostgreSQL integration, dependency audit, and Gitleaks history scanning. The integration suite refuses to run unless NODE_ENV=test and TEST_DATABASE_URL targets a local database named lde_ci. A missing database is a failure, not a skipped success.

Application jobs use `npm ci` and the committed lockfile. During initial lock bootstrap only, a read-only job may generate and upload a candidate lock, but explicitly fails until it is reviewed and committed; it cannot qualify a merge. No job pushes source or holds production secrets.

Artifacts contain the package, tracked source archive, CycloneDX dependency inventory, exact source SHA and lock hash. No private `.env`, source DOCX or live data is included. GitHub CI is the execution evidence when the local environment cannot install dependencies or run PostgreSQL.

## Technical references

- Node release status: https://nodejs.org/en/about/previous-releases
- PostgreSQL transaction-scoped advisory locking: https://www.postgresql.org/docs/17/explicit-locking.html
- Driver TLS configuration and URL caveats: https://node-postgres.com/features/ssl

Provider project configuration, migration role grants, service deployment, backups/restores and user-facing production behavior remain unverified. See CLOUD_ACCESS.md for verified metadata access and exact remaining provider limitations.

## Identity and operator interfaces

Set LDE_IDENTITY_ENABLED=1, the canonical origin, high-entropy secret, separate identity/runtime URLs and mail mode. Local mail appears only in `.lde-mail/*.json`; treat every verification/reset link as a secret. E06 supplies browser forms. Production mail requires a configured verified Resend sender/key; no account is created automatically. The API uses session cookies, not client-provided principal/grant JSON. See E04_IDENTITY.md for routes and trust boundaries.

The following operator commands use `.env.migrations`, never the application role:

```sh
npm run access:admin -- membership membership-request.json
npm run access:admin -- role role-request.json
npm run access:admin -- principal principal-request.json
npm run access:admin -- issue-service service-request.json /private/new-credential.json
npm run access:admin -- revoke-service revoke-request.json
```

Membership request: principalId, tenantId, status (active/suspended/revoked), expiresAt (canonical UTC or null), reason (10-500 characters). Role request: principalId, tenantId, eventId (null only for a tenant organizer), role, expiresAt, revoked (yes/no), reason. Principal request: principalId, status (active/disabled), reason; changing it revokes sessions/credentials. Service request: principalId (new or existing service UUID), tenantId, eventId, profile, actions, expiresAt (within 24 hours), reason. Revoke request: credentialId, reason. Target tenants/events must already exist. Authorization to administer the database is not inferred from a web role; provisioning must be explicit and audited.

An operator export path must be new and private. Credential output is never printed. The release stage must establish approved operators, rotate keys, verify mail delivery and test reverse-proxy rate limiting. No deployment or compliance certification follows from a successful local login.
