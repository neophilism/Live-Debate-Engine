import { array, boolean, code, digest, enumeration, identifier, integer, literal, nullable, object, refine, text, timestamp, type Parsed, type Parser } from './validation.js';
import { moneyParser } from './money.js';

export const TENANT_KINDS = ['tenant', 'series', 'motion', 'participant', 'team', 'ruleset', 'tournament'] as const;
export const EVENT_KINDS = ['event', 'assignment', 'contract', 'session', 'poll', 'ballot', 'scorecard', 'audience-verdict', 'judges-verdict', 'advancement-decision', 'prize-obligation', 'tournament-match', 'dispute'] as const;
export const ENTITY_KINDS = [...TENANT_KINDS, ...EVENT_KINDS] as const;
export type EntityKind = typeof ENTITY_KINDS[number];
export const entityKind = enumeration(ENTITY_KINDS);
export const ROLES = ['organizer', 'producer', 'moderator', 'timekeeper', 'debater', 'judge', 'audience', 'finance', 'oversight'] as const;
export const PHASES = ['preparation', 'readiness', 'pre-vote', 'openings', 'discussion', 'questions', 'closings', 'post-vote', 'verification', 'announcement', 'closed', 'cancelled'] as const;
export const side = enumeration(['for', 'against'] as const);
export const outcome = enumeration(['for', 'against', 'tie', 'inconclusive'] as const);

const referenceFields = {
  refType: literal('snapshot'), tenantId: identifier('tenant'), entityId: identifier('entity'),
  eventId: nullable(identifier('event')), snapshotId: identifier('snapshot'), revision: integer(1),
};
export const anyReference = object({ ...referenceFields, kind: entityKind });
export type SnapshotReference = Parsed<typeof anyReference>;
export function reference<const K extends EntityKind>(kind: K) { return object({ ...referenceFields, kind: literal(kind) }); }
export function referenceList<const K extends EntityKind>(kind: K, min = 0, max = 100): Parser<readonly Parsed<ReturnType<typeof reference<K>>>[]> {
  return refine(array(reference(kind), min, max), (refs) => new Set(refs.map((ref) => ref.entityId)).size === refs.length, 'Duplicate referenced entity');
}

const criterion = object({ code, label: text(1, 120), weightBps: integer(1, 10000), minimum: integer(0, 10000), maximum: integer(1, 10000) });
const rubric = refine(array(criterion, 1, 20), (rows) => rows.reduce((sum, row) => sum + row.weightBps, 0) === 10000 && rows.every((row) => row.maximum > row.minimum) && new Set(rows.map((row) => row.code)).size === rows.length, 'Invalid rubric weights, bounds or repeated criterion');
const rational = object({ numerator: integer(0, 1000000000), denominator: integer(1, 1000000000) });
const counts = object({ for: integer(0, 1000000000), against: integer(0, 1000000000), undecided: integer(0, 1000000000) });
const scoreEntry = object({ side, criterion: code, score: rational });
const scoreEntries = refine(array(scoreEntry, 1, 40), (rows) => new Set(rows.map((row) => `${row.side}:${row.criterion}`)).size === rows.length, 'Repeated scorecard criterion');
const timeZone = refine(text(1, 100), (zone) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}, 'Unsupported time zone');

