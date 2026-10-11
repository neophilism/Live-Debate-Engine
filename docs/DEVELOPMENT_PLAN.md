# Live Debate Engine - approved development plan

Approved by the product owner on 2026-10-11. The original working names Debate Competition Engine and UBC Debate Platform are replaced by **Live Debate Engine** and **UBC Debates**. Scope and dependency order are otherwise preserved.

E identifiers belong to `neophilism/Live-Debate-Engine`; U identifiers belong to `neophilism/UBC-Debates`. There are 50 engine steps and 4 branded steps. IDs are not GitHub PR numbers. Actual PR mappings live in `docs/pr-map.json` and must be based on observed GitHub records.

Every change requires implementation or specification artifacts appropriate to its scope, tests, documentation, acceptance evidence, and a separate security-review step. Required CI must pass on the exact proposed head; GitHub must confirm mergeability. Verify merged-main checks before chaining dependent work. A self-performed security review is not an independent review and cannot satisfy a required independent-review rule. Never weaken a required gate to merge.

Each scope below includes its user interface, domain/API behavior, authorization, failure paths, tests and operator documentation where applicable. A passing PR is not production verification. Integration credentials, contractual approvals, real events, and AI qualification remain explicit external gates. No recurring scheduler or paid resource is authorized merely by approving this plan.

## E01 - Source-of-truth specification and decision register
Depends: none
Scope: Capture requirements, source-to-feature traceability, terminology, decisions, ambiguity register, architecture, project-specific progress and handoff. Keep this product independent from the existing politician-debate engine.
Gate: Every substantive format, scoring, voting, AI and legal-operations requirement maps to an implementation step and verification method. Unresolved policy choices are visible.

## E02 - Repository, development environment, and CI
Depends: E01
Scope: Workspace packages, local environment, database migration tooling, fixtures, type checking, lint, unit/integration infrastructure, builds, dependency and secret checks, artifact generation.
Gate: A clean checkout starts the documented development environment and runs all required checks. No real participant records or credentials are committed.

## E03 - Domain model and immutable contracts
Depends: E02
Scope: Tenants, series, motions, events, teams, assignments, rulesets, sessions, ballots, scorecards, verdicts, tournament matches, obligations and disputes; version IDs, exact money, idempotency and domain events.
Gate: Contracts distinguish audience verdict, judges' verdict, advancement and payment entitlement. Money never uses floating-point currency arithmetic.

## E04 - Identity, tenant isolation, and permissions
Depends: E03
Scope: Authentication, staff MFA, tenant membership, event roles, service identities and revocation; separate organizer, producer, moderator, timekeeper, debater, judge, audience, finance and oversight powers.
Gate: Cross-tenant and cross-role access fails across APIs, realtime, jobs, storage and the database. A moderator cannot inspect sealed ballots.

## E05 - Security primitives and sensitive-data separation
Depends: E04
Scope: Secret/key lifecycle, protected storage, upload quarantine, signed assets, audit events and sensitive-log filtering; separate identity, ballots, unpublished judging, financial documentation and media.
Gate: Exercise privilege escalation, malicious uploads, leaked links, log exposure, credential compromise, key rotation and revocation; report tested boundaries, not blanket certification.

## E06 - Reusable interfaces and accessibility foundation
Depends: E04, E05
Scope: Shared application shell, navigation, forms, tables, notices, design tokens and role workspaces; keyboard access and non-color-only timing cues.
Gate: Two neutral brands use the same components without UBC-specific code. Registration and administrative flows pass automated accessibility and manual keyboard checks.

## E07 - Versioned rulesets and event competition contracts
Depends: E03, E06
Scope: Ruleset editing, validation, UBC-format profile, speaking allocation, electorate, voting, aggregation, ties, prizes and deadlines. Freeze accepted contracts and manage addenda.
Gate: Registration cannot open with missing material rules. Post-acceptance changes require recorded amendments and required reacknowledgments.

## E08 - Series, motions, and event administration
Depends: E07
Scope: Series/seasons, motion drafts and review, descriptions, categories, venue, broadcast mode and publication state; preserve exact motion wording throughout the event.
Gate: An organizer creates an event without code edits. Published-motion changes invoke amendments, not silent ballot substitution.

