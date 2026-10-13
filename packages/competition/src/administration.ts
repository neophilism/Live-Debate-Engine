export type PublicationState = 'draft' | 'published' | 'withdrawn';
export type BroadcastMode = 'none' | 'private-stream' | 'public-stream' | 'prerecorded';

export type Series = Readonly<{
  id: string;
  tenantId: string;
  name: string;
  season: string;
  startsOn: string;
  endsOn: string;
}>;

export type MotionRevision = Readonly<{
  motionId: string;
  tenantId: string;
  seriesId: string;
  revision: number;
  wording: string;
  description: string;
  categories: readonly string[];
  state: PublicationState;
  createdAt: string;
  createdBy: string;
  amendment: Readonly<{
    reason: string;
    previousRevision: number;
  }> | null;
}>;

export type EventAdministration = Readonly<{
  id: string;
  tenantId: string;
  seriesId: string;
  motionId: string;
  motionRevision: number;
  title: string;
  venue: string;
  broadcastMode: BroadcastMode;
  state: PublicationState;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}>;

export type PublishedMotionAmendment = Readonly<{
  eventId: string;
  fromRevision: number;
  toRevision: number;
  previousWording: string;
  replacementWording: string;
  reason: string;
  amendedAt: string;
  amendedBy: string;
}>;

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > maximum) throw new RangeError(`${label} must contain 1-${maximum} characters`);
  return normalized;
}

function instant(value: unknown, label: string): string {
  const parsed = text(value, label, 40);
  const date = new Date(parsed);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== parsed) throw new RangeError(`${label} must be a canonical UTC instant`);
  return parsed;
}

function date(value: unknown, label: string): string {
  const parsed = text(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || new Date(`${parsed}T00:00:00.000Z`).toISOString().slice(0, 10) !== parsed) {
    throw new RangeError(`${label} must be a calendar date`);
  }
  return parsed;
}

function identifier(value: unknown, label: string): string {
  return text(value, label, 128);
}

function categories(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) throw new RangeError('categories must contain 1-12 values');
  const result = value.map((entry) => text(entry, 'category', 80));
  if (new Set(result.map((entry) => entry.toLocaleLowerCase('en-US'))).size !== result.length) throw new RangeError('categories must be unique');
  return Object.freeze(result);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export function createSeries(input: Series): Series {
  const result = {
    id: identifier(input.id, 'series id'),
    tenantId: identifier(input.tenantId, 'tenant id'),
    name: text(input.name, 'series name', 200),
    season: text(input.season, 'season', 120),
    startsOn: date(input.startsOn, 'series start'),
    endsOn: date(input.endsOn, 'series end'),
  };
  if (result.endsOn < result.startsOn) throw new RangeError('series end cannot precede its start');
  return freeze(result);
}

export function createMotion(input: Omit<MotionRevision, 'revision' | 'state' | 'amendment'>): MotionRevision {
  return freeze({
    motionId: identifier(input.motionId, 'motion id'),
    tenantId: identifier(input.tenantId, 'tenant id'),
    seriesId: identifier(input.seriesId, 'series id'),
    revision: 1,
    wording: text(input.wording, 'motion wording', 2_000),
    description: text(input.description, 'motion description', 10_000),
    categories: categories(input.categories),
    state: 'draft',
    createdAt: instant(input.createdAt, 'created at'),
    createdBy: identifier(input.createdBy, 'created by'),
    amendment: null,
  });
}

export function reviseDraftMotion(current: MotionRevision, input: Pick<MotionRevision, 'wording' | 'description' | 'categories' | 'createdAt' | 'createdBy'>, expectedRevision: number): MotionRevision {
  if (current.state !== 'draft') throw new Error('published motion wording requires an explicit amendment');
  if (current.revision !== expectedRevision) throw new Error('motion revision conflict');
  return freeze({
    ...current,
    revision: current.revision + 1,
    wording: text(input.wording, 'motion wording', 2_000),
    description: text(input.description, 'motion description', 10_000),
    categories: categories(input.categories),
    createdAt: instant(input.createdAt, 'created at'),
    createdBy: identifier(input.createdBy, 'created by'),
  });
}

