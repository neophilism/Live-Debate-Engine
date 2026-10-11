# Security boundaries and reporting

This is pre-release software. No security certification or production approval is claimed. Do not use it for live ballots, personal data or funds until the relevant acceptance gates pass.

Use GitHub private vulnerability reporting if enabled; otherwise contact the repository owner privately. Never post credentials, raw ballots, private judge notes or participant financial information in a public issue. Private-reporting enablement has not been verified.

## Threat model carried through the roadmap

| Threat | Required control | Verification step |
|---|---|---|
| Cross-tenant access through API, pool, job, storage or realtime channel | Deny-by-default authorization, least-privilege DB roles, row policies and transaction context | E04 E05 E44 |
| Pre-vote/score leakage, identity correlation | Sealed outcomes, segregated identity/ballot permissions, filtered telemetry and publication gates | E20 E24 E26 E33 |
| Replay, bots, multiple devices, attrition manipulation | Scoped credentials, unique constraints, fixed electorate/poll windows, exact/reconciled counts | E12 E20 E21 E22 E23 |
| Competing operators, lost acknowledgments | Versioned commands, transactional persistence, idempotency, recovery drills | E13 E14 E44 |
| Duplicate/unauthorized payout | Separate obligations/authorization, holds, bounded retries and reconciliation | E27 E30 E31 |
| Malicious upload/link/webhook | Quarantine, size/type validation, destination restrictions, signatures and replay defenses | E05 E17 E37 |
| Model prompt injection or fabricated evidence | Treat transcripts/model output as data, validate citations/schema, no model authority, qualification gates | E39 E40 E42 E43 |
| Privileged overwrite or false certification | Preserved revisions, two distinct event verifiers, audited access and evidence-based qualification | E26 E30 E42 E46 |
| Build compromise | Minimal CI permissions, pinned actions, lockfiles when dependencies arrive, no secrets in PR jobs | E01 E02 E44 |

Encryption descriptions must identify endpoints and key custodians. Server-readable recordings/transcripts are not private from that server. Pseudonymous ballots are not mathematically unlinkable ballots. Do not claim safety from test counts alone.

A separate self-review is recorded on each PR at an exact head SHA. It cannot impersonate an independent reviewer or bypass repository protections. No workflow should run pull_request_target against untrusted changes or receive production credentials during untrusted PR execution.