## E09 - Casting, teams, rosters, and judge assignments
Depends: E04, E08
Scope: Applications, invitations, profiles, credentials, team formation, speaker order, substitutes, availability and conflicts; individual and multi-speaker sides.
Gate: Ineligible/conflicted assignments are blocked or explicitly reviewed. Roster changes propagate to releases, turns, scorecards and prize recipients.

## E10 - Eligibility, releases, and legal-document acceptance
Depends: E07, E09
Scope: Versioned terms, recording releases, acceptance evidence, age and employee/family restrictions, material-rights declarations and embargoes. Junior events require a separate gated profile.
Gate: Readiness identifies missing/outdated agreements. Templates record jurisdiction and approval status; engineering approval does not establish legal enforceability.

## E11 - Scheduling, production preparation, and communications
Depends: E08, E09, E10
Scope: Timezones, availability conflicts, crew, rehearsal, production checklists, call sheets, reminders and operational messages; appearance fees/logistics separate from prizes.
Gate: Schedule changes notify appropriate recipients without duplicates. Operational messages remain separate from optional marketing consent.

## E12 - Audience recruitment, registration, and admission
Depends: E07, E10, E11
Scope: Familiarity questionnaires, invitations, tickets, waitlists, check-in, voting eligibility and attendance credentials; separate spectators/voters and physical/remote cohorts.
Gate: Watching, paying, or using multiple devices cannot multiply voting rights. Eligibility reviews do not expose ballot choices.

## E13 - Authoritative event state machine
Depends: E07, E11, E12
Scope: Preparation, readiness, pre-vote, openings, discussion, Q&A, closings, post-vote, verification, announcement and closure; interruption, pause, cancellation and recovery.
Gate: Invalid transitions fail server-side. Openings require the required pre-poll closure; analysis cannot precede the official post-poll.

## E14 - Timers, floor control, and points of order
Depends: E13
Scope: Authoritative clocks, allocations, recognition, speaking requests, warnings, grace periods, points of order and rulings; actual speaking-time accounting.
Gate: Reconnects and competing commands cannot reset time or create conflicting floor grants. Manual timing changes record actor and reason.

## E15 - Moderator, timekeeper, producer, and debater consoles
Depends: E06, E14
Scope: Moderator scripts/questions, timekeeper controls, production readiness/cues, debater notes and approved materials.
Gate: A rehearsal runs through the interfaces. Competitors cannot access private judge assistance or prohibited live backstage coaching.

## E16 - Remote participation and media-room controls
Depends: E05, E13, E15
Scope: Green rooms, devices, admission, camera/microphone control, diagnostics, permissions and remote participants; explicitly handle delayed viewer streams.
Gate: Removal revokes access. Reconnection restores only authorized capabilities. Viewing load does not traverse the competition-control API.

## E17 - Recording and broadcast production
Depends: E16
Scope: Recording, clean/program outputs where supported, reusable overlays, lower thirds, timers, visual aids, destination adapters and recording-health monitoring.
Gate: Produce a playable correctly labeled rehearsal recording. Sealed ballots and unpublished judging cannot appear in overlays.

## E18 - Transcription, speaker attribution, and corrections
Depends: E14, E17
Scope: Timestamped, side/speaker/turn/phase-aligned transcripts, human correction, uncertainty markers, version history and original-media references.
Gate: Preserve prior versions. Material corrections invalidate affected analyses/evaluations rather than leaving them attached to changed evidence.

## E19 - Audience Q&A and conduct controls
Depends: E12, E14, E15, E16
Scope: Submissions, screening, duplicate grouping, motion relevance, selection, directed responses and follow-ups; reporting and voting-time chat restrictions.
Gate: Only approved questions reach the live queue/broadcast. Moderator sees response opportunities and timing; unreviewed content is not auto-published.

## E20 - Secret-ballot service
Depends: E05, E07, E12
Scope: Event-scoped credentials, identity-separated ballot storage, one accepted ballot per voter/poll, protected tally access and choice-free acceptance receipts.
Gate: Duplicates/replays cannot inflate counts. Logs, analytics, receipts and ordinary admin screens expose neither individual choices nor pre-vote distributions.

## E21 - Poll orchestration and electorate locking
Depends: E13, E20
Scope: Opening/closing windows, server deadlines, motion consistency, instructions, attendance, remote-delay and late-arrival policies.
Gate: Reject late/unauthorized ballots consistently. Do not enlarge the electorate or extend a cohort window after observing results.

