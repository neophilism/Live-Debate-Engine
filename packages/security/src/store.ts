import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { withCredential, AccessError } from '../../identity/src/broker.js';
import { identifier, text } from '../../contracts/src/validation.js';
import { contextParser, ticketClaimsParser, sealObject, openObject, rewrapObject, ProtectedDataError, type Envelope, type KeyProvider, type ObjectContext, type ObjectPurpose } from './envelope.js';
import { issueTicket, verifyTicket, TICKET_MAX_AGE_MS } from './tickets.js';
import type { ContentScanner } from './uploads.js';

export type StoredObject = Readonly<{ context: ObjectContext; envelope: Envelope; generation: number; state: string; ciphertext_digest: string }>;
export class ObjectConflict extends Error { constructor() { super('Object revision changed'); this.name = 'ObjectConflict'; } }
export type UploadInput = Readonly<{ tenantId: string; eventId: string; purpose: ObjectPurpose; contentType: ObjectContext['contentType'] }>;

export class ProtectedObjectStore {
  constructor(private readonly pool: Pool, private readonly keys: KeyProvider) {}
  async upload(credential: string, input: UploadInput, bytes: Buffer): Promise<Readonly<{ objectId: string; state: 'quarantined' }>> {
    return withCredential(this.pool, credential, async (client, actor) => {
      const context = contextParser({ ...input, version: 1, objectId: randomUUID(), ownerId: actor.principalId, byteLength: bytes.length });
      const permission = await client.query<{ allowed: boolean }>("SELECT lde_storage.allowed('upload',$1,$2,$3,$4) AS allowed", [context.tenantId, context.eventId, context.ownerId, context.purpose]);
      if (permission.rows[0]?.allowed !== true) throw new AccessError(403);
      const envelope = await sealObject(bytes, context, this.keys);
      await client.query('SELECT lde_storage.put_object($1::jsonb,$2::jsonb)', [JSON.stringify(context), JSON.stringify(envelope)]);
      return Object.freeze({ objectId: context.objectId, state: 'quarantined' });
    });
  }
  async issueDownload(credential: string, tenantId: string, objectId: string): Promise<string> {
    identifier('tenant')(tenantId); identifier('protected-object')(objectId);
    return withCredential(this.pool, credential, async (client, actor) => {
      if (actor.kind !== 'human' || !actor.sessionId) throw new AccessError(403);
      const result = await client.query<StoredObject>("SELECT * FROM lde_storage.read_object($1,$2,'ticket-issued')", [tenantId, objectId]);
      const stored = result.rows[0]; if (!stored) throw new AccessError(403);
      const context = contextParser(stored.context);
      // Unknown/revoked purpose keys must fail even before issuing a link.
      await this.keys.resolve(context.purpose, stored.envelope.keyId);
      const now = Date.now();
      return issueTicket(ticketClaimsParser({ version: 1, purpose: 'asset-download', tenantId, objectId, eventId: context.eventId,
        principalId: actor.principalId, sessionId: actor.sessionId, epoch: actor.epoch,
        generation: stored.generation, issuedAt: now, expiresAt: now + TICKET_MAX_AGE_MS }), now, this.keys);
    });
  }
  async download(credential: string, tenantId: string, objectId: string, ticket: string): Promise<Readonly<{ bytes: Buffer; contentType: string }>> {
    identifier('tenant')(tenantId); identifier('protected-object')(objectId);
    const claims = await verifyTicket(ticket, Date.now(), this.keys);
    if (claims.tenantId !== tenantId || claims.objectId !== objectId) throw new AccessError(403);
    return withCredential(this.pool, credential, async (client, actor) => {
      if (actor.kind !== 'human' || actor.principalId !== claims.principalId || actor.sessionId !== claims.sessionId || actor.epoch !== claims.epoch) throw new AccessError(403);
      const result = await client.query<StoredObject>("SELECT * FROM lde_storage.read_object($1,$2,'read')", [tenantId, objectId]);
      const stored = result.rows[0];
      if (!stored || stored.generation !== claims.generation || stored.context.eventId !== claims.eventId) throw new AccessError(403);
      const bytes = await openObject(stored.envelope, stored.context, this.keys);
      return Object.freeze({ bytes, contentType: stored.context.contentType });
    });
  }
  async status(credential: string, tenantId: string, objectId: string): Promise<{ state: string; generation: number }> {
    identifier('tenant')(tenantId); identifier('protected-object')(objectId);
    return withCredential(this.pool, credential, async (client) => {
      const result = await client.query<{ state: string; generation: number }>('SELECT * FROM lde_storage.object_status($1,$2)', [tenantId, objectId]);
      if (!result.rows[0]) throw new AccessError(403);
      return result.rows[0];
    });
  }
  async revoke(credential: string, tenantId: string, objectId: string): Promise<void> {
    identifier('tenant')(tenantId); identifier('protected-object')(objectId);
    await withCredential(this.pool, credential, async (client) => { await client.query('SELECT lde_storage.revoke_object($1,$2)', [tenantId, objectId]); });
  }
  /** Worker-only. External scanner is a disclosed plaintext processor; it cannot authorize users. */
  async scan(credential: string, tenantId: string, objectId: string, scanner: ContentScanner): Promise<string> {
    identifier('tenant')(tenantId); identifier('protected-object')(objectId);
    const stored = await withCredential(this.pool, credential, async (client, actor) => {
      if (actor.kind !== 'service') throw new AccessError(403);
      const result = await client.query<StoredObject>("SELECT * FROM lde_storage.read_object($1,$2,'scan-read')", [tenantId, objectId]);
      if (!result.rows[0]) throw new AccessError(403);
      return result.rows[0];
    });
    let bytes: Buffer | undefined;
    let verdict: 'clean' | 'rejected' | 'unavailable' = 'unavailable';
    let scannerId = scanner.id;
    try {
      bytes = await openObject(stored.envelope, stored.context, this.keys);
      const result = await scanner.scan(bytes, contextParser(stored.context).contentType);
      if (result.verdict === 'clean' || result.verdict === 'rejected') verdict = result.verdict;
      scannerId = result.engine;
    } catch { verdict = 'unavailable'; }
    finally { bytes?.fill(0); }
    text(1, 160)(scannerId);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 .:_-]{0,159}$/.test(scannerId)) throw new ProtectedDataError();
    return withCredential(this.pool, credential, async (client) => {
      const result = await client.query<{ state: string }>('SELECT lde_storage.scan_result($1,$2,$3,$4,$5,$6) AS state', [tenantId, objectId, stored.generation, stored.ciphertext_digest, verdict, scannerId]);
      if (!result.rows[0]) throw new ProtectedDataError();
      return result.rows[0].state;
    });
  }
}

