import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { withCredential } from '../../identity/src/broker.js';
import { array, enumeration, identifier, integer, object, text } from '../../contracts/src/validation.js';
import { canonicalJson } from '../../contracts/src/canonical.js';

const calendarDate = (value: unknown): string => {
  const parsed = text(10, 10)(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || new Date(parsed + 'T00:00:00.000Z').toISOString().slice(0, 10) !== parsed) {
    throw new TypeError('Expected calendar date');
  }
  return parsed;
};
const normalizedText = (minimum: number, maximum: number) => (value: unknown): string => {
  const parsed = text(minimum, maximum)(value);
  if (parsed !== parsed.normalize('NFC') || parsed.trim().length < minimum) throw new TypeError('Expected normalized text');
  return parsed;
};
const categories = (value: unknown): readonly string[] => {
  const parsed = array(normalizedText(1, 80), 1, 12)(value);
  if (new Set(parsed.map((entry) => entry.toLocaleLowerCase('en-US'))).size !== parsed.length) throw new TypeError('Categories must be unique');
  return parsed;
};

export const seriesInput = object({
  commandId: identifier('command'), expectedRevision: integer(0, 999),
  data: object({ name: normalizedText(1, 200), season: normalizedText(1, 120), startsOn: calendarDate, endsOn: calendarDate }),
});
export const motionInput = object({
  commandId: identifier('command'), expectedRevision: integer(0, 999),
  data: object({ seriesId: identifier('series'), wording: normalizedText(1, 2_000), description: normalizedText(1, 10_000), categories }),
});
export const eventInput = object({
  commandId: identifier('command'), expectedRevision: integer(0, 999),
  data: object({
    seriesId: identifier('series'), motionId: identifier('motion'), motionRevision: integer(1),
    title: normalizedText(1, 240), venue: normalizedText(1, 500),
    broadcastMode: enumeration(['none', 'private-stream', 'public-stream', 'prerecorded'] as const),
  }),
});
export const publishAdministrationInput = object({ commandId: identifier('command'), expectedRevision: integer(1, 999) });
export const amendmentInput = object({
  commandId: identifier('command'), expectedMotionRevision: integer(1, 999), expectedEventRevision: integer(1, 999),
  data: object({ wording: normalizedText(1, 2_000), description: normalizedText(1, 10_000), categories, reason: normalizedText(10, 2_000) }),
});

function verifyResult(result: unknown): Record<string, unknown> {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid administration result');
  const output = result as Record<string, unknown>;
  for (const key of ['current', 'motion', 'event']) {
    const envelope = output[key];
    if (envelope === undefined) continue;
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Invalid administration envelope');
    const record = envelope as Record<string, unknown>;
    const contentHash = createHash('sha256').update(canonicalJson(record.snapshot), 'utf8').digest('hex');
    if (contentHash !== record.contentHash) throw new Error('Administration snapshot integrity failure');
  }
  return output;
}

/** Fixed credential-bound E08 operations; callers cannot supply principals or SQL. */
export class AdministrationStore {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  private async call(credential: string, sql: string, values: readonly unknown[]) {
    return withCredential(this.pool, credential, async (client) => {
      const response = await client.query<{ result: unknown }>(sql, [...values]);
      return verifyResult(response.rows[0]?.result);
    });
  }
  saveSeries(credential: string, tenantId: string, seriesId: string, input: unknown) {
    const body = seriesInput(input);
    if (body.data.endsOn < body.data.startsOn) throw new TypeError('Series end cannot precede start');
    return this.call(credential, 'SELECT lde_competition.save_series($1,$2,$3,$4,$5) AS result',
      [identifier('tenant')(tenantId), identifier('series')(seriesId), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  saveMotion(credential: string, tenantId: string, motionId: string, input: unknown) {
    const body = motionInput(input);
    return this.call(credential, 'SELECT lde_competition.save_motion($1,$2,$3,$4,$5) AS result',
      [identifier('tenant')(tenantId), identifier('motion')(motionId), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  publishMotion(credential: string, tenantId: string, motionId: string, input: unknown) {
    const body = publishAdministrationInput(input);
    return this.call(credential, 'SELECT lde_competition.publish_motion($1,$2,$3,$4) AS result',
      [identifier('tenant')(tenantId), identifier('motion')(motionId), body.expectedRevision, body.commandId]);
  }
  saveEvent(credential: string, tenantId: string, eventId: string, input: unknown) {
    const body = eventInput(input);
    return this.call(credential, 'SELECT lde_competition.save_event_admin($1,$2,$3,$4,$5) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  publishEvent(credential: string, tenantId: string, eventId: string, input: unknown) {
    const body = publishAdministrationInput(input);
    return this.call(credential, 'SELECT lde_competition.publish_event_admin($1,$2,$3,$4) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), body.expectedRevision, body.commandId]);
  }
  amendPublishedMotion(credential: string, tenantId: string, eventId: string, motionId: string, input: unknown) {
    const body = amendmentInput(input);
    return this.call(credential, 'SELECT lde_competition.amend_published_motion($1,$2,$3,$4,$5,$6,$7) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), identifier('motion')(motionId),
        body.expectedMotionRevision, body.expectedEventRevision, JSON.stringify(body.data), body.commandId]);
  }
}