## E22 - Deterministic outcome calculation
Depends: E07, E20, E21
Scope: Exact percentage-swing comparison, selected denominator/paired cohort, undecided votes, turnout, separate/combined channels and inconclusive verdicts.
Gate: Fixtures cover minority-final-share victories, ties, negative swings, missing ballots and rounding boundaries. Display rounding never decides a winner.

## E23 - Paper/keypad fallback and reconciliation
Depends: E12, E20, E21, E22
Scope: Device replacement, backup imports, controlled manual entry, duplicate reconciliation, discrepancies and supporting evidence.
Gate: Method changes cannot count someone twice. Two staff reconcile without overwriting electronic records; unresolved integrity failures can yield inconclusive results.

## E24 - Human judging workspace
Depends: E09, E15, E18
Scope: Judge seats, private notes, criterion scorecards, transcript-linked observations, draft/final submissions, recusals, replacements and panel completion.
Gate: Independent submissions under the selected protocol; sealed audience results and other judges' scores remain inaccessible until authorized release.

## E25 - Rubric, penalties, virtues, and aggregation
Depends: E07, E24
Scope: Weighted scales, contextual fallacy deductions, virtues, evidence, bounds and panel aggregation; distinguish explicit adjustments from category scores.
Gate: Prevent double penalties and unspecified bonuses. Each adjustment has a rule/evidence basis; absent judges cannot silently change aggregation.

## E26 - Result verification, certification, and announcement
Depends: E22, E23, E24, E25
Scope: Separate verdicts and advancement, provisional/verified states, two distinct staff verifiers, scripts, graphics and publication/embargo control.
Gate: Reproduce results from frozen inputs. Verification is not public release, including prerecorded events.

## E27 - Standard-debate prize ledger
Depends: E07, E09, E10, E26
Scope: Funded budgets, independent 50% allocations, ties, both-verdict victories, equal or unanimously agreed team splits; fees/expenses separate.
Gate: Allocate exactly the authorized pool including minor-unit rounding. Revisions do not silently replace approved obligations.

## E28 - Tournament brackets and advancement
Depends: E08, E13, E26
Scope: Eight-team bracket, match dependencies, scheduling, propagation, audience-first advancement and published tiebreaks.
Gate: Complete all seven matches. Upstream disputes freeze affected downstream actions without rewriting a match already underway.

## E29 - Tournament placement prizes and special awards
Depends: E27, E28
Scope: Placement schedules, semifinal/champion/runner-up awards, individual recognitions and tournament reservations.
Gate: Represent both documented $100,000 examples; do not also award standalone match pots unless explicitly configured and funded.

## E30 - Disputes, sanctions, disqualification, and corrections
Depends: E10, E18, E26, E27, E28, E29
Scope: Reports, preserved evidence, deadlines, oversight review, sanctions, holds, forfeiture and versioned corrections; separate procedural, scoring, counting and eligibility workflows.
Gate: Preserve and explain replaced decisions. No unrestricted overwrite-style administrator override.

## E31 - Payee onboarding and payout execution
Depends: E27, E29, E30
Scope: Restricted payee data, documentation, deadlines/reminders, authorization, provider adapters, verified manual payments, failures and reconciliation.
Gate: Sandbox retries cannot duplicate payment. Disputed/incomplete claims stay held; tax/bank data stays outside public/production profiles. UBC competitors pay no entry fee.

## E32 - Complete human-operated competition acceptance suite
Depends: E13, E14, E15, E16, E17, E18, E19, E20, E21, E22, E23, E24, E25, E26, E27, E28, E29, E30, E31
Scope: End-to-end registration, releases, preparation, live phases, voting, human judging, verification, allocations, appeal and settlement.
Gate: Run a standard debate and full tournament through real interfaces/APIs with media interruptions, replacement voting devices and conflicting verdicts, not only mocked happy paths.

## E33 - Public event experience and searchable archive
Depends: E06, E17, E18, E26, E30
Scope: Discovery, profiles, schedules, live viewing, recordings/captions, transcript search, chapters, results and permitted feedback.
Gate: Embargoed/restricted content cannot leak through search, thumbnails, feeds, caches or direct links. Corrections preserve publication history.

