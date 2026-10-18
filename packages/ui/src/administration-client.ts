import { canonicalJson } from '../../contracts/src/canonical-json.js';
import { dataObject, digest, identifier, integer, timestamp } from '../../contracts/src/validation.js';
export type AdministrationKind = 'series' | 'motion' | 'event';
export type AdministrationRecord = Readonly<{ contentHash: string; snapshot: Readonly<{
  schemaVersion: 1; kind: AdministrationKind; tenantId: string; entityId: string; snapshotId: string; revision: number; recordedAt: string; data: Record<string, unknown>;
}> }>;
export type AdministrationPage = Readonly<{ records: readonly AdministrationRecord[]; nextCursor: string | null; nextRevision: number | null }>;
export async function readAdministrationRecord(input: unknown, tenant: string, kind: AdministrationKind): Promise<AdministrationRecord> {
  const envelope = dataObject(input); const snapshot = dataObject(envelope.snapshot); const data = dataObject(snapshot.data);
  identifier('tenant')(tenant); identifier('entity')(snapshot.entityId); identifier('snapshot')(snapshot.snapshotId); integer(1)(snapshot.revision); timestamp(snapshot.recordedAt);
  if (snapshot.schemaVersion !== 1 || snapshot.tenantId !== tenant || snapshot.kind !== kind) throw new Error('Administration response has the wrong scope.');
  const contentHash = digest(envelope.contentHash);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(snapshot))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== contentHash) throw new Error('Administration record integrity check failed.');
  if (kind !== 'series' && !['draft', 'published', 'withdrawn'].includes(String(data.state))) throw new Error('Publication state is unavailable.');
  return envelope as AdministrationRecord;
}
export async function readAdministrationPage(input: unknown, tenant: string, kind: AdministrationKind): Promise<AdministrationPage> {
  const page = dataObject(input);
  if (!Array.isArray(page.records) || page.records.length > 50) throw new Error('Administration page is unavailable.');
  if (page.nextCursor !== null) identifier('entity')(page.nextCursor);
  if (page.nextRevision !== null) integer(1)(page.nextRevision);
  const records = await Promise.all(page.records.map(row => readAdministrationRecord(row, tenant, kind)));
  return { records, nextCursor: page.nextCursor as string | null, nextRevision: page.nextRevision as number | null };
}
/** Keep one command identity for an unchanged intent after ambiguous transport failures. */
export function administrationCommand(previous: { key: string; commandId: string } | null, path: string, body: Record<string, unknown>) {
  const key = canonicalJson({ path, body });
  return previous?.key === key ? previous : { key, commandId: crypto.randomUUID() };
}
