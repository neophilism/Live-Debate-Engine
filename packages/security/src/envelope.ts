import { createCipheriv, createDecipheriv, randomBytes, type KeyObject } from 'node:crypto';
import { canonicalJson } from '../../contracts/src/canonical.js';
import { enumeration, identifier, integer, literal, nullable, object, text, type Parsed } from '../../contracts/src/validation.js';

export const MAX_OBJECT_BYTES = 1048576;
export const PURPOSES = Object.freeze(['identity-document', 'judge-note', 'finance-document', 'production-asset', 'sealed-ballot'] as const);
export type ObjectPurpose = typeof PURPOSES[number];
export type KeyPurpose = ObjectPurpose | 'asset-ticket';
export const MIME_TYPES = Object.freeze(['text/plain', 'application/json', 'application/pdf', 'image/png', 'image/jpeg'] as const);
export const contextParser = object({
  version: literal(1), tenantId: identifier('tenant'), eventId: identifier('event'), objectId: identifier('protected-object'),
  ownerId: identifier('principal'), purpose: enumeration(PURPOSES), contentType: enumeration(MIME_TYPES), byteLength: integer(1, MAX_OBJECT_BYTES),
});
export type ObjectContext = Parsed<typeof contextParser>;
const packetParser = object({ iv: text(16, 16), tag: text(22, 22), ciphertext: text(1, 4 * MAX_OBJECT_BYTES / 3 + 4) });
export const envelopeParser = object({
  version: literal(1), algorithm: literal('A256GCM-envelope-v1'), keyId: text(1, 80),
  payload: packetParser, wrappedKey: packetParser,
});
export type Envelope = Parsed<typeof envelopeParser>;
export type EncryptionKey = Readonly<{ id: string; purpose: KeyPurpose; key: KeyObject }>;
/** Implementations must check key status on every resolution, not just process startup. */
export interface KeyProvider {
  active(purpose: KeyPurpose): Promise<EncryptionKey>;
  resolve(purpose: KeyPurpose, id: string): Promise<EncryptionKey>;
}
export class ProtectedDataError extends Error {
  constructor() { super('Protected data unavailable'); this.name = 'ProtectedDataError'; }
}
export function decodeBase64Url(value: string, expectedBytes?: number, maximum = MAX_OBJECT_BYTES): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(maximum * 4 / 3)) throw new ProtectedDataError();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || bytes.length > maximum || (expectedBytes !== undefined && bytes.length !== expectedBytes)) throw new ProtectedDataError();
  return bytes;
}
function aad(context: ObjectContext, purpose: 'payload' | 'wrap', keyId: string | null): Buffer {
  return Buffer.from(canonicalJson({ context: contextParser(context), operation: purpose, keyId }), 'utf8');
}
function encrypt(bytes: Buffer, key: KeyObject | Buffer, associated: Buffer) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(associated);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Object.freeze({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
}
function decrypt(packet: Envelope['payload'], key: KeyObject | Buffer, associated: Buffer, expected: number): Buffer {
  let interim: Buffer | undefined;
  try {
    const iv = decodeBase64Url(packet.iv, 12, 12); const tag = decodeBase64Url(packet.tag, 16, 16);
    const ciphertext = decodeBase64Url(packet.ciphertext, expected);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAAD(associated); decipher.setAuthTag(tag);
    interim = decipher.update(ciphertext);
    const final = decipher.final();
    const result = Buffer.concat([interim, final]); final.fill(0);
    return result;
  } catch { throw new ProtectedDataError(); }
  finally { interim?.fill(0); }
}
function checkKey(key: EncryptionKey, purpose: KeyPurpose, id?: string): void {
  if (key.purpose !== purpose || (id !== undefined && key.id !== id) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(key.id)
    || key.key.type !== 'secret' || key.key.symmetricKeySize !== 32) throw new ProtectedDataError();
}
export async function sealObject(bytes: Buffer, rawContext: ObjectContext, keys: KeyProvider): Promise<Envelope> {
  const context = contextParser(rawContext);
  if (!Buffer.isBuffer(bytes) || bytes.length !== context.byteLength) throw new ProtectedDataError();
  const wrapping = await keys.active(context.purpose); checkKey(wrapping, context.purpose);
  const dataKey = randomBytes(32);
  try {
    return envelopeParser({ version: 1, algorithm: 'A256GCM-envelope-v1', keyId: wrapping.id,
      payload: encrypt(bytes, dataKey, aad(context, 'payload', null)),
      wrappedKey: encrypt(dataKey, wrapping.key, aad(context, 'wrap', wrapping.id)) });
  } finally { dataKey.fill(0); }
}
export async function openObject(rawEnvelope: unknown, rawContext: ObjectContext, keys: KeyProvider): Promise<Buffer> {
  let dataKey: Buffer | undefined;
  try {
    const context = contextParser(rawContext); const envelope = envelopeParser(rawEnvelope);
    const wrapping = await keys.resolve(context.purpose, envelope.keyId); checkKey(wrapping, context.purpose, envelope.keyId);
    dataKey = decrypt(envelope.wrappedKey, wrapping.key, aad(context, 'wrap', envelope.keyId), 32);
    return decrypt(envelope.payload, dataKey, aad(context, 'payload', null), context.byteLength);
  } catch { throw new ProtectedDataError(); }
  finally { dataKey?.fill(0); }
}
/** Rewrap is routine KEK rotation, not remediation of a previously compromised data key. */
export async function rewrapObject(rawEnvelope: unknown, rawContext: ObjectContext, keys: KeyProvider): Promise<Envelope> {
  let dataKey: Buffer | undefined;
  try {
    const context = contextParser(rawContext); const envelope = envelopeParser(rawEnvelope);
    const old = await keys.resolve(context.purpose, envelope.keyId); checkKey(old, context.purpose, envelope.keyId);
    const next = await keys.active(context.purpose); checkKey(next, context.purpose);
    dataKey = decrypt(envelope.wrappedKey, old.key, aad(context, 'wrap', old.id), 32);
    // Authenticate the original ciphertext before persisting a new wrap.
    const plain = decrypt(envelope.payload, dataKey, aad(context, 'payload', null), context.byteLength); plain.fill(0);
    return envelopeParser({ ...envelope, keyId: next.id, wrappedKey: encrypt(dataKey, next.key, aad(context, 'wrap', next.id)) });
  } catch { throw new ProtectedDataError(); }
  finally { dataKey?.fill(0); }
}
export const ticketClaimsParser = object({
  version: literal(1), purpose: literal('asset-download'), objectId: identifier('protected-object'), tenantId: identifier('tenant'),
  eventId: identifier('event'), principalId: identifier('principal'), sessionId: nullable(identifier('session')),
  epoch: integer(1), generation: integer(1), issuedAt: integer(0, Number.MAX_SAFE_INTEGER), expiresAt: integer(0, Number.MAX_SAFE_INTEGER),
});