/** Offline operator process only; runtime/identity roles have no table permissions. */
export async function rotateObjectKey(operator: Pool, keys: KeyProvider, tenantId: string, objectId: string, reason: string): Promise<void> {
  identifier('tenant')(tenantId); identifier('protected-object')(objectId); text(10, 160)(reason);
  const client = await operator.connect(); let discard = false;
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'");
    const result = await client.query<StoredObject>('SELECT context,envelope,generation,state,ciphertext_digest FROM lde_storage.objects WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, objectId]);
    const stored = result.rows[0]; if (!stored) throw new ProtectedDataError();
    const envelope = await rewrapObject(stored.envelope, stored.context, keys);
    if (envelope.keyId === stored.envelope.keyId) throw new ObjectConflict();
    await client.query('UPDATE lde_storage.objects SET envelope=$1::jsonb,generation=generation+1,updated_at=now() WHERE tenant_id=$2 AND id=$3', [JSON.stringify(envelope), tenantId, objectId]);
    await client.query("INSERT INTO lde_storage.audit(tenant_id,object_id,actor_kind,operation,generation,detail) VALUES($1,$2,'operator','key-rotated',$3,$4)", [tenantId, objectId, stored.generation + 1, reason]);
    await client.query('COMMIT');
  } catch (error) { try { await client.query('ROLLBACK'); } catch { discard = true; } throw error; }
  finally { client.release(discard); }
}