## E34 - Editorial publishing and distribution packages
Depends: E10, E17, E18, E33
Scope: Clips, editorial review, rights metadata, captions, windows, promotional assets and broadcaster exports.
Gate: Clips retain source provenance; required rights/clearance gate publishing. Delivery retries do not duplicate releases.

## E35 - Access entitlements, memberships, tickets, and supporters
Depends: E12, E31, E33
Scope: Paid-viewing, membership/subscription, admission, donation and supporter adapters; separate commercial status from editorial/competition authority.
Gate: Purchasing cannot buy votes or influence. Payment retries and expiry preserve historical competition records.

## E36 - Full white-label configuration
Depends: E06, E10, E33, E34, E35
Scope: Domains, themes, logos, email identity, legal entity, rulesets, language resources, provider credentials and deployment settings.
Gate: Two simultaneous brands run complete competitions without data, asset, credential or unpublished-content leakage and without engine forks.

## E37 - Public API, SDK, webhooks, and Engine Room integration
Depends: E26, E27, E28, E29, E30, E31, E32, E33, E34, E35, E36
Scope: Versioned API, typed clients, embeds, signed replay-protected webhooks, documentation and verified Engine Room contracts.
Gate: External clients use documented authorized interfaces. Validate webhook destinations/idempotency; do not export sensitive ballots or notes by default. Manifest publication alone is not confirmed dashboard ingestion.

## E38 - Rights-cleared evaluation data and annotation
Depends: E10, E18, E24, E25
Scope: Dataset manifests, permitted uses, annotations, expert labels, rubric examples and separated training/development/held-out splits.
Gate: Detect leakage. Audience victory is not a quality-judging ground-truth label; distinguish AI-assisted from independent human reference scores.

## E39 - Argument analysis, fallacy detection, and virtue recognition
Depends: E18, E38
Scope: Claims, support, rebuttals, contextual fallacy candidates, steel-manning, concessions, responsiveness and transcript evidence.
Gate: Findings cite real spans and express uncertainty. Test sarcasm, quotation, valid criticism, superficial politeness and spoken prompt injection; optional fact-checking remains separately labeled.

## E40 - AI scorecards and reproducible evaluation artifacts
Depends: E25, E39
Scope: Same configured rubric, structured scores, model/prompt/input/ruleset versions, concise evidence-based explanations and deterministic application arithmetic.
Gate: Malformed/unsupported outputs fail closed. Reproduce official outcomes from saved artifacts, not an assumed-identical fresh model call.

## E41 - AI-assisted human judging
Depends: E24, E39, E40
Scope: Private suggestions, acceptance/rejection, preliminary analysis, latency/cost limits and shadow scores separate from official human scorecards.
Gate: AI cannot alter official outcomes or coach competitors live. Provider outages leave human judging usable.

## E42 - Evaluation laboratory and oversight certification
Depends: E38, E39, E40, E41
Scope: Held-out evaluations, agreement/deviation, fallacy precision/recall, virtues, consistency, counterfactual bias, transcription sensitivity, adversarial cases and oversight records.
Gate: Preregister thresholds/sample sizes and report uncertainty. The source's example 90% agreement is a candidate benchmark, not a qualification claim.

## E43 - Hybrid and fully AI-judged execution modes
Depends: E26, E30, E40, E41, E42
Scope: Equal-weight judge seats, approved ensembles, disclosures, certification checks, fallback panels and suspension.
Gate: Uncertified models cannot officially judge. No silent model/weight substitution on failure. Supported modalities must justify assessed delivery characteristics.

## E44 - Load, fault, security, and recovery qualification
Depends: E32, E36, E37, E43
Scope: Concurrent events, voting bursts, interrupted media, database failover, replay, malicious integrations, isolation attacks and restored backups.
Gate: Publish measured limits. Proposed benchmark: 10 concurrent debates with 1,000 official voters each, including simultaneous bursts. No silent loss of acknowledged votes or duplicate payouts.

## E45 - Production infrastructure and deployment
Depends: E05, E17, E31, E37, E44
Scope: Reproducible staging/production, separate DBs/keys, storage, workers, media, migration/deployment/rollback procedures and verified endpoints on authorized resources.
Gate: Fresh deployment and migration/recovery tests pass. Missing access, credentials or spending authorization remain explicit blockers, not substituted infrastructure.