export const dataParsers = {
  tenant: object({ name: text(), slug: code }),
  series: object({ name: text() }),
  motion: object({ text: text(1, 20000) }),
  participant: object({ publicProfileObjectId: identifier('protected-object') }),
  team: object({ name: text(), members: referenceList('participant', 1, 8) }),
  ruleset: object({
    name: text(), rubric,
    timing: object({ openingPerSideSeconds: integer(1, 7200), discussionSeconds: integer(1, 14400), questionsSeconds: integer(1, 14400), closingPerSideSeconds: integer(1, 7200) }),
    electorate: object({ cohort: literal('paired-valid'), denominator: literal('all-valid-including-undecided'), channels: enumeration(['separate', 'combined'] as const), interimDisclosure: literal(false) }),
    judging: object({ mode: enumeration(['human', 'advisory', 'hybrid', 'ai'] as const), aggregation: enumeration(['mean', 'sum', 'majority'] as const), requiredSeats: integer(1, 21) }),
    standardPrize: object({ audienceShareBps: literal(5000), judgesShareBps: literal(5000), tiePolicy: enumeration(['split-share', 'review'] as const) }),
    advancement: object({ primary: literal('audience'), audienceTie: enumeration(['judges', 'review', 'rematch'] as const) }),
    deadlines: object({ aiReviewHours: integer(1, 8760), outcomeDisputeHours: integer(1, 8760), paymentTargetDays: integer(1, 3650), paymentDeadlineDays: integer(1, 3650) }),
  }),
  event: object({ title: text(), seriesRef: nullable(reference('series')), motionRef: reference('motion'), rulesetRef: reference('ruleset'), format: enumeration(['standalone', 'tournament'] as const), mode: enumeration(['in-person', 'remote', 'hybrid'] as const) }),
  assignment: refine(object({ principalId: identifier('principal'), role: enumeration(ROLES), teamRef: nullable(reference('team')) }), (value) => value.role === 'debater' ? value.teamRef !== null : value.teamRef === null, 'Only a debater assignment has a team'),
  contract: refine(object({ motionRef: reference('motion'), rulesetRef: reference('ruleset'), forTeamRef: reference('team'), againstTeamRef: reference('team'), prizeBudget: moneyParser, startsAt: timestamp, timeZone, publication: enumeration(['live', 'embargoed'] as const), embargoUntil: nullable(timestamp) }), (value) => value.forTeamRef.entityId !== value.againstTeamRef.entityId && (value.publication === 'embargoed' ? value.embargoUntil !== null && value.embargoUntil >= value.startsAt : value.embargoUntil === null), 'Invalid opposing teams or embargo policy'),
  session: object({ contractRef: reference('contract'), phase: enumeration(PHASES) }),
  poll: refine(object({ motionRef: reference('motion'), round: enumeration(['pre', 'post'] as const), state: enumeration(['scheduled', 'open', 'closed'] as const), opensAt: timestamp, closesAt: timestamp }), (value) => value.closesAt > value.opensAt, 'Poll window must have positive duration'),
  ballot: object({ basis: literal('sealed-ballot'), pollRef: reference('poll'), voterPseudonymDigest: digest, encryptedObjectId: identifier('protected-object') }),
  scorecard: object({ judgeAssignmentRef: reference('assignment'), contractRef: reference('contract'), entries: scoreEntries, final: boolean, encryptedNotesObjectId: nullable(identifier('protected-object')) }),
  'audience-verdict': object({ basis: literal('audience-swing'), prePollRef: reference('poll'), postPollRef: reference('poll'), preCounts: counts, postCounts: counts, electorateDigest: digest, decision: outcome }),
  'judges-verdict': object({ basis: literal('judges-rubric'), scorecardRefs: referenceList('scorecard', 1, 21), forScore: rational, againstScore: rational, decision: outcome }),
  'advancement-decision': object({ basis: literal('advancement'), audienceVerdictRef: reference('audience-verdict'), judgesVerdictRef: nullable(reference('judges-verdict')), selectedSide: nullable(side), reason: enumeration(['audience', 'judges-tiebreak', 'review', 'rematch'] as const) }),
  'prize-obligation': object({ basis: literal('prize-obligation'), sourceRef: refine(anyReference, (ref) => ['audience-verdict', 'judges-verdict', 'advancement-decision'].includes(ref.kind), 'Invalid prize source kind'), recipientRef: reference('participant'), amount: moneyParser, status: enumeration(['proposed', 'approved', 'held', 'settled', 'forfeited'] as const) }),
  tournament: object({ name: text(), teams: referenceList('team', 2, 64), placementBudget: moneyParser }),
  'tournament-match': refine(object({ tournamentRef: reference('tournament'), round: integer(1, 16), slot: integer(1, 64), forTeamRef: nullable(reference('team')), againstTeamRef: nullable(reference('team')) }), (value) => !value.forTeamRef || !value.againstTeamRef || value.forTeamRef.entityId !== value.againstTeamRef.entityId, 'A team cannot face itself'),
  dispute: object({ subjectRef: refine(anyReference, (ref) => ['audience-verdict', 'judges-verdict', 'advancement-decision', 'scorecard', 'prize-obligation'].includes(ref.kind), 'Invalid dispute subject kind'), submittedByPrincipalId: identifier('principal'), reason: enumeration(['counting-error', 'scoring-error', 'eligibility', 'conduct', 'technical-error'] as const), evidenceObjectIds: array(identifier('protected-object'), 0, 100), status: enumeration(['open', 'reviewing', 'resolved'] as const) }),
} as const;

export type DomainData = { readonly [K in EntityKind]: Parsed<typeof dataParsers[K]> };
export type AudienceVerdict = DomainData['audience-verdict'];
export type JudgesVerdict = DomainData['judges-verdict'];
export type AdvancementDecision = DomainData['advancement-decision'];
export type PrizeObligation = DomainData['prize-obligation'];

/** Validation only; this does not authorize state changes, compute verdicts or qualify AI. */
export function parseData<K extends EntityKind>(kind: K, value: unknown): DomainData[K] {
  const parser = dataParsers[kind];
  return parser(value) as DomainData[K];
}
