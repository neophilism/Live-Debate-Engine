import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const password = randomBytes(24).toString('hex');
const contents = [
  'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3000', 'LDE_ALLOW_INSECURE_LOCAL_DB=1',
  `LDE_LOCAL_DB_PASSWORD=${password}`,
  `DATABASE_URL=postgresql://lde_dev:${password}@127.0.0.1:55432/lde_dev`,
  `DATABASE_URL_UNPOOLED=postgresql://lde_dev:${password}@127.0.0.1:55432/lde_dev`, '',
].join('\n');
try {
  await writeFile('.env', contents, { flag: 'wx', mode: 0o600 });
  console.log('Created private local .env. No cloud resource was accessed.');
} catch (error) {
  if (error.code === 'EEXIST') { console.error('Existing .env preserved; no changes made.'); process.exitCode = 1; }
  else throw error;
}
