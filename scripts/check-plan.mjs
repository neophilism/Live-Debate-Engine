import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validatePlan(text) {
  const headings = [...text.matchAll(/^## ([EU]\d{2}) - ([^\n]+)$/gm)];
  const expected = [...Array.from({ length: 50 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`), ...Array.from({ length: 4 }, (_, i) => `U${String(i + 1).padStart(2, '0')}`)];
  const nodes = new Map();
  for (let i = 0; i < headings.length; i += 1) {
    const [heading, id, title] = headings[i];
    if (nodes.has(id)) throw new Error(`Duplicate plan ID: ${id}`);
    const body = text.slice(headings[i].index + heading.length, headings[i + 1]?.index ?? text.length);
    const dependencyLine = body.match(/^Depends: (.+)$/m)?.[1];
    if (!dependencyLine || !/^Scope: .{20,}$/m.test(body) || !/^Gate: .{20,}$/m.test(body)) throw new Error(`Incomplete plan step: ${id}`);
    const dependencies = dependencyLine === 'none' ? [] : dependencyLine.split(', ');
    if (new Set(dependencies).size !== dependencies.length) throw new Error(`Duplicate dependency: ${id}`);
    nodes.set(id, { id, title, dependencies });
  }
  if (nodes.size !== expected.length || expected.some((id) => !nodes.has(id))) throw new Error('Expected exactly E01-E50 and U01-U04');
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (!nodes.has(id)) throw new Error(`Unknown dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of nodes.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  if (!nodes.get('U01').dependencies.includes('E47') || !nodes.get('E48').dependencies.includes('U04')) throw new Error('Cross-repository release/pilot gates missing');
  return [...nodes.values()];
}

export function checkRepository(root = new URL('../', import.meta.url)) {
  const steps = validatePlan(readFileSync(new URL('docs/DEVELOPMENT_PLAN.md', root), 'utf8'));
  const requirements = readFileSync(new URL('docs/REQUIREMENTS.md', root), 'utf8');
  const rows = requirements.split('\n').filter((line) => /^\| R\d{2} \|/.test(line));
  if (rows.length !== 22 || new Set(rows.map((row) => row.split('|')[1].trim())).size !== 22) throw new Error('Expected 22 unique traceability groups');
  const ids = new Set(steps.map((step) => step.id));
  for (const row of rows) {
    const columns = row.split('|');
    const references = columns[4].trim().split(/\s+/);
    if (!references.length || references.some((id) => !ids.has(id)) || columns[5].trim().length < 15) throw new Error('Invalid traceability row');
  }
  const manifest = readFileSync(new URL('.exechub/project.yml', root), 'utf8');
  const counts = [...manifest.matchAll(/^ {4}prs: (\d+)$/gm)].map((match) => Number(match[1]));
  if (!/planned_prs: 50\b/.test(manifest) || !/approved: true\b/.test(manifest) || counts.reduce((a, b) => a + b, 0) !== 50) throw new Error('Engine Room count differs from approved engine roadmap');
  const map = JSON.parse(readFileSync(new URL('docs/pr-map.json', root), 'utf8'));
  if (map.schema_version !== 1 || map.repository !== 'neophilism/Live-Debate-Engine' || !Array.isArray(map.mappings)) throw new Error('Invalid PR mapping');
  const mapped = new Set();
  for (const entry of map.mappings) {
    if (!ids.has(entry.step) || !entry.step.startsWith('E') || !Number.isSafeInteger(entry.pr) || entry.pr < 1 || mapped.has(entry.step)) throw new Error('Invalid actual PR mapping entry');
    mapped.add(entry.step);
  }
  return { engineSteps: 50, brandedSteps: 4, traceabilityGroups: rows.length, mappedSteps: mapped.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(checkRepository())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
