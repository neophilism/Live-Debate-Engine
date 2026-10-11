import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { databaseConfig } from '../packages/database/src/config.js';
import { generateKeyDocument, parseKeys, FileKeyProvider, type KeyDocument } from '../packages/security/src/keys.js';
import { PURPOSES } from '../packages/security/src/envelope.js';
import { ProtectedObjectStore, rotateObjectKey } from '../packages/security/src/store.js';
import { ClamAvScanner } from '../packages/security/src/uploads.js';
import { assertDatabaseRole } from '../packages/identity/src/broker.js';

/** Explicit operator commands. No key, URL, token, payload or raw error is logged. */
const [command, arg1, arg2, ...remaining] = process.argv.slice(2);
let pool: pg.Pool | undefined;
try {
  const keyFile = process.env.LDE_STORAGE_KEY_FILE;
  if (!keyFile || resolve(keyFile) !== keyFile) throw new Error('Absolute private key file required');
  if (command === 'keys-init') {
    if (arg1) throw new Error('Unexpected argument');
    const file = await open(keyFile, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(generateKeyDocument(), null, 2)); await file.sync(); }
    finally { await file.close(); }
    console.log(JSON.stringify({ event: 'keyfile-created' }));
  } else if (command === 'keys-rotate' || command === 'keys-revoke') {
    if (!arg1 || arg2) throw new Error('A purpose or key ID is required');
    const lock = await open(`${keyFile}.lock`, 'wx', 0o600);
    let temporary: string | undefined;
    try {
      const file = await open(keyFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let encoded: Buffer;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe key file');
        const buffer = Buffer.alloc(65537); const read = await file.read(buffer, 0, buffer.length, 0);
        if (read.bytesRead > 65536) { buffer.fill(0); throw new Error('Oversized key file'); }
        encoded = Buffer.from(buffer.subarray(0, read.bytesRead)); buffer.fill(0);
      } finally { await file.close(); }
      let document: { version: 1; keys: { -readonly [K in keyof KeyDocument['keys'][number]]: KeyDocument['keys'][number][K] }[] };
      try { const parsed = parseKeys(JSON.parse(encoded.toString('utf8'))); document = { version: parsed.version, keys: parsed.keys.map((key) => ({ ...key })) }; } finally { encoded.fill(0); }
      if (command === 'keys-rotate') {
        if (![...PURPOSES, 'asset-ticket'].includes(arg1)) throw new Error('Unknown purpose');
        const prior = document.keys.find((key) => key.purpose === arg1 && key.status === 'active');
        if (!prior) throw new Error('Active key required');
        prior.status = 'decrypt-only';
        document.keys.push({ id: `key-${randomUUID()}`, purpose: prior.purpose, status: 'active', material: randomBytes(32).toString('base64url') });
      } else {
        const selected = document.keys.find((key) => key.id === arg1); if (!selected) throw new Error('Unknown key'); selected.status = 'revoked';
      }
      parseKeys(document);
      temporary = `${keyFile}.${randomUUID()}.tmp`;
      const next = await open(temporary, 'wx', 0o600);
      try { await next.writeFile(JSON.stringify(document, null, 2)); await next.sync(); }
      finally { await next.close(); }
      await rename(temporary, keyFile); temporary = undefined;
      console.log(JSON.stringify({ event: command === 'keys-rotate' ? 'key-version-created' : 'key-revoked' }));
    } finally { if (temporary) await unlink(temporary).catch(() => {}); await lock.close(); await unlink(`${keyFile}.lock`); }
  } else if (command === 'scan' || command === 'rewrap') {
    if (!arg1 || !arg2) throw new Error('Tenant and object IDs required');
    const database = command === 'scan' ? process.env.DATABASE_URL : process.env.DATABASE_URL_UNPOOLED;
    if (!database) throw new Error('Appropriate scoped database credential required');
    pool = new pg.Pool(databaseConfig(database, process.env));
    const keys = new FileKeyProvider(keyFile);
    if (command === 'scan') {
      if (remaining.length || !process.env.LDE_SCANNER_CREDENTIAL || !process.env.LDE_CLAMAV_SOCKET) throw new Error('Scanner configuration required');
      await assertDatabaseRole(pool, 'runtime');
      const store = new ProtectedObjectStore(pool, keys);
      const state = await store.scan(process.env.LDE_SCANNER_CREDENTIAL, arg1, arg2, new ClamAvScanner(process.env.LDE_CLAMAV_SOCKET));
      console.log(JSON.stringify({ event: 'scan-completed', state }));
      if (state === 'quarantined') process.exitCode = 2;
    } else {
      await rotateObjectKey(pool, keys, arg1, arg2, remaining.join(' '));
      console.log(JSON.stringify({ event: 'object-key-rewrapped' }));
    }
  } else throw new Error('Unknown storage operation');
} catch { console.error(JSON.stringify({ event: 'storage-operation-failed' })); process.exitCode = 1; }
finally { await pool?.end(); }
