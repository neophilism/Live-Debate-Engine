import type { DomainRecord } from '../../contracts/src/snapshot.js';
import type { MaterialRuleset } from '../../contracts/src/domain.js';
export type MaterialRecord = Readonly<{ snapshot: DomainRecord; contentHash: string; published?: boolean; invalidated?: boolean; offered?: boolean; accepted?: boolean; ownAcknowledgment?: boolean }>;
export type MaterialStatus = Readonly<{
  offered: boolean; accepted: boolean; basisCurrent: boolean; acknowledgments: number;
  requiredAcknowledgments: number; materialReady: boolean; acknowledgmentOpen: boolean;
  registrationOpen: false; competitionReady: false;
}>;
export type RulesetPage = Readonly<{ current: MaterialRecord | null; records: readonly MaterialRecord[]; pageSize: number; profile: MaterialRuleset }>;
export type ContractWorkspace = Readonly<{
  canManage: boolean; canAcknowledge: boolean; principalId: string;
  participantLinks: readonly { entityId: string; principalId: string }[];
  history: readonly MaterialRecord[]; choices: readonly MaterialRecord[];
  current: MaterialRecord | null; details: { motion: { text: string }; ruleset: MaterialRuleset } | null;
  status: MaterialStatus; pendingAmendment: boolean; viewingHistory: boolean; ownAcknowledgment: boolean;
}>;
