import { readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import pg from 'pg';
import { databaseConfig } from '../packages/database/src/config.js';
import { administerAccess, type AdministrativeAction } from '../packages/identity/src/administration.js';

let pool: pg.Pool | undefined;
try {
  const [action, inputPath, outputPath, ...extra] = process.argv.slice(2);
  if (!action || !['membership', 'role', 'principal', 'issue-service', 'revoke-service'].includes(action) || !inputPath || extra.length) throw new Error('Invalid command');
  if (action === 'issue-service' && !outputPath) throw new Error('Private output path required');
  if (action !== 'issue-service' && outputPath) throw new Error('Unexpected output path');
  const input = await readFile(inputPath, 'utf8'); if (Buffer.byteLength(input) > 16384) throw new Error('Request too large');
  const connection = process.env.DATABASE_URL_UNPOOLED;
  if (!connection) throw new Error('Explicit migration/operator database URL required');
  pool = new pg.Pool(databaseConfig(connection, process.env));
  pool.on('error', () => console.error(JSON.stringify({ event: 'operator_connection_error' })));
  // Reserve the output first so a failed path never strands an unexportable active credential.
  const file = outputPath ? await open(outputPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) : null;
  try {
    const result = await administerAccess(pool, action as AdministrativeAction, JSON.parse(input));
    if (file) await file.writeFile(JSON.stringify(result));
    console.log(JSON.stringify({ event: 'access_administration_complete', action }));
  } finally { await file?.close(); }
} catch {
  console.error(JSON.stringify({ event: 'access_administration_failed', hint: 'Check the explicit target, operator role and validated request. No secret is printed.' }));
  process.exitCode = 1;
} finally { await pool?.end(); }
