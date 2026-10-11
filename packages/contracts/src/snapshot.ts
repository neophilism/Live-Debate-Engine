import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson, MAX_RECORD_BYTES } from './canonical.js';
import { anyReference, entityKind, parseData, TENANT_KINDS, type DomainData, type EntityKind, type SnapshotReference } from './domain.js';
import { dataObject, digest, identifier, integer, literal, nullable, object, reject, text, timestamp, type Parsed } from './validation.js';

const scopeParser = object({ tenantId: identifier('tenant'), entityId: identifier('entity'), eventId: nullable(identifier('event')) });
const metadata = object({
  schemaVersion: literal(1), kind: entityKind, tenantId: identifier('tenant'),
  entityId: identifier('entity'), eventId: nullable(identifier('event')), snapshotId: identifier('snapshot'),
  revision: integer(1), previousSnapshotId: nullable(identifier('snapshot')), recordedAt: timestamp,
});
export type RecordOf<K extends EntityKind> = Omit<Parsed<typeof metadata>, 'kind'> & Readonly<{ kind: K; data: DomainData[K] }>;
export type DomainRecord = { [K in EntityKind]: RecordOf<K> }[EntityKind];
export type Snapshot<K extends EntityKind = EntityKind> = Readonly<{ record: RecordOf<K>; canonical: string; contentHash: string }>;
export type SnapshotOptions = Readonly<{ snapshotId?: string; recordedAt?: string }>;
export type EntityScope = Readonly<{ tenantId: string; entityId: string; eventId: string | null }>;
export type ReferenceOf<K extends EntityKind> = Omit<SnapshotReference, 'kind'> & Readonly<{ kind: K }>;

function generationOptions(value: SnapshotOptions) {
  const options = dataObject(value);
  if (Object.keys(options).some((key) => !['snapshotId', 'recordedAt'].includes(key))) reject('Unknown generation option');
  return {
    snapshotId: Object.hasOwn(options, 'snapshotId') ? identifier('snapshot')(options.snapshotId) : randomUUID(),
    recordedAt: Object.hasOwn(options, 'recordedAt') ? timestamp(options.recordedAt) : new Date().toISOString(),
  };
}

export function referencesIn(value: unknown): readonly SnapshotReference[] {
  const found = new Map<string, SnapshotReference>();
  function visit(input: unknown): void {
    if (input === null || typeof input !== 'object') return;
    if (Array.isArray(input)) { for (const item of input) visit(item); return; }
    const item = dataObject(input);
    if (item.refType === 'snapshot') {
      const ref = anyReference(item);
      const prior = found.get(ref.snapshotId);
      if (prior && canonicalJson(prior) !== canonicalJson(ref)) reject('Conflicting metadata for one snapshot reference');
      found.set(ref.snapshotId, ref);
      return;
    }
    for (const nested of Object.values(item)) visit(nested);
  }
  canonicalJson(value);
  visit(value);
  return Object.freeze([...found.values()]);
}

export function parseRecord(value: unknown): DomainRecord {
  canonicalJson(value);
  const input = dataObject(value);
  if (!Object.hasOwn(input, 'data')) reject('Record data is required');
  const { data, ...rest } = input;
  const base = metadata(rest);
  const tenantScoped = TENANT_KINDS.some((kind) => kind === base.kind);
  if (tenantScoped ? base.eventId !== null : base.eventId === null) reject('Invalid entity scope');
  if (base.kind === 'tenant' && String(base.entityId) !== String(base.tenantId)) reject('Tenant identity differs from scope');
  if (base.kind === 'event' && String(base.entityId) !== String(base.eventId)) reject('Event identity differs from scope');
  if ((base.revision === 1) !== (base.previousSnapshotId === null)) reject('Invalid revision predecessor');
  if (base.previousSnapshotId === base.snapshotId) reject('A revision cannot precede itself');
  const parsed = parseData(base.kind, data);
  for (const ref of referencesIn(parsed)) {
    if (ref.tenantId !== base.tenantId) reject('Cross-tenant reference');
    const tenantRef = TENANT_KINDS.some((kind) => kind === ref.kind);
    if (tenantRef ? ref.eventId !== null : ref.eventId !== base.eventId || ref.eventId === null) reject('Cross-event or invalid reference scope');
    if (ref.snapshotId === base.snapshotId) reject('Self-referencing snapshot');
  }
  return Object.freeze({ ...base, data: parsed }) as DomainRecord;
}

