# E06 reusable interface and accessible account workspaces

Status: implementation candidate on PR #8; browser acceptance and final review remain pending. This is not a complete competition application.

## Verified dependency

E05 PR #6 merged at `1751389581fa0e305b92967d2646fa7ed9f92977`. Exact-head CI `38160338358` and merged-main CI `38160444377` passed all five jobs; separate security self-review `5484260096`. The auxiliary roadmap PR #5 and closed duplicate PR #7 are not extra completed engine steps.

## Engine-owned interface

The reusable React application lives in `packages/ui/`, served by the existing Node API using a locally bundled, pinned React 19.3.0 and esbuild 0.28.2 build. No CDN scripts, remote fonts, unsafe HTML insertion or browser bearer-token storage are used. Deployment configuration selects the engine brand or the neutral Forum House and Civic Exchange reference profiles. The same compiled assets support both; they are not UBC implementations or tenant-authorization switches.

Shared components provide native form labels and hints, announced errors/status, semantic tables, explicit text status indicators, native modal focus handling, visible keyboard focus, skip navigation, responsive layout and reduced-motion/forced-color treatment. Navigation focuses the next page heading without removing the initial skip-link keyboard entry. Account/workspace data is cleared on identity changes; background session refresh does not discard an in-progress authenticator setup.

Actual workflows use the existing backend, not mocks: verified-email registration, login, authenticator/recovery challenge, setup and private backup-code display, factor removal, password change/reset, session listing/revocation, authorized event discovery, upload/quarantine/status/download and file-access revocation. Recovery/reset tokens are never written to browser storage. Reset-link query parameters are removed from the current history entry after capture. MFA codes and setup secrets are not sent to third-party QR/image services. The manual setup key is intentionally supported without an external QR dependency.

Competition phases, live timers, judging, casting and event setup are not falsely represented as working controls. Those follow their own approved steps. Account registration alone grants no participation or staff authority.

## Server boundaries

`LDE_UI_ENABLED=1` requires the existing identity/runtime configuration. `LDE_UI_BRAND` accepts only `engine`, `forum-house`, or `civic-exchange`; client query parameters cannot select another tenant or brand. Protected-file controls appear only when the protected storage adapter is configured. No UI/branding input bypasses server access checks.

The server preloads only the two named built assets and serves an explicit page-route allowlist. Requests cannot turn an uploaded filename or arbitrary path into filesystem access. HTML/JSON use no-store and no-referrer; the CSP permits only same-origin scripts/styles/connections with no inline scripts, no arbitrary form actions, and no framing. Camera/microphone/geolocation remain disabled until the separately reviewed media workflow adds its requirements. Public configuration contains branding and feature availability only, not credentials or tenant records.

`GET /api/workspaces` returns only RLS-authorized event names, modes and current capabilities, using a bounded keyset cursor. Staff without current MFA cannot obtain their event records through a prettier UI. `GET /api/tenants/{t}/events/{e}/objects` adds a narrow guard-owned metadata listing with per-row purpose/ownership checks and keyset pagination. It never returns envelopes, plaintext, keys or ciphertext digests. Unknown/unauthorized cursors fail rather than revealing hidden rows. The browser treats capability lists as display information, never as authorization proof.

## Dependencies and verification

The read-only preparation run `38160673069` produced the reviewable candidate lock and dependencies. Exact versions are committed, including React/ReactDOM 19.3.0, esbuild 0.28.2, Playwright 1.64.0, axe-core 4.14.0 and React type declarations 19.3.0. No existing dependency version or TypeScript 5.8.3 compiler gate was changed. The candidate registry audit reported zero known vulnerabilities at preparation time; final exact-head audit remains required. The temporary workflow is removed from the merge tree and cannot count as application acceptance.

Local strict checks and 134 unit/API/contract cases pass; the existing 46 real PostgreSQL 18 cases pass with the added migration. The local Chromium process launches but navigation is blocked by environment browsing policy; that policy was left intact. Actual browser tests therefore run in the isolated hosted CI job against its own loopback PostgreSQL database. Tests exercise real forms, provider email verification and TOTP, role visibility, file quarantine/download/revocation, focus and dialog keyboard behavior, password reset and session revocation, and two-brand portability. They scan with axe and capture only synthetic-data screenshots for visual inspection. No production accounts, database or source documents are used.

Axe success alone is not accessibility certification. Keyboard behavior, screen layout and error paths require review; real assistive-technology/user testing remains a release-quality consideration. Production HTTPS, proxy behavior, mail deliverability, key custody, scanner qualification and cloud resource setup remain explicit release gates.

Primary references: React's official release history; esbuild Getting Started; Playwright Accessibility Testing; upstream pinned release/package metadata. These inform implementation choices, not changes to the supplied debate rules.
