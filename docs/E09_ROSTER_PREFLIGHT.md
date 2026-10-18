# E-09 roster preflight increment

A pure roster validator checks stable identities, supported competition roles,
single-role exclusivity, and team/judge separation before submission. It
does not create or authorize users and does not persist assignments.

E-09 remains incomplete: authenticated tenant membership, durable assignment
revisions, scheduling/conflict constraints, judge independence, casting UI,
real PostgreSQL tests, accessibility and browser acceptance remain pending.
Never authorize assignments based on caller-controlled role claims.


## Draft persistence continuation

The E09 branch now adds a `RosterStore`, a draft-only HTTP adapter, and additive
migration `0012_casting_review_drafts.sql`. The already-merged E08 migration0011
is retained byte-for-byte to preserve the sequential migration history. No
applied migration is edited. `lde_casting` has separate immutable review, draft
and command-receipt tables, forced row security, private helper functions, no
raw runtime/identity table access, and three fixed credential-bound operations.
Database-role startup checks now include this namespace.

A reviewer must have current tenant-organizer and event-management permission
with fresh staff MFA. Candidates must be active human members of the same tenant;
reviewing oneself is denied. Reviews record actor, reason, explicit eligibility,
availability/conflict decisions, bounded expiry and optimistic revision. Draft
saving locks/rechecks membership and current review decisions, requires two
separate verified team identities and a judge, enforces single-role identity,
consecutive speaking positions and explicit team-member ownership links, and
binds the exact review revisions. Event/command locks and immutable receipts
handle concurrent revisions and unchanged retries without duplicating a draft.
The workspace exposes bounded review pagination and the last immutable draft.

**These are roster drafts, not live assignments.** Saving them changes no role
grant, resource owner, contract, release, live turn, scorecard or prize recipient.
The explicit `operational:false` result is required by the store. Historical
receipts and drafts may outlive a membership/review; they never establish current
eligibility or permission. Finalization must recheck all current prerequisites.
The HTTP adapter validates fixed routes, current identity, same-origin POST,
bounded JSON, query/cursor shape and nondisclosing no-store errors, but it is
intentionally not mounted in the application until the organizer workflow is
integrated. No deployment or production roster feature is claimed.

Remaining acceptance: integrate the latest main application wiring, invitation
and application intake, profiles/credentials, organizer review/casting interface,
substitutions and schedule/availability workflows, explicit conflict review,
finalization with live revalidation, and transactional propagation to releases,
turns, scorecards and prize recipients. Real browser/accessibility acceptance and
live-role separation remain required. Keep PR19 draft until those are complete.

Local preflight/parser tests pass. The new PostgreSQL suite covers real review
replay, stale revisions, candidate membership/scope denial, self-review denial,
missing/unresolved review rejection, immutable history, fixed function grants,
and no implicit judge-role grant. Exact pinned type/lint/build and real database
results must be observed from CI at the committed SHA; local transpilation is
not a full typecheck or PostgreSQL acceptance. No new credentials, paid resources,
schedules or real participant data are introduced.
