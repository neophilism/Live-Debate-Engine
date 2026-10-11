# E06 reusable interface

Status: in development, not accepted. E05 PR #6 merged at 1751389581fa0e305b92967d2646fa7ed9f92977; exact-head CI 38160338358 and merged-main CI 38160444377 passed all five jobs, with separate security self-review 5484260096.

Scope: engine-owned React application shell and reusable accessible components; actual account registration/login/MFA/session/recovery and protected-file workflows over existing authenticated APIs; role-aware workspaces; two neutral reference brands without a UBC implementation or fork. No unimplemented competition controls should look operational.

The temporary read-only workflow prepares explicitly pinned UI dependencies and a reviewable lockfile because the local environment cannot reach the package registry. It contains no deployment credentials, cannot push changes, and is not acceptance evidence. Remove it and commit the reviewed lock before final exact-head CI. Preserve all strict type checks, dependency audit and PostgreSQL jobs.

Acceptance requires real browser flows, automated accessibility scans plus keyboard/visual inspection, endpoint authorization/asset-serving negative tests, two-brand portability and separate exact-head security review. No production deployment or completed competition application is claimed.
