# E04 identity and authorization work

Status: in development; E04 is not accepted or ready to merge. E03 is merged with passing exact-head and merged-main checks; see E03_EVIDENCE.md.

## Implemented first slice

`packages/contracts/src/access.ts` is a strict, deny-by-default policy evaluator with explicit tenant/event grants, human/service separation, own-record checks, revocation/expiry checks, principal epochs, session-bound staff MFA and sensitive-action freshness. It rejects extra fields and malformed trusted records. Tests cover role isolation, tenant/event boundaries, inactive records, MFA freshness, ownership, and service downscoping.

This is a **preflight policy evaluator**, not an identity provider, bearer credential, database policy or public authorization endpoint. Identity, memberships, grants, resource ownership and current time must come from trusted server-side records. Never evaluate arbitrary JSON supplied by an HTTP client and treat an allowed result as authentication. The result is not serializable authority; every operation must re-check current revocation and access inside its transaction.

Ordinary organization administrators do not gain ballot access, another judge's private scorecard, finance powers, or result certification. Service profiles are explicit and narrow: transcription append, tally processing, or payout execution. A payout worker cannot approve payment. Permission for a ballot request does not establish ticket eligibility, poll state or an entitlement to vote; those independent gates belong to their approved workflow steps. Results still require two distinct authorized humans under E26.

Engineering policy version `lde-access-v1` uses an eight-hour maximum age for staff MFA and a fifteen-minute maximum for sensitive approvals. These are explicit engineering defaults to be carried into a versioned deployment profile, not parameters an end-user can disable. A new MFA enrollment flag does not upgrade old sessions. The provider integration must issue verifiable evidence for the current session after a completed challenge, and account recovery must increment the principal epoch/revoke sessions.

## Identity provider selection and unresolved implementation gates

There is no existing identity provider to preserve. An authenticated Neon read on 2026-10-11 confirmed Neon Auth is not enabled on the supplied engine production branch. No provisioning was performed.

Neon's current auth skill identifies Managed Better Auth as the default for new apps, but lists managed MFA as a limitation and directs required-MFA applications to a self-managed Better Auth implementation. Staff MFA is an approved E04 requirement and will not be dropped. Better Auth v1.7.7 was the latest non-prerelease observed in the upstream repository on 2026-10-11. Its documented two-factor flow is the candidate implementation; no package installation or provider configuration is claimed in this first slice. Confirm the installed version and end-to-end behavior before enabling it.

Primary references consulted:
- https://github.com/neondatabase/agent-skills/blob/main/skills/neon-auth/SKILL.md
- https://github.com/better-auth/better-auth/releases/tag/v1.7.7
- https://better-auth.com/docs/plugins/2fa
- https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- https://github.com/neophilism/End-To-End-Everywhere-Security-Architecture-Standard

The hosted Neon docs tool did not resolve the plugin-guide slug during verification; do not present that failed fetch as an independent confirmation of managed plugin behavior. The security standard's current development branch explicitly says it is not a frozen production certification basis. Downstream implementation must record versions and actual conformance evidence, not assert certification from a dependency or checklist.

## Remaining E04 gates (must not be marked complete from these unit tests)

1. Implement provider-backed signup/signin/signout, verification/recovery, completed MFA challenge, revocation, session rotation and secure browser handling using a reviewed pinned dependency and lockfile.
2. Persist principal identity mappings, memberships, role/service grants, session assurance and revocation under separate least-privilege ownership. Public claims must not self-assign roles, tenants, assurance or service profiles.
3. Bind transaction-local database access to verified server identity; enforce row-level policies on non-owner/non-bypass roles, with pooled-connection reuse and denial tests. Session context alone is not proof of identity against a compromised privileged connection.
4. Wire authenticated API middleware, centralized guards for object/realtime/job access and current-scope checks; preserve default-deny until each surface is implemented. Do not expose internal generic snapshot methods as a public write API.
5. Exercise real provider-library MFA and session flows, database policies and HTTP negative cases in CI. Explicitly distinguish local/provider-library tests from a configured live deployment.
6. Complete a separate exact-head security review, all required checks and normal GitHub mergeability. Update progress with observed evidence only.

No production branch, cloud credentials or existing Debate-Engine service has been changed. UBC Debates remains separately dependency-gated.
