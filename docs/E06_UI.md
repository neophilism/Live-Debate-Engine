# E06 reusable interfaces and accessibility

## Scope and status

E06 is implemented as a candidate in PR #9, after E04 PR #4 and E05 PR #6. E05 reviewed-head CI 38160338358, merged-main CI 38160444377 and separate security self-review 5484260096 were verified. The starting main revision 86d3601c264d5c9256f6a8483784ef0a27c827f4 passed CI 38161332759; its downloaded source matched tree 01ef40bedca65bc986944748e354e6db902eefd5.

This step adds the actual browser interface, not competition operations. Two neutral reference brands, Harbor Forum and Cedar Assembly, use the same shared components, routes, authentication flows and server interfaces. UBC Debates and the separate politician-debate repository remain untouched. The brand setting is presentation only, never a tenant selector.

## Reusable interface

The private workspace package `@live-debate-engine/ui` exports source components, branding and CSS for the engine build. Its shell, navigation, labeled fields, focusable feedback, buttons, panels, semantic tables, status badges and textual timer display are reusable. Distribution packaging and external versioned consumer delivery remain E47; this step does not claim a published npm release.

Pages: welcome, registration, sign-in, verification-email resend, password reset, account overview, security and session management, assigned workspaces and per-workspace permissions. A clearly labeled component-reference page demonstrates non-live visual states. Navigation reflects actual sign-in state; own workspace discovery comes from current server-side assignments. Event controls not yet implemented in later steps are not presented as working buttons.

Registration, email verification, password sign-in, authenticator enrollment/challenge, recovery-code sign-in, password reset/change, authenticator disablement, sign-out and session revocation call E04's real Better Auth/guarded endpoints. The secret seed and recovery codes exist only in volatile component state and are cleared by hiding, verified enrollment or navigation. Reset tokens are removed from the address bar and are not persisted in web storage. Forms disable repeated submits while pending, provide inline errors/success, clear successful inputs and move keyboard focus to feedback. The server remains responsible for validation and authority.

`LDE_UI_ENABLED` defaults to `1`; set `0` for a headless API process. `LDE_UI_BRAND` selects `harbor` or `cedar`; unknown values fail startup. After `npm run build`, the Node service serves fixed HTML/JS/CSS paths. There is no caller-selected filesystem path, remote script, inline JavaScript, source-map route or exposed server bundle. The CSP prohibits framing, inline/eval script and off-origin connections. All interface/config responses use no-store and no-referrer.

## Access boundary

Migration 0008 adds `lde_security.my_workspaces()`, a fixed-search-path security-definer function owned by the existing guarded role. Only the runtime role can execute it. It takes no user/role/tenant parameter, derives the live human actor from the credential-bound transaction, and returns only active memberships and grants with currently authorized capabilities. Current revocation, grant expiry and MFA state remain authoritative. It exposes no other users, private event names, ballots, scorecards or financial data.

Changing query parameters, a presentation brand, or browser component state grants nothing. A user without assigned workspaces receives a true empty state; a failed request receives an explicit unavailable state. Role visibility is not authorization, and capabilities here do not bypass later ballot eligibility, publication, two-person verification, financial or workflow gates.

## Verification actually executed locally

Strict TypeScript 5.8.3, Biome lint, build, plan and migration checks passed. The unchanged compiler strictness and previous tests are retained.

- 133 unit/API/contract cases passed.
- 46 real PostgreSQL 18 integration cases passed, including the existing identity and protected-storage flows.
- 11 Node browser-test records (one parent and ten scenarios) passed using real Chromium, PostgreSQL, separate non-owner DB pools and the actual Better Auth library.

Browser cases cover both brands at desktop and 360-pixel widths, keyboard skip/form/focus behavior, failed form input, actual email verification/sign-in, own-role discovery, authenticator setup/challenge, revoked memberships, request failures, session revocation, fresh sign-in MFA, password-reset revocation and the absence of sensitive web storage. Full-page axe checks apply WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags without rule exclusions. Screenshots of non-secret pages were inspected visually for both brands, narrow layouts and a judge workspace.

These checks are not a human screen-reader audit, universal disability-access certification, a production email test or a cloud deployment. Final exact-head CI, separate self-review, normal mergeability and merged-main checks must be observed in PR #9 before acceptance is claimed.

Run `npm run test:browser` only with `NODE_ENV=test` and `TEST_DATABASE_URL` pointing to a disposable loopback database named `lde_ci`. Like the existing integration harness, it deliberately resets its test schemas and refuses remote/production targets. Install the pinned Chromium runtime using `npx --no-install playwright install chromium`. The CI job installs the required system dependencies and uses its own PostgreSQL 18 service. Browser artifacts contain no password, token, authenticator seed, recovery-code, session or email screenshots; tracing is not enabled.

## Supply chain and environment

Exact React 19.3.0, React DOM 19.3.0, esbuild 0.25.12, Playwright 1.64.0 and axe Playwright 4.13.0 dependencies were resolved in the authenticated read-only preparation run 38164476136. Artifact SHA-256 was checked before local use. The committed candidate lock retains the previous production dependency versions and TypeScript 5.8.3; the added UI workspace was resolved offline. Dependency audit remains a required hosted check rather than an assertion that pinned versions stay secure forever.

The temporary preparation workflow is removed from the final candidate. Normal CI remains read-only and adds a browser/accessibility job without removing Node 22/24, PostgreSQL 17/18, secret scanning or dependency audit. The source tree contains no downloaded binaries, node_modules, credentials or private source documents.

No Render/Neon resources, production schemas, email account, domain, key store or paid services were modified. Live mail, trusted ingress/HTTPS, broader browser/screen-reader testing, media controls and production operational qualification remain their documented release gates.
