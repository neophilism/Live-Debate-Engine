import { materialRuleset, type MaterialRuleset } from '../../contracts/src/domain.js';

/** Source-manual profile. These defaults are draft policy choices, never operational approval. */
export function sourceManualProfile(name = 'Standard motion debate'): MaterialRuleset {
  return materialRuleset({
    materialVersion: 2, profile: 'motion-debate-v1', name, amendmentReason: null,
    rubric: [
      ['argument', 'Argument quality and evidence', 3000], ['logic', 'Logical clarity and organization', 2000],
      ['delivery', 'Rhetorical effectiveness and delivery', 2000], ['civility', 'Civility and decorum', 1000],
      ['rebuttal', 'Refutation and rebuttal', 1000], ['responsiveness', 'Flexibility and responsiveness', 1000],
    ].map(([code, label, weightBps]) => ({ code, label, weightBps, minimum: 0, maximum: 10 })),
    timing: { openingPerSideSeconds: 420, discussionSeconds: 1500, questionsSeconds: 1200, closingPerSideSeconds: 180 },
    electorate: { cohort: 'paired-valid', denominator: 'all-valid-including-undecided', channels: 'separate', interimDisclosure: false },
    judging: { mode: 'human', aggregation: 'mean', requiredSeats: 3 },
    standardPrize: { audienceShareBps: 5000, judgesShareBps: 5000, tiePolicy: 'split-share' },
    advancement: { primary: 'audience', audienceTie: 'judges' },
    deadlines: { aiReviewHours: 24, outcomeDisputeHours: 48, paymentTargetDays: 30, paymentDeadlineDays: 60 },
    voting: { preWindowSeconds: 120, postWindowSeconds: 120, remoteDelaySeconds: 0, lateArrival: 'spectator-only', missingPost: 'exclude-unpaired', choices: ['for', 'against', 'undecided'] },
    conduct: { graceSeconds: 10, noNewClosingArguments: true, noOutsideCoaching: true },
    adjustments: { penaltyMaxPerFinding: 2, penaltyTotalCap: 10, bonusMaxPerFinding: 2, bonusTotalCap: 4, evidenceRequired: true, noDoubleCounting: true },
    judgesPrizeAllocation: 'winner-take-all', judgeWeighting: 'equal', teamPrizeSplit: 'equal', judgesTie: 'split-share', inconclusive: 'hold-for-review', allSeatsRequired: true,
    competitorEntryFeeMinorUnits: '0',
  });
}
