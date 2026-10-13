# E08 administration foundation

This increment establishes the typed boundary for series, seasons, motion drafts, exact motion revisions, event venue/broadcast configuration and publication state.

## Invariants

- A series belongs to one tenant and uses valid inclusive calendar bounds.
- A motion starts as a draft. Draft edits require the exact expected revision.
- An event references one exact published motion revision in the same tenant and series.
- Ordinary editing cannot change published motion wording.
- A published change is one explicit amendment that atomically advances the motion and event references while retaining the old and replacement wording, reason, actor and time.
- Publication is not registration, ballot, production, funding or competition readiness.

## Current boundary

The pure domain layer and unit regressions are implemented first so later persistence, credential-bound API and shared organizer UI have one fail-closed contract. E08 remains incomplete until the database history, authorized operations, reusable UI, integration/browser coverage, documentation and separate exact-head review are merged and verified.
