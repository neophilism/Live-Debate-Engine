# Source requirements and traceability

Source A: **United Broadcasting Company Debate Format & Operations Manual.docx**, 42 pages, supplied by the owner. It contains five sections: Format & Operations (pp. 1-8), Scoring & Prize Allocation (pp. 8-17), AI Judge Development & Transition (pp. 17-27), Audience Voting & Outcome Calculation (pp. 27-35), and Legal Terms, Privacy & Release (pp. 35-42).

Source B: **United Broadcasting Company Business Plan.docx**, 18 pages, supplied by the owner. It provides network context, not proof of financing, participants' acceptance, legal compliance, or a project engineering budget. The private originals are not republished in this public repository.

Source C: Owner-approved development plan and naming/resource instructions, 2026-10-11. Architectural choices and resolved engineering defaults are labeled as such in DECISIONS.md. This matrix is a technical extraction, not a replacement legal agreement.

| ID | Source | Requirement | Steps | Verification |
|---|---|---|---|---|
| R01 | A pp. 1-4 | Motion-based For/Against; openings, moderated rebuttal, audience Q&A, closings | E07 E08 E13 E14 E15 | Ordered state/phase tests and operator rehearsal |
| R02 | A pp. 2-4 | Equal time; suggested 7-minute openings/side, 20-30 discussion, 15-20 Q&A, 3-minute closings/side; announced variations | E07 E14 | Allocation, warning, pause, recovery and amendment tests |
| R03 | A pp. 4-7 | Distinct moderator/debater/timekeeper/judge/audience powers; floor recognition, relevance, civility, points of order; no new closing arguments | E04 E09 E14 E15 E19 E30 | Permission matrix, incident and ruling workflows; human enforcement where judgment is needed |
| R04 | A pp. 5-8 | Flexible team sizes, preapproved visual aids, evolving formats and communicated addenda | E07 E09 E10 E15 E17 | Rosters, rights/readiness and frozen-contract tests |
| R05 | A pp. 8-10 | Independent persuasion/quality verdicts; weighted rubric 30/20/20/10/10/10 | E03 E24 E25 E26 | Distinct result schemas and exact rubric arithmetic |
| R06 | A pp. 10-12 | Contextual fallacies, virtues, independent judging, aggregation and feedback | E18 E24 E25 E39 E40 | Evidence-linked adjustments, no double counting, panel completion |
| R07 | A pp. 13-14; 39-40 | Announced standard pool, 50/50 verdict allocations, equal/unanimously agreed team splits, eligibility, documentation, deadlines, forfeiture, no competitor entry fee | E10 E27 E30 E31 | Balanced ledger, holds, retry/reconciliation and competing deadlines tests |
| R08 | A pp. 14-17 | Eight teams/seven matches, audience-first advancement, published ties, placement pool and optional awards, summary reporting | E28 E29 E30 E33 | Full bracket, upstream dispute freeze and both $100k example allocations |
| R09 | A pp. 17-21 | AI assistance to hybrid to full judging; audience independent; transparency, fallback and oversight qualification | E38 E40 E41 E42 E43 E48 E49 E50 | Mode eligibility/certification, failures, disclosures and field evidence |
| R10 | A pp. 21-26 | Audio/transcript primary inputs, speaker/time/phase context, corrections, model evaluation and bias audits | E17 E18 E38 E39 E40 E42 | Transcript versions, permissions, uncertainty, provenance and held-out evaluation |
| R11 | A pp. 21; 26-27 | Fact-checking optional; coaching, audience AI and AI moderation are future possibilities, not mandatory launch functions | E39 E41 E43 | Separately labeled capability flags; no hidden judging or live competitor coaching |
| R12 | A pp. 27-30 | Identical motion, pre/post ballots, For/Against/Undecided, swing not majority, secrecy, no analysis before final poll | E20 E21 E22 E26 | Golden calculations, phase guards and sealed results |
| R13 | A pp. 30-34 | Published ties and electorate policy, attendance attrition, channel treatment, independent honest voting | E07 E12 E21 E22 E23 | Paired population/turnout tests, no fabricated final votes |
| R14 | A pp. 31-33 | Audience familiarity/conflict screening, tickets, instructions and secret individual voting | E10 E12 E19 E20 | Eligibility audit distinct from ballots; accessible admission/voting |
| R15 | A pp. 33-35 | No interim counts, duplicate prevention, fallback devices/paper, two-person verification, audit and inconclusive outcomes | E20 E21 E23 E26 E30 | Leakage/replay/reconciliation and distinct verifier identities |
| R16 | A pp. 35-38 | Age/credentials/conflicts/employee restrictions, recording and likeness rights, ownership, fees, third-party rights and legal clauses | E09 E10 E11 E17 E34 | Approval/version/jurisdiction and rights-based readiness gates; no automatic enforceability claim |
| R17 | A pp. 38-40 | Conduct, prohibited outside assistance, voting integrity, embargo, disqualification and written disputes | E15 E16 E19 E30 E31 E33 | Coaching separation, embargo security, deadlines and correction audit |
| R18 | A pp. 40-42 | Limited private data, permitted uses/disclosures, retention/deletion, legal/financial exceptions, audience recording and signature | E05 E10 E12 E30 E31 E33 E34 E46 | Data inventories, access/export/deletion and legal-hold tests |
| R19 | B pp. 2-8 | Cinematic production, captions, remote/vendor production, streaming, licensing/distribution and access context | E11 E16 E17 E18 E33 E34 E35 | Recorded rehearsal, caption/rights export and entitlement tests |
| R20 | B pp. 4-6; A p. 36 | Network IP-sharing grants differ from debate recording rights; commercial supporters do not control judging | E10 E34 E35 | Distinct rights models and commercial/competition permissions |
| R21 | C | Engine owns reusable UI and business logic; UBC is thin; separate from politician engine | E01 E03 E06 E36 E37 E47 U01 U02 | Two-neutral-brand full workflow and no branded-domain duplication |
| R22 | C | Verified resources, security, reproducible CI, progress/handoff and Engine Room registration | E01 E02 E04 E05 E37 E44 E45 E46 U03 U04 | Exact-head/main checks, isolation, recovery, source-health evidence |

Public results may show aggregate persuasion and quality results, but receipt or audit surfaces must not leak individual votes or protected identities. The proposed pseudonymous design does not promise unlinkability against privileged operators. No source claim that cheating is impossible, AI is unbiased, or legal compliance is automatic is an engineering acceptance result.
