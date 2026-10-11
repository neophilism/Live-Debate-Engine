import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createSecretKey, randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { array, enumeration, literal, object, refine, text, type Parsed } from '../../contracts/src/validation.js';
import { PURPOSES, ProtectedDataError, decodeBase64Url, type EncryptionKey, type KeyProvider, type KeyPurpose } from './envelope.js';

const keyPurpose = enumeration([...PURPOSES, 'asset-ticket'] as const);
const entry = object({ id: refine(text(1, 80), (id) => /^[a-z0-9][a-z0-9-]*$/.test(id), 'Invalid key ID'),
  purpose: keyPurpose, status: enumeration(['active', 'decrypt-only', 'revoked'] as const), material: text(43, 43) });
const document = object({ version: literal(1), keys: array(entry, 1, 100) });
export type KeyDocument = Parsed<typeof document>;
export function parseKeys(input: unknown): KeyDocument {
  const value = document(input); const ids = new Set<string>(); const material = new Set<string>(); const active = new Set<string>();
  for (const key of value.keys) {
    if (ids.has(key.id) || material.has(key.material) || (key.status === 'active' && active.has(key.purpose))) throw new ProtectedDataError();
    decodeBase64Url(key.material, 32, 32).fill(0); ids.add(key.id); material.add(key.material);
    if (key.status === 'active') active.add(key.purpose);
  }
  return value;
}
export function generateKeyDocument(): KeyDocument {
  return parseKeys({ version: 1, keys: [...PURPOSES, 'asset-ticket'].map((purpose) => ({ id: `${purpose}-v1`, purpose, status: 'active', material: randomBytes(32).toString('base64url') })) });
}
/** No global master key reused across purposes. Atomic file replacement applies on next operation. */
export class FileKeyProvider implements KeyProvider {
  constructor(private readonly path: string) {
    if (!isAbsolute(path)) throw new ProtectedDataError();
  }
  private async read(): Promise<KeyDocument> {
    const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 65536 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new ProtectedDataError();
      // Bounded read from a verified regular-file descriptor; no unbounded readFile race.
      const bytes = Buffer.alloc(65537); const read = await file.read(bytes, 0, bytes.length, 0);
      try {
        if (read.bytesRead > 65536) throw new ProtectedDataError();
        return parseKeys(JSON.parse(bytes.subarray(0, read.bytesRead).toString('utf8')));
      } finally { bytes.fill(0); }
    } catch { throw new ProtectedDataError(); }
    finally { await file.close(); }
  }
  private async find(purpose: KeyPurpose, id?: string): Promise<EncryptionKey> {
    try {
      keyPurpose(purpose);
      const config = await this.read();
      const found = config.keys.find((key) => key.purpose === purpose && (id === undefined ? key.status === 'active' : key.id === id && key.status !== 'revoked'));
      if (!found) throw new ProtectedDataError();
      const bytes = decodeBase64Url(found.material, 32, 32);
      try { return Object.freeze({ id: found.id, purpose: found.purpose, key: createSecretKey(bytes) }); }
      finally { bytes.fill(0); }
    } catch { throw new ProtectedDataError(); }
  }
  active(purpose: KeyPurpose): Promise<EncryptionKey> { return this.find(purpose); }
  resolve(purpose: KeyPurpose, id: string): Promise<EncryptionKey> { return this.find(purpose, id); }
}