export function publishMotion(current: MotionRevision, expectedRevision: number): MotionRevision {
  if (current.state !== 'draft') throw new Error('only a draft motion may be published');
  if (current.revision !== expectedRevision) throw new Error('motion revision conflict');
  return freeze({ ...current, state: 'published' });
}

export function createEvent(input: Omit<EventAdministration, 'revision' | 'state'>, series: Series, motion: MotionRevision): EventAdministration {
  if (input.tenantId !== series.tenantId) throw new Error('event and series tenant must match');
  if (input.seriesId !== series.id) throw new Error('event must reference the supplied series');
  if (motion.tenantId !== series.tenantId || motion.seriesId !== series.id) throw new Error('motion and event must belong to the supplied tenant and series');
  if (motion.state !== 'published') throw new Error('event must reference a published motion');
  if (input.motionId !== motion.motionId || input.motionRevision !== motion.revision) throw new Error('event must bind the exact published motion revision');
  if (!['none', 'private-stream', 'public-stream', 'prerecorded'].includes(input.broadcastMode)) throw new RangeError('unsupported broadcast mode');
  return freeze({
    id: identifier(input.id, 'event id'),
    tenantId: identifier(input.tenantId, 'tenant id'),
    seriesId: identifier(input.seriesId, 'series id'),
    motionId: identifier(input.motionId, 'motion id'),
    motionRevision: input.motionRevision,
    title: text(input.title, 'event title', 240),
    venue: text(input.venue, 'venue', 500),
    broadcastMode: input.broadcastMode,
    state: 'draft',
    revision: 1,
    updatedAt: instant(input.updatedAt, 'updated at'),
    updatedBy: identifier(input.updatedBy, 'updated by'),
  });
}

export function publishEvent(current: EventAdministration, expectedRevision: number): EventAdministration {
  if (current.state !== 'draft') throw new Error('only a draft event may be published');
  if (current.revision !== expectedRevision) throw new Error('event revision conflict');
  return freeze({ ...current, state: 'published', revision: current.revision + 1 });
}

export function amendPublishedMotion(current: MotionRevision, event: EventAdministration, input: Pick<MotionRevision, 'wording' | 'description' | 'categories' | 'createdAt' | 'createdBy'> & { reason: string }, expectedMotionRevision: number, expectedEventRevision: number): Readonly<{ motion: MotionRevision; event: EventAdministration; amendment: PublishedMotionAmendment }> {
  if (current.state !== 'published' || event.state !== 'published') throw new Error('motion amendment requires published motion and event');
  if (current.revision !== expectedMotionRevision || event.revision !== expectedEventRevision) throw new Error('amendment revision conflict');
  if (event.motionId !== current.motionId || event.motionRevision !== current.revision) throw new Error('event does not reference the supplied motion revision');
  const reason = text(input.reason, 'amendment reason', 2_000);
  if (reason.length < 10) throw new RangeError('amendment reason must contain at least 10 characters');
  const wording = text(input.wording, 'motion wording', 2_000);
  if (wording === current.wording) throw new Error('amendment must change the published wording');
  const createdAt = instant(input.createdAt, 'created at');
  const createdBy = identifier(input.createdBy, 'created by');
  const motion = freeze({
    ...current,
    revision: current.revision + 1,
    wording,
    description: text(input.description, 'motion description', 10_000),
    categories: categories(input.categories),
    createdAt,
    createdBy,
    amendment: freeze({ reason, previousRevision: current.revision }),
  });
  const nextEvent = freeze({ ...event, motionRevision: motion.revision, revision: event.revision + 1, updatedAt: createdAt, updatedBy: createdBy });
  const amendment = freeze({
    eventId: event.id,
    fromRevision: current.revision,
    toRevision: motion.revision,
    previousWording: current.wording,
    replacementWording: motion.wording,
    reason,
    amendedAt: createdAt,
    amendedBy: createdBy,
  });
  return freeze({ motion, event: nextEvent, amendment });
}