export function snapshotOf<K extends EntityKind>(record: RecordOf<K>): Snapshot<K>;
export function snapshotOf(record: unknown): Snapshot;
export function snapshotOf(record: unknown): Snapshot {
  const parsed = parseRecord(record);
  const canonical = canonicalJson(parsed);
  return Object.freeze({ record: parsed, canonical, contentHash: createHash('sha256').update(canonical, 'utf8').digest('hex') });
}

export function initialSnapshot<K extends EntityKind>(kind: K, scope: EntityScope, data: unknown, options: SnapshotOptions = {}): Snapshot<K> {
  return snapshotOf({
    ...scopeParser(scope), schemaVersion: 1, kind: entityKind(kind), data, revision: 1, previousSnapshotId: null,
    ...generationOptions(options),
  }) as Snapshot<K>;
}
export function verifySnapshot<K extends EntityKind>(input: Snapshot<K>): Snapshot<K> {
  const fields = dataObject(input);
  if (Object.keys(fields).length !== 3 || !['record', 'canonical', 'contentHash'].every((key) => Object.hasOwn(fields, key))) reject('Invalid snapshot envelope');
  const verified = snapshotOf(fields.record) as Snapshot<K>;
  if (verified.canonical !== fields.canonical || verified.contentHash !== fields.contentHash) reject('Snapshot content/hash mismatch');
  return verified;
}
export function nextSnapshot<K extends EntityKind>(previous: Snapshot<K>, data: unknown, options: SnapshotOptions = {}): Snapshot<K> {
  const prior = verifySnapshot(previous).record;
  return snapshotOf({ ...prior, data, revision: prior.revision + 1, previousSnapshotId: prior.snapshotId, ...generationOptions(options) }) as Snapshot<K>;
}
export function referenceOf<K extends EntityKind>(snapshot: Snapshot<K>): ReferenceOf<K> {
  const { kind, tenantId, entityId, eventId, snapshotId, revision } = verifySnapshot(snapshot).record;
  return Object.freeze({ refType: 'snapshot', kind, tenantId, entityId, eventId, snapshotId, revision });
}
export function decodeSnapshot(canonical: unknown, expectedHash: unknown): Snapshot {
  const encoded = text(1, MAX_RECORD_BYTES)(canonical);
  const hash = digest(expectedHash);
  let value: unknown;
  try { value = JSON.parse(encoded); } catch { reject('Invalid snapshot JSON'); }
  const snapshot = snapshotOf(value);
  if (snapshot.canonical !== encoded || snapshot.contentHash !== hash) reject('Noncanonical or corrupted snapshot');
  return snapshot;
}

export const commandParser = object({ idempotencyKey: identifier('command'), principalId: identifier('principal'), expectedRevision: integer(0) });
export type AppendCommand = Parsed<typeof commandParser>;
export type AppendReceipt = Readonly<{ snapshotId: string; revision: number; replayed: boolean }>;

/** Stable across regenerated server timestamps/snapshot IDs, but not changed intent. */
export function appendIntentHash(snapshot: Snapshot): string {
  const { kind, tenantId, entityId, eventId, revision, previousSnapshotId, data } = verifySnapshot(snapshot).record;
  return createHash('sha256').update(canonicalJson({ kind, tenantId, entityId, eventId, expectedRevision: revision - 1, previousSnapshotId, data }), 'utf8').digest('hex');
}
