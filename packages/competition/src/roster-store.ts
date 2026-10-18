import type { Pool } from 'pg';
import { withCredential } from '../../identity/src/broker.js';
import { array, boolean, enumeration, identifier, integer, nullable, object, text, timestamp } from '../../contracts/src/validation.js';
export const reviewCandidateInput = object({ commandId: identifier('command'), expectedRevision: integer(0, 999), data: object({
  eligible: boolean, available: boolean, conflictClear: boolean, expiresAt: timestamp, reason: text(10, 2000),
}) });
const rosterEntry = object({ principalId: identifier('principal'), role: enumeration(['debater', 'judge', 'moderator'] as const),
  teamId: nullable(identifier('team')), side: nullable(enumeration(['for', 'against'] as const)), position: nullable(integer(1, 8)),
});
export const saveRosterDraftInput = object({ commandId: identifier('command'), expectedRevision: integer(0, 999), entries: array(rosterEntry, 3, 100) });
/** Draft-only, credential-bound persistence. No access grants or live assignment activation. */
export class RosterStore {
  constructor(private readonly pool: Pool) {}
  private async call(credential: string, sql: string, values: readonly unknown[]) {
    return withCredential(this.pool, credential, async client => {
      const result = await client.query<{ result: Record<string, unknown> }>(sql, [...values]);
      const value = result.rows[0]?.result;
      if (!value || value.operational !== false) throw new Error('Invalid roster draft result');
      return value;
    });
  }
  workspace(credential: string, tenant: string, event: string, before: string | null = null) {
    return this.call(credential, 'SELECT lde_casting.workspace($1,$2,$3) AS result', [identifier('tenant')(tenant), identifier('event')(event), before === null ? null : identifier('principal')(before)]);
  }
  review(credential: string, tenant: string, event: string, candidate: string, input: unknown) {
    const body = reviewCandidateInput(input);
    return this.call(credential, 'SELECT lde_casting.review($1,$2,$3,$4,$5,$6) AS result', [identifier('tenant')(tenant), identifier('event')(event), identifier('principal')(candidate), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  saveDraft(credential: string, tenant: string, event: string, input: unknown) {
    const body = saveRosterDraftInput(input);
    const principals = new Set<string>(); const positions = new Set<string>();
    for (const entry of body.entries) {
      if (principals.has(entry.principalId)) throw new TypeError('Duplicate roster identity'); principals.add(entry.principalId);
      if (entry.role === 'debater') {
        if (!entry.teamId || !entry.side || !entry.position) throw new TypeError('A debater requires an exact team, side and position');
        const key = `${entry.side}:${entry.position}`; if (positions.has(key)) throw new TypeError('Duplicate speaking slot'); positions.add(key);
      } else if (entry.teamId !== null || entry.side !== null || entry.position !== null) throw new TypeError('Only debaters occupy speaking slots');
    }
    return this.call(credential, 'SELECT lde_casting.save_draft($1,$2,$3,$4,$5) AS result', [identifier('tenant')(tenant), identifier('event')(event), body.expectedRevision, JSON.stringify(body.entries), body.commandId]);
  }
}
