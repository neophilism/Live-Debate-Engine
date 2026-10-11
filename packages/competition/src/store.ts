import type { Pool } from 'pg';
import { withCredential } from '../../identity/src/broker.js';
import { materialContract, materialRuleset } from '../../contracts/src/domain.js';
import { snapshotOf } from '../../contracts/src/snapshot.js';
import { dataObject, digest, identifier, integer, literal, object } from '../../contracts/src/validation.js';
import { sourceManualProfile } from './model.js';
import type { ContractWorkspace, RulesetPage } from './types.js';
export const saveRulesetInput = object({ commandId: identifier('command'), expectedRevision: integer(0, 999), data: materialRuleset });
export const saveContractInput = object({ commandId: identifier('command'), expectedRevision: integer(0, 999), data: materialContract });
export const publishInput = object({ commandId: identifier('command'), snapshotId: identifier('snapshot') });
export const acknowledgeInput = object({ commandId: identifier('command'), snapshotId: identifier('snapshot'), contentHash: digest, accepted: literal(true) });
function verifyRecords(result: unknown): Record<string, unknown> {
  const value = dataObject(result);
  for (const key of ['records', 'history', 'choices', 'current']) {
    const input = value[key];
    for (const item of Array.isArray(input) ? input : input == null ? [] : [input]) {
      const row = dataObject(item); const snapshot = snapshotOf(row.snapshot);
      if (snapshot.contentHash !== row.contentHash) throw new Error('Material snapshot integrity failure');
    }
  }
  if (value.details !== null && value.details !== undefined) {
    const details = dataObject(value.details); const motionRecord = dataObject(details.motionRecord); const rulesetRecord = dataObject(details.rulesetRecord);
    const motion = snapshotOf(motionRecord.snapshot); const rules = snapshotOf(rulesetRecord.snapshot);
    if (motion.contentHash !== motionRecord.contentHash || rules.contentHash !== rulesetRecord.contentHash || motion.record.kind !== 'motion' || rules.record.kind !== 'ruleset') throw new Error('Referenced material integrity failure');
    const current = snapshotOf(dataObject(value.current).snapshot);
    const contract = materialContract(current.record.data);
    if (current.record.kind !== 'contract' || contract.motionRef.snapshotId !== motion.record.snapshotId || contract.rulesetRef.snapshotId !== rules.record.snapshotId) throw new Error('Material reference mismatch');
    value.details = { motion: motion.record.data, ruleset: materialRuleset(rules.record.data) };
  }
  return value;
}
/** Fixed credential-bound functions. No client-supplied principal, raw SQL or generic snapshot writer. */
export class CompetitionStore {
  constructor(private readonly pool: Pool) {}
  private async call(credential: string, sql: string, values: readonly unknown[]) {
    return withCredential(this.pool, credential, async (client) => {
      const result = await client.query<{ result: unknown }>(sql, [...values]);
      return verifyRecords(result.rows[0]?.result);
    });
  }
  async rulesets(credential: string, tenantId: string, entityId: string | null = null, beforeRevision = 2147483647): Promise<RulesetPage> {
    const result = await this.call(credential, 'SELECT lde_competition.ruleset_records($1,$2,$3) AS result',
      [identifier('tenant')(tenantId), entityId === null ? null : identifier('entity')(entityId), integer(1)(beforeRevision)]);
    return { ...result, profile: sourceManualProfile() } as RulesetPage;
  }
  async workspace(credential: string, tenantId: string, eventId: string, beforeRevision = 2147483647, selectedSnapshot: string | null = null): Promise<ContractWorkspace> {
    return await this.call(credential, 'SELECT lde_competition.contract_workspace($1,$2,$3,$4) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), integer(1)(beforeRevision), selectedSnapshot === null ? null : identifier('snapshot')(selectedSnapshot)]) as ContractWorkspace;
  }
  async saveRuleset(credential: string, tenantId: string, entityId: string, input: unknown) {
    const body = saveRulesetInput(input);
    return this.call(credential, 'SELECT lde_competition.save_ruleset($1,$2,$3,$4,$5) AS result',
      [identifier('tenant')(tenantId), identifier('entity')(entityId), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  async publishRuleset(credential: string, tenantId: string, entityId: string, input: unknown) {
    const body = publishInput(input);
    return this.call(credential, 'SELECT lde_competition.publish_ruleset($1,$2,$3,$4) AS result',
      [identifier('tenant')(tenantId), identifier('entity')(entityId), body.snapshotId, body.commandId]);
  }
  async saveContract(credential: string, tenantId: string, eventId: string, input: unknown) {
    const body = saveContractInput(input);
    return this.call(credential, 'SELECT lde_competition.save_contract($1,$2,$3,$4,$5) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), body.expectedRevision, JSON.stringify(body.data), body.commandId]);
  }
  async offerContract(credential: string, tenantId: string, eventId: string, input: unknown) {
    const body = publishInput(input);
    return this.call(credential, 'SELECT lde_competition.offer_contract($1,$2,$3,$4) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), body.snapshotId, body.commandId]);
  }
  async acknowledge(credential: string, tenantId: string, eventId: string, input: unknown) {
    const body = acknowledgeInput(input);
    return this.call(credential, 'SELECT lde_competition.acknowledge_contract($1,$2,$3,$4,$5,$6) AS result',
      [identifier('tenant')(tenantId), identifier('event')(eventId), body.snapshotId, body.contentHash, body.accepted, body.commandId]);
  }
}
