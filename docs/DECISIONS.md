# Decision and ambiguity register

The owner approved the implementation plan on 2026-10-11. The choices below are **engineering treatments in that approved plan**, not assertions that the source manual is internally unambiguous. An event must publish its selected policy in an accepted, versioned contract before participation. Legal wording and actual operational approvals remain separate.

| ID | Source tension | Treatment | Production gate |
|---|---|---|---|
| D01 | Working project names | Live Debate Engine; branded UBC Debates; independent of politician debate product | Preserve names and repository boundaries |
| D02 | A pp. 30, 34-35 discusses several missing-voter treatments | Default official calculation uses voters with valid ballots in both polls; aggregate turnout/attrition retained; missing final is not an unchanged opinion | Freeze electorate/attrition policy; verify cohort computation |
| D03 | A p. 30 mixes entire-audience and decided-voter denominators | Include Undecided in both denominators; compare For and Against percentage-point swings | Publish formula; exact arithmetic, no rounded winner decisions |
| D04 | A p. 28 calls ballots anonymous; p. 40 describes internally linkable devices | Identity-separated pseudonymous ballot store; restricted linkage; aggregate-only publication | Accurate privacy notice, least privilege, retention; do not promise cryptographic unlinkability |
| D05 | A p. 14 says usually 30-day payment; p. 39 says typically 60 | Separate 30-day processing target and proposed 60-day contractual deadline | Approved actual terms and event schedule; neither is silently overwritten |
| D06 | A p. 26 suggests 24-hour AI review; p. 40 specifies 48-hour outcome dispute | Separate configurable deadlines and appeal types | Reconcile and publish applicable terms before event |
| D07 | A pp. 9, 15, 30 lists tie alternatives and vague statistical closeness | Exact tie distinct from any preregistered statistical review; proposed split audience share; published advancement tiebreak | Specify judges ties and unresolved tiebreak outcomes; never select a rule after seeing results |
| D08 | A pp. 4, 7 allows experimental polls; p. 33 prohibits interim counts | Standard profile seals all interim distributions; experimental formats separately versioned and disclosed | Tested/approved addendum, not a hidden feature toggle |
| D09 | A pp. 12-13 permits average, sum, majority and optional proportional payout | Freeze aggregation separately from prize-allocation policy; default judges' share winner-take-all | Explicit score scale, panel quorum, ties and weighting |
| D10 | A p. 4 gives per-side suggested timing; team sizes vary | Explicit per-side allocation and speaking-order contract; no automatic per-speaker multiplication | Equal opportunities verified in rehearsal |
| D11 | A pp. 15-17 gives two placement examples | Configurable placement and optional awards; no implicit per-match standard pots | Authorized budget balances exactly |
| D12 | A pp. 18-21 requires delivery evaluation but text is initial input | Preserve rubric; show modality limits; text-only systems cannot claim qualified full delivery assessment | Preregistered evaluation and independent oversight; unqualified modes disabled |
| D13 | B grants involve shared IP; A release claims debate recording ownership | Separate grant/IP and recording-rights concepts | Legal/entity-approved rights configuration, not universal boilerplate |
| D14 | Separate Neon resources supplied for engine and UBC | Never assume shared credentials or permit branded app writes to engine tables; UBC stores only brand-specific data if needed | Verify exact cloud project/branch/environment before any mutation |

Architecture baseline: TypeScript domain/application modules and shared React UI, Node services, PostgreSQL durable state, separate media/transcription/AI workers, adapter-based media/storage/communications/payout providers. Modular application first; separate deployable workers where operational isolation warrants it. These are technical choices, not source-document quotations.

Security baseline: apply the user's End-To-End-Everywhere Security Architecture Standard; document trust boundaries, appropriate encryption, key custody, least privilege and evidence. Media readable by an authorized recorder/transcriber is not private from that processing endpoint.

Legal templates in the source contain placeholders and jurisdiction-dependent provisions. This repository specifies acceptance/versioning and review workflows; it does not approve or restate those provisions as binding legal advice.
