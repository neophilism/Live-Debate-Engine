import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/setup-local.mjs', import.meta.url));
test('local setup creates private random configuration and never overwrites it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lde-local-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const file = path.join(directory, '.env');
  const content = await readFile(file, 'utf8');
  const password = content.match(/^LDE_LOCAL_DB_PASSWORD=([a-f0-9]{48})$/m)?.[1];
  assert.ok(password);
  assert.ok(!result.stdout.includes(password));
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  const second = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
  assert.equal(second.status, 1);
  assert.equal(await readFile(file, 'utf8'), content);
});