## E46 - Operational readiness and release evidence
Depends: E44, E45
Scope: Monitoring, alerts, cost controls, incidents, operator training, fallback packs, security findings, dependency inventories and deployment evidence.
Gate: Rehearse interruption, reconciliation, correction and payout failure. Report tested capabilities, external dependencies, limitations and disabled AI modes accurately.

## E47 - Engine V1 release and portability proof
Depends: E01, E02, E03, E04, E05, E06, E07, E08, E09, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21, E22, E23, E24, E25, E26, E27, E28, E29, E30, E31, E32, E33, E34, E35, E36, E37, E38, E39, E40, E41, E42, E43, E44, E45, E46
Scope: Versioned engine, reusable UI packages, SDK, manifests, upgrade guidance, reference applications and evidence.
Gate: Two neutral brands run full competitions using the same released engine. Identify actually qualified judging modes; unavailable official AI remains disabled.

## U01 - UBC repository and branded shell
Depends: E47
Scope: Separate UBC Debates repository using released engine packages, approved branding/copy, domains, legal entity and chosen UBC profile.
Gate: No independent voting arithmetic, judging, prize, advancement or live-state implementation exists in the branded repository.

## U02 - UBC service integrations and complete branded journeys
Depends: U01, E35, E36, E37
Scope: UBC identity, entitlements, communications, media destinations and navigation; assemble participant/operational interfaces from engine components.
Gate: Branded rehearsal follows engine workflows. Reusable gaps are fixed upstream rather than duplicated in UBC.

## U03 - UBC production deployment and launch configuration
Depends: U02, E45, E46
Scope: Deploy UBC; verified integrations, approved event information, domains/email/media, rights/privacy and finance configuration.
Gate: Verify real workflows beyond the homepage. Do not present proposed funding, invited people or unapproved legal details as confirmed.

## U04 - Controlled UBC pilot and operational handoff
Depends: U03
Scope: Controlled human-judged event with permitted AI shadow analysis, operator handoffs, accessibility/production/reliability feedback.
Gate: Reconcile ballots, scorecards, verdicts, obligations, recordings and incidents. Return reusable fixes to engine PRs.

## E48 - Field validation and model qualification
Depends: U04, E42, E43
Scope: Rights-cleared real-debate evaluation, disagreement investigation, topic/speech validation and published evidence/model manifests.
Gate: Oversight approves a specific scope/configuration. Failed thresholds trigger remediation or continued advisory use, not post-hoc relaxed standards.

## E49 - Controlled official hybrid-judging rollout
Depends: E48
Scope: Approved AI seat in disclosed selected events with monitoring, bounded rollout, fallback and review.
Gate: Live behavior meets qualification conditions. Audience verdict, judges' prize allocation and advancement policies remain distinct and unchanged without an explicit amendment.

## E50 - Fully AI-judged mode qualification and rollout
Depends: E49
Scope: Qualify and activate predominantly/fully AI judging with approved ensembles, oversight, fallback, appeals and reassessment.
Gate: Evidence supports scope/modalities; model/rule changes require controlled requalification. Suspending AI authority preserves records and operations.

# Reference acceptance scenarios

1. Pre 40 For / 50 Against / 10 Undecided; post 45 / 47 / 8: For wins audience swing despite lower final support.
2. Standard $18,000, opposing audience/judge winners, two people each: $9,000 per side and $4,500 per person; both verdicts to one side: that side receives the full pool.
3. Tournament placement 50,000 / 30,000 / 10,000 / 10,000: exactly $100,000 with no implicit match pots.
4. Replay a ballot submission: count once. Missing final ballot: apply the published policy, never invent a choice.
5. Request sealed information from a producer account: deny unless a specific audited procedure permits access.
6. AI emits fabricated citations or payment instructions: reject; model has no payout authority.
7. Correct a published result: retain original and separately record bracket and financial consequences.
8. Rebrand: same engine and full workflow, no UBC identity leakage.

# Completion definitions

Engine V1 means another organization can operate the documented lifecycle without writing competition software. UBC completion means the branded production workflows and operational fallbacks are verified. AI transition completion separately requires empirical qualification and oversight; functioning endpoints or demos are insufficient.
