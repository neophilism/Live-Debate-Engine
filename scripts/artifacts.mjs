import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

await mkdir('artifacts', { recursive: true });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const lockHash = createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', 'artifacts'], { stdio: 'inherit' });
execFileSync('git', ['archive', '--format=tar', '--output=artifacts/source.tar', 'HEAD']);
const sbom = execFileSync('npm', ['sbom', '--sbom-format=cyclonedx'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
await writeFile('artifacts/sbom.cdx.json', sbom);
await writeFile('artifacts/build.json', `${JSON.stringify({ sha, node: process.version, lockHash, stage: 'foundation', productionVerified: false }, null, 2)}\n`);
