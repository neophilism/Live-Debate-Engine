import { canonicalJson } from '../../contracts/src/canonical-json.js';
import { materialContract, materialRuleset, entityKind, parseData } from '../../contracts/src/domain.js';
import { dataObject, digest, identifier, integer, timestamp } from '../../contracts/src/validation.js';
import type { MaterialRecord, ContractWorkspace, RulesetPage } from '../../competition/src/types.js';

/** Verify the displayed immutable record in the browser before enabling material actions. */
export async function readMaterialRecord(input: unknown): Promise<MaterialRecord> {
  const row = dataObject(input); const record = dataObject(row.snapshot); const expected = digest(row.contentHash);
  const kind = entityKind(record.kind); identifier('tenant')(record.tenantId); identifier('entity')(record.entityId);
  identifier('snapshot')(record.snapshotId); integer(1)(record.revision); timestamp(record.recordedAt); parseData(kind, record.data);
  const bytes = new TextEncoder().encode(canonicalJson(record));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (expected !== hash) throw new Error('The material record failed its integrity check. No action was submitted.');
  for (const key of ['published', 'accepted', 'invalidated']) if (typeof row[key] !== 'boolean') throw new Error('Material publication state is unavailable.');
  return row as MaterialRecord;
}
export async function readRulesets(input: unknown): Promise<RulesetPage> {
  const row = dataObject(input); const records = row.records;
  if (!Array.isArray(records) || records.length > 50) throw new Error('The ruleset list is unavailable.');
  return { current: row.current === null ? null : await readMaterialRecord(row.current), records: await Promise.all(records.map(readMaterialRecord)), profile: materialRuleset(row.profile), pageSize: 50 };
}
export async function readContractWorkspace(input: unknown): Promise<ContractWorkspace> {
  const row = dataObject(input); const status = dataObject(row.status);
  for (const field of ['canManage', 'canAcknowledge', 'pendingAmendment', 'viewingHistory', 'ownAcknowledgment']) if (typeof row[field] !== 'boolean') throw new Error('The contract workspace is unavailable.');
  for (const field of ['offered', 'accepted', 'basisCurrent', 'materialReady', 'acknowledgmentOpen']) if (typeof status[field] !== 'boolean') throw new Error('Contract status is unavailable.');
  if (status.registrationOpen !== false || status.competitionReady !== false) throw new Error('Unexpected competition authorization.');
  integer(0, 16)(status.acknowledgments); integer(0, 16)(status.requiredAcknowledgments); identifier('principal')(row.principalId);
  if (!Array.isArray(row.history) || row.history.length > 50 || !Array.isArray(row.choices) || row.choices.length > 100 || !Array.isArray(row.participantLinks)) throw new Error('The material list is unavailable.');
  const current = row.current === null ? null : await readMaterialRecord(row.current);
  if (current) materialContract(current.snapshot.data);
  const details = row.details === null ? null : dataObject(row.details);
  if (details) { materialRuleset(details.ruleset); parseData('motion', details.motion); }
  return { ...row, current, history: await Promise.all(row.history.map(readMaterialRecord)), choices: await Promise.all(row.choices.map(readMaterialRecord)) } as unknown as ContractWorkspace;
}
