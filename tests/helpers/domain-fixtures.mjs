import { initialSnapshot, referenceOf } from '../../dist/packages/contracts/src/snapshot.js';
import { EVENT_KINDS } from '../../dist/packages/contracts/src/domain.js';

export const uuid = (number) => `${number.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
export const WHEN = '2026-10-11T09:00:00.000Z';
export const usd = (minorUnits) => ({ currency: 'USD', minorUnits, exponent: 2 });
export function fixtureSet(tenantId = uuid(1), seed = 100) {
  let next = seed;
  const eventId = uuid(seed + 90);
  const created = [];
  const add = (kind, data, entityId = uuid(next++)) => {
    const snapshot = initialSnapshot(kind, { tenantId, entityId: kind === 'tenant' ? tenantId : kind === 'event' ? eventId : entityId, eventId: EVENT_KINDS.includes(kind) ? eventId : null }, data, { recordedAt: WHEN });
    created.push(snapshot);
    return snapshot;
  };
  const tenant = add('tenant', { name: 'Synthetic tenant', slug: 'synthetic-tenant' });
  const series = add('series', { name: 'Synthetic series' });
  const motion = add('motion', { text: 'This is a synthetic test motion.' });
  const participant = add('participant', { publicProfileObjectId: uuid(next++) });
  const participant2 = add('participant', { publicProfileObjectId: uuid(next++) });
  const team = add('team', { name: 'Synthetic For', members: [referenceOf(participant)] });
  const team2 = add('team', { name: 'Synthetic Against', members: [referenceOf(participant2)] });
  const ruleset = add('ruleset', {
    name: 'Synthetic structural test profile',
    rubric: [['argument', 3000], ['logic', 2000], ['delivery', 2000], ['civility', 1000], ['rebuttal', 1000], ['responsiveness', 1000]].map(([code, weightBps]) => ({ code, label: code, weightBps, minimum: 0, maximum: 10 })),
    timing: { openingPerSideSeconds: 420, discussionSeconds: 1500, questionsSeconds: 1200, closingPerSideSeconds: 180 },
    electorate: { cohort: 'paired-valid', denominator: 'all-valid-including-undecided', channels: 'separate', interimDisclosure: false },
    judging: { mode: 'human', aggregation: 'mean', requiredSeats: 1 },
    standardPrize: { audienceShareBps: 5000, judgesShareBps: 5000, tiePolicy: 'split-share' },
    advancement: { primary: 'audience', audienceTie: 'judges' },
    deadlines: { aiReviewHours: 24, outcomeDisputeHours: 48, paymentTargetDays: 30, paymentDeadlineDays: 60 },
  });
  const event = add('event', { title: 'Synthetic event', seriesRef: referenceOf(series), motionRef: referenceOf(motion), rulesetRef: referenceOf(ruleset), format: 'standalone', mode: 'remote' });
  const assignment = add('assignment', { principalId: uuid(900), role: 'judge', teamRef: null });
  const contract = add('contract', { motionRef: referenceOf(motion), rulesetRef: referenceOf(ruleset), forTeamRef: referenceOf(team), againstTeamRef: referenceOf(team2), prizeBudget: usd('1800000'), startsAt: WHEN, timeZone: 'America/New_York', publication: 'live', embargoUntil: null });
  const session = add('session', { contractRef: referenceOf(contract), phase: 'preparation' });
  const poll = add('poll', { motionRef: referenceOf(motion), round: 'pre', state: 'scheduled', opensAt: WHEN, closesAt: '2026-10-11T09:02:00.000Z' });
  const postPoll = add('poll', { motionRef: referenceOf(motion), round: 'post', state: 'scheduled', opensAt: '2026-10-11T10:00:00.000Z', closesAt: '2026-10-11T10:02:00.000Z' });
  const ballot = add('ballot', { basis: 'sealed-ballot', pollRef: referenceOf(poll), voterPseudonymDigest: 'a'.repeat(64), encryptedObjectId: uuid(next++) });
  const scorecard = add('scorecard', { judgeAssignmentRef: referenceOf(assignment), contractRef: referenceOf(contract), entries: ['for', 'against'].flatMap((side) => ruleset.record.data.rubric.map(({ code }) => ({ side, criterion: code, score: { numerator: side === 'for' ? 8 : 9, denominator: 1 } }))), final: true, encryptedNotesObjectId: null });
  const audience = add('audience-verdict', { basis: 'audience-swing', prePollRef: referenceOf(poll), postPollRef: referenceOf(postPoll), preCounts: { for: 40, against: 50, undecided: 10 }, postCounts: { for: 45, against: 47, undecided: 8 }, electorateDigest: 'b'.repeat(64), decision: 'for' });
  const judges = add('judges-verdict', { basis: 'judges-rubric', scorecardRefs: [referenceOf(scorecard)], forScore: { numerator: 80, denominator: 1 }, againstScore: { numerator: 90, denominator: 1 }, decision: 'against' });
  const advancement = add('advancement-decision', { basis: 'advancement', audienceVerdictRef: referenceOf(audience), judgesVerdictRef: referenceOf(judges), selectedSide: 'for', reason: 'audience' });
  const prize = add('prize-obligation', { basis: 'prize-obligation', sourceRef: referenceOf(audience), recipientRef: referenceOf(participant), amount: usd('900000'), status: 'proposed' });
  const tournament = add('tournament', { name: 'Synthetic structural bracket', teams: [referenceOf(team), referenceOf(team2)], placementBudget: usd('10000000') });
  // This is a collection of structural fixtures, not an officially conducted competition.
  const match = add('tournament-match', { tournamentRef: referenceOf(tournament), round: 1, slot: 1, forTeamRef: referenceOf(team), againstTeamRef: referenceOf(team2) });
  const dispute = add('dispute', { subjectRef: referenceOf(audience), submittedByPrincipalId: uuid(900), reason: 'counting-error', evidenceObjectIds: [], status: 'open' });
  return { tenantId, eventId, created, tenant, series, motion, participant, participant2, team, team2, ruleset, event, assignment, contract, session, poll, postPoll, ballot, scorecard, audience, judges, advancement, prize, tournament, match, dispute };
}
