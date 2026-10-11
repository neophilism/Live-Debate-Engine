import { randomBytes } from 'node:crypto';
import { lstat, unlink, writeFile } from 'node:fs/promises';

const adminPassword = randomBytes(24).toString('hex');
const runtimePassword = randomBytes(24).toString('hex');
const identityPassword = randomBytes(24).toString('hex');
const configurations = [
  ['.env', [
    'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3000', 'LDE_ALLOW_INSECURE_LOCAL_DB=1',
    `DATABASE_URL=postgresql://lde_app_local:${runtimePassword}@127.0.0.1:55432/lde_dev`,
    `LDE_IDENTITY_DATABASE_URL=postgresql://lde_auth_local:${identityPassword}@127.0.0.1:55432/lde_dev`,
    'LDE_IDENTITY_ENABLED=1', 'LDE_IDENTITY_ORIGIN=http://127.0.0.1:3000',
    `LDE_IDENTITY_SECRET=${randomBytes(48).toString('base64url')}`,
    'LDE_IDENTITY_MAIL_MODE=local-file', '',
  ].join('\n')],
  ['.env.migrations', [
    'NODE_ENV=development', 'LDE_ALLOW_INSECURE_LOCAL_DB=1', `LDE_LOCAL_DB_PASSWORD=${adminPassword}`,
    `DATABASE_URL_UNPOOLED=postgresql://lde_dev:${adminPassword}@127.0.0.1:55432/lde_dev`, '',
  ].join('\n')],
];
const created = [];
try {
  for (const [name] of configurations) {
    try { await lstat(name); throw new Error('EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const [name, contents] of configurations) { await writeFile(name, contents, { flag: 'wx', mode: 0o600 }); created.push(name); }
  console.log('Created private runtime and migration configuration. No cloud resource was accessed.');
} catch {
  for (const name of created) await unlink(name).catch(() => {});
  console.error('Local setup failed; pre-existing files were preserved. Check private configuration paths.'); process.exitCode = 1;
}
