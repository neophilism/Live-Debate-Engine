# E04 identity and authorization

PR #4 merged at fc40637f2c0af08e7b31e43b1570207922b0e1b7 after exact-head CI 38151000137 and separate security self-review 5483835591. Merged-main CI 38151234814 passed all five jobs. E01-E04 are merged; UBC Debates is untouched.

## Implemented boundaries

The Node API mounts a real, pinned Better Auth 1.7.7 email/password and TOTP provider. The installed provider generated migration 0004; schema parity is tested with its own migration inspector. Registration requires verified email and grants no tenant membership or operational role. Sessions are HttpOnly, SameSite=Lax, host-only cookies; production requires HTTPS. JSON responses do not expose the provider session secret. Cookie caching and account linking are disabled. Browser-origin checks, bounded JSON bodies, request timeouts, account lockouts and database-backed rate limits apply.

MFA enrollment does not grant staff authority. Successful authenticator verification records proof for the specific live session and current principal epoch. A remembered-device flag is rejected. Ordinary staff proof expires after eight hours; sensitive approval proof expires after fifteen minutes. These are versioned engineering defaults, not claims that the source manual chooses these intervals. Recovery codes are single-use recovery evidence, not privileged MFA: they revoke other sessions and require authenticator re-enrollment or verification before staff operations. Password reset revokes all sessions. Password change requires fresh MFA when enrolled and revokes other sessions even when a client requests otherwise. Disabling/recovering factors clears old assurance.

The database verifies a live provider session secret or a hashed, short-lived service credential. It never trusts an asserted user ID, role or tenant in a connection setting. Transaction-local credential context is cleared on commit/rollback and revalidated for each row-security statement. Principal status, session expiry, membership, exact event scope, ownership and revocation are enforced in PostgreSQL. Application and SQL action registries are parity-tested.

`lde_identity` and `lde_runtime` are separate non-owner database roles. The identity role cannot read competition revisions; the runtime role cannot read raw identity sessions or stamp MFA proof. A non-login guard owns narrowly granted security-definer functions with fixed search paths. The runtime refuses owner, bypass, role-administration, mixed-purpose or guard-member credentials at startup. Release/operator credentials are not loaded into the serving process.

Human roles cannot implicitly decrypt ballots, execute payouts or impersonate worker profiles. A tally worker cannot approve results or payments; a payout worker cannot approve its own payment. Credentials are event-scoped, downscoped, hashed at rest, expire within 24 hours and can be revoked. The shared broker supports fresh authorization for later worker/realtime/object adapters. Those later systems are not claimed to exist yet.

Generic domain writes remain disabled. Subsequent feature PRs must add narrow tested mutations rather than exposing `appendSnapshot` as a generic authenticated public API. Access to an operation is separate from poll eligibility, phase, funding, dual-verifier and other competition workflow gates.

## Modules

- `packages/identity/src/provider.ts`: actual provider configuration and completed-challenge hooks.
- `config.ts`, `http.ts`: canonical origins, protected browser/session routes and startup integration.
- `broker.ts`: non-owner-role verification and credential-bound transactional authorization.
- `administration.ts`: explicitly privileged, audited operator provisioning/revocation, never an HTTP handler.
- `mail.ts`: private loopback-development message files or a fixed HTTPS Resend transport; no arbitrary destination URL or redirect.
- `database/migrations/0004-0006`: provider schema, identity/role/service records, row policies and preserved administrative audit.

## Development and operator setup

See DEVELOPMENT.md. The local setup generates distinct private runtime and migration files. A local-only provisioning command creates the two non-owner login roles after migrations. Auth mail is written to an ignored mode-0700 directory with mode-0600 opaque filenames; no token is printed in logs. Production requires a configured sending account/from address; none has been provisioned or tested live.

The `access:admin` command accepts a JSON request file using an explicit operator database connection. It does not turn an organizer role into a database administrator. Membership changes, role grants/revocations, principal disablement and service issuance/revocation record the operator database identity and reason. Human operational roles require a verified active human. Service secrets are written once to a newly created private output file, not stdout or command arguments. Keep the operator credential outside the application environment.

## Executed verification

Local test environment: actual PostgreSQL 18 binaries from the official `postgres:18` image, bound only to loopback, with disposable `lde_ci` data; no Neon production database was used. The unchanged destructive-test target guards still reject non-loopback databases and other database names.

The authored suite passes 118 unit/API/contract cases and 36 PostgreSQL integration cases, including real HTTP signup, email verification, authenticator enrollment/challenge, own-scorecard access, unrelated-tenant denial, spoofed connection identity, pool-context reuse, membership changes during a transaction, session revocation, worker scope/revocation, rate limits, MFA lockout, recovery, password changes/reset, operator auditing and the real server launcher. These counts are a local snapshot, not final remote acceptance evidence. Hosted Node 22/24 and PostgreSQL 17/18 CI must pass the final committed source.

TypeScript remains pinned to 5.8.3 with strict checks and `skipLibCheck:false`. The provider's two-factor subpath avoids importing unrelated plugin declarations. Its optional `bun:sqlite` declaration reference is satisfied by the pinned official Bun SQLite declaration only; global Bun declarations are not loaded into the Node application. The reviewed lockfile fixes all installed versions. Temporary dependency/test-runtime artifact workflows are removed before acceptance.

## Explicit limitations and later gates

No competition UI, live voting, production deployment, object encryption service or AI qualification is asserted by E04. The current API and identity modules share a process but use separate database pools and permissions; this is not isolation against compromise of that entire process. Database owners remain trusted administrators able to alter schema; append-only triggers are not protection against an owner.

Email delivery is dispatched through tracked provider background tasks and drained during orderly shutdown, avoiding awaiting external mail latency in the public handler. It is not a durable delivery queue; a process crash can require a verification/reset resend. E11 adds durable operational communications. Live mail deliverability, configured trusted-proxy behavior/rate limits, cloud least-privilege roles, recoverable backups, and real HTTPS/provider checks remain release gates. The transport deliberately does not trust arbitrary forwarded-IP headers; reverse-proxy deployment requires an explicit reviewed ingress policy.

Remote Neon metadata access is verified, not application SQL/role deployment. Never run this integration harness on the supplied production branches. Resend support is an adapter, not a created account or authorization to spend.

## Primary references

- Better Auth tagged source and two-factor APIs: https://github.com/better-auth/better-auth/tree/v1.7.7 and https://better-auth.com/docs/plugins/2fa
- Email/password session and recovery behavior: https://better-auth.com/docs/authentication/email-password
- Neon identity selection and managed MFA limitation: https://github.com/neondatabase/agent-skills/blob/main/skills/neon-auth/SKILL.md
- Resend email idempotency: https://resend.com/changelog/idempotency-keys
- PostgreSQL row security: https://www.postgresql.org/docs/18/ddl-rowsecurity.html

The upstream End-To-End-Everywhere standard remains the architecture basis, not a claimed production certificate. No required independent review is substituted by a self-review.
